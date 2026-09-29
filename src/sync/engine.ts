/**
 * The sync engine, independent of the browser so it can be tested.
 *
 * Every device keeps a full local copy (works offline). The server holds one
 * encrypted copy with a revision number. Syncing:
 * 1. If the server has a newer revision: download, decrypt, merge with the
 *    local copy (three-way, using the last synced copy as the base), save.
 * 2. If the merged result or local changes differ from the server: encrypt and
 *    upload, based on the revision we saw. If another device uploaded in the
 *    meantime the server says "conflict" and we simply go round again.
 */
import type { Data } from '../db/database.web';
import { mergeData, sameData } from '../lib/syncMerge';
import { ITERATIONS, WrongPassphraseError, decryptJson, deriveKey, encryptJson, keyForVault, newSalt } from '../lib/vaultCrypto';
import type { SyncState } from './types';

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'conflict'; revision: number }
  | { kind: 'unavailable' }
  | { kind: 'offline' }
  | { kind: 'signed_out' }
  | { kind: 'error'; message: string };

export type Api = {
  meta(): Promise<ApiResult<{ revision: number; vault_id?: string | null; email?: string; updated_at?: string | null }>>;
  get(): Promise<ApiResult<{ revision: number; vault_id?: string | null; vault: string | null }>>;
  put(baseRevision: number, vault: string): Promise<ApiResult<{ revision: number; vault_id?: string | null }>>;
};

export type LocalStore = {
  getSnapshot(): Data;
  replaceSnapshot(d: Data): void;
  onLocalChange(cb: () => void): () => void;
};

export type KeyValue = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

type KeyInfo = { key: CryptoKey; salt: string; iterations: number };
type Meta = {
  /** Server revision this device last synced with */
  revision: number;
  /** Server's id for the stored data; a different id means it was removed and created again */
  vaultId?: string | null;
  dirty: boolean;
  lastSynced: string | null;
};

export type EngineDeps = {
  api: Api;
  local: LocalStore;
  kv: KeyValue;
  /** Small synchronous store for the sync bookkeeping (localStorage on web) */
  meta: { load(): Meta | null; save(m: Meta): void };
  iterations?: number;
  now?: () => Date;
};

export function createSyncEngine(deps: EngineDeps) {
  const iterations = deps.iterations ?? ITERATIONS;
  const now = deps.now ?? (() => new Date());
  let meta: Meta = deps.meta.load() ?? { revision: 0, dirty: false, lastSynced: null };
  let state: SyncState = { status: 'checking', lastSynced: meta.lastSynced, pending: meta.dirty };
  let keyInfo: KeyInfo | null = null;
  let changeCounter = 0;
  let running: Promise<void> | null = null;
  let again = false;
  const stateListeners = new Set<(s: SyncState) => void>();
  const dataListeners = new Set<() => void>();

  const setState = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch, lastSynced: meta.lastSynced, pending: meta.dirty };
    for (const l of stateListeners) l(state);
  };
  const saveMeta = (patch: Partial<Meta>) => {
    meta = { ...meta, ...patch };
    deps.meta.save(meta);
  };

  deps.local.onLocalChange(() => {
    changeCounter++;
    saveMeta({ dirty: true });
    setState({});
  });

  /** Maps a failed API call to a status. Returns true if it was a failure. */
  const failed = (r: ApiResult<unknown>): r is Exclude<ApiResult<unknown>, { kind: 'ok' } | { kind: 'conflict' }> => {
    if (r.kind === 'ok' || r.kind === 'conflict') return false;
    if (r.kind === 'error') setState({ status: 'error', message: r.message });
    else setState({ status: r.kind, message: undefined });
    return true;
  };

  /** For reads: anything but 'ok' is a failure (a read can't conflict). */
  const notOk = <T,>(r: ApiResult<T>): r is Exclude<ApiResult<T>, { kind: 'ok' }> => {
    if (r.kind === 'conflict') {
      setState({ status: 'error', message: 'Unexpected answer from the server.' });
      return true;
    }
    return failed(r);
  };

  async function upload(
    k: KeyInfo,
    data: Data,
    baseRevision: number,
    counterAtSnapshot: number,
  ): Promise<'ok' | 'conflict' | 'failed'> {
    const vault = await encryptJson(k.key, k.salt, data, k.iterations);
    const r = await deps.api.put(baseRevision, vault);
    if (r.kind === 'conflict') return 'conflict';
    if (failed(r)) return 'failed';
    await deps.kv.set('base', data);
    saveMeta({
      revision: r.data.revision,
      vaultId: r.data.vault_id ?? null,
      dirty: changeCounter !== counterAtSnapshot,
      lastSynced: now().toISOString(),
    });
    return 'ok';
  }

  async function syncOnce(): Promise<void> {
    const k = keyInfo; // stays the same for this run even if the key is forgotten meanwhile
    if (!k) return;
    setState({ status: 'syncing', message: undefined });
    for (let attempt = 0; attempt < 5; attempt++) {
      const m = await deps.api.meta();
      if (notOk(m)) return;
      const remoteRevision = m.data.revision;
      // Our last synced copy is only a valid base for the same stored data, at or before its current revision
      const trustBase =
        meta.revision > 0 && !!meta.vaultId && m.data.vault_id === meta.vaultId && remoteRevision >= meta.revision;

      if (remoteRevision === 0) {
        // Nothing on the server (never set up, or removed): upload this device's data
        const counter = changeCounter;
        const res = await upload(k, deps.local.getSnapshot(), 0, counter);
        if (res === 'conflict') continue;
        if (res === 'failed') return;
        if (!meta.dirty) return done();
        continue;
      }

      if (!trustBase || remoteRevision !== meta.revision) {
        const g = await deps.api.get();
        if (notOk(g)) return;
        if (!g.data.vault) continue;
        let remote: Data;
        try {
          remote = await decryptJson<Data>(k.key, g.data.vault);
        } catch (e) {
          if (e instanceof WrongPassphraseError) {
            await forget();
            setState({ status: 'locked', message: 'The passphrase changed on another device. Enter it again.' });
            return;
          }
          throw e;
        }
        const counter = changeCounter;
        const base = trustBase ? ((await deps.kv.get<Data>('base')) ?? null) : null;
        const merged = mergeData(base, deps.local.getSnapshot(), remote);
        deps.local.replaceSnapshot(merged);
        for (const l of dataListeners) l();
        if (sameData(merged, remote)) {
          await deps.kv.set('base', remote);
          saveMeta({
            revision: g.data.revision,
            vaultId: g.data.vault_id ?? null,
            dirty: changeCounter !== counter,
            lastSynced: now().toISOString(),
          });
          if (!meta.dirty) return done();
          continue;
        }
        const res = await upload(k, merged, g.data.revision, counter);
        if (res === 'conflict') continue;
        if (res === 'failed') return;
        if (!meta.dirty) return done();
        continue;
      }

      if (meta.dirty) {
        const counter = changeCounter;
        const res = await upload(k, deps.local.getSnapshot(), meta.revision, counter);
        if (res === 'conflict') continue;
        if (res === 'failed') return;
        if (!meta.dirty) return done();
        continue;
      }

      saveMeta({ lastSynced: now().toISOString() });
      return done();
    }
    // Kept running into other devices' uploads: leave it for the next round
    setState({ status: 'error', message: 'Other devices were syncing at the same time. Trying again shortly.' });
  }

  function done() {
    setState({ status: 'synced', message: undefined });
  }

  /** Runs one sync at a time; a request during a sync runs another one right after. */
  function sync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await syncOnce();
        } while (again && keyInfo);
      } catch (e) {
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  async function remember(info: KeyInfo, keep: boolean) {
    keyInfo = info;
    if (keep) await deps.kv.set('key', info);
    else await deps.kv.delete('key');
  }

  async function forget() {
    keyInfo = null;
    await deps.kv.delete('key');
  }

  return {
    getState: () => state,
    subscribe(cb: (s: SyncState) => void) {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    onRemoteData(cb: () => void) {
      dataListeners.add(cb);
      return () => dataListeners.delete(cb);
    },

    /** Checks the server and unlocks with a remembered key if there is one. */
    async init(): Promise<void> {
      if (!keyInfo) keyInfo = (await deps.kv.get<KeyInfo>('key').catch(() => undefined)) ?? null;
      setState({ status: 'checking' });
      const m = await deps.api.meta();
      if (notOk(m)) return;
      setState({ email: m.data.email });
      if (!keyInfo) {
        setState({ status: m.data.revision === 0 ? 'setup' : 'locked' });
        return;
      }
      await sync();
    },

    /** True once a key is available on this device (remembered or entered). */
    hasKey: () => keyInfo !== null,

    /** First device: choose a passphrase and upload this device's data. */
    async setup(passphrase: string, keep: boolean): Promise<void> {
      const m = await deps.api.meta();
      if (notOk(m)) throw new Error(state.message ?? 'Could not reach the server.');
      if (m.data.revision !== 0) {
        setState({ status: 'locked' });
        throw new Error('Sync is already set up. Enter the passphrase you chose on your other device.');
      }
      const salt = newSalt();
      await remember({ key: await deriveKey(passphrase, salt, iterations), salt, iterations }, keep);
      saveMeta({ revision: 0, vaultId: null, dirty: true });
      await sync();
    },

    /** Another device: enter the passphrase to download and merge the synced data. */
    async unlock(passphrase: string, keep: boolean): Promise<void> {
      const g = await deps.api.get();
      if (notOk(g)) throw new Error(state.message ?? 'Could not reach the server.');
      if (!g.data.vault) {
        setState({ status: 'setup' });
        throw new Error("There's no synced data yet. Choose a passphrase to set up sync.");
      }
      const info = await keyForVault(passphrase, g.data.vault);
      await decryptJson(info.key, g.data.vault); // throws WrongPassphraseError
      await remember(info, keep);
      await sync();
    },

    sync,

    async forgetOnThisDevice(): Promise<void> {
      await forget();
      setState({ status: 'locked', message: undefined });
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
