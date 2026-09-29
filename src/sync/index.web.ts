/**
 * Web: keeps this browser's data in sync with the encrypted copy on the
 * hosted site (Cloudflare Worker at /api). Running locally (pnpm web) there is
 * no /api, so sync reports 'unavailable' and the app works as before.
 */
import { getSnapshot, onLocalChange, replaceSnapshot } from '../db/database.web';
import { idbDelete, idbGet, idbSet } from './idb';
import { createSyncEngine, type Api, type ApiResult } from './engine';
import type { SyncState } from './types';

export type { SyncState, SyncStatus } from './types';

const META_KEY = 'finance-overview:sync';

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' };
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      // An expired login makes Cloudflare Access redirect to its login page
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return { kind: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error', message: 'Could not reach the server.' } as ApiResult<T>;
  }
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return { kind: 'signed_out' };
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  if (!isJson) return { kind: 'unavailable' };
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; revision?: number };
  if (res.status === 409) return { kind: 'conflict', revision: data.revision ?? 0 };
  if (res.status === 401) return { kind: 'error', message: data.error ?? 'Not logged in.' };
  if (!res.ok) return { kind: 'error', message: data.error ?? `Server error (${res.status})` };
  return { kind: 'ok', data };
}

const api: Api = {
  meta: () => call('GET', '/api/vault/meta'),
  get: () => call('GET', '/api/vault'),
  put: (base_revision, vault) => call('PUT', '/api/vault', { base_revision, vault }),
};

const engine = createSyncEngine({
  api,
  local: { getSnapshot, replaceSnapshot, onLocalChange },
  kv: { get: idbGet, set: idbSet, delete: idbDelete },
  meta: {
    load() {
      try {
        const raw = localStorage.getItem(META_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    save(m) {
      try {
        localStorage.setItem(META_KEY, JSON.stringify(m));
      } catch {
        // Bookkeeping only; worst case the next sync compares everything again
      }
    },
  },
});

let started = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;


export const getSyncState = (): SyncState => engine.getState();
export const subscribeSync = (cb: (s: SyncState) => void) => engine.subscribe(cb);
export const subscribeRemoteData = (cb: () => void) => engine.onRemoteData(cb);

export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Upload shortly after changes made here
  onLocalChange(() => {
    if (!engine.hasKey()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void engine.sync(), 1500);
  });
  // Pick up changes from other devices when coming back to the app, going online, and every minute
  const soon = () => {
    const { status } = engine.getState();
    if (status === 'offline' || status === 'error') void engine.init();
    else if (engine.hasKey()) void engine.sync();
  };
  window.addEventListener('focus', soon);
  window.addEventListener('online', soon);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') soon();
  });
  setInterval(soon, 60_000);

  // Ask the browser not to clear this site's data when space runs low
  void navigator.storage?.persist?.().catch(() => false);

  void engine.init();
}

export const setupSync = (passphrase: string, remember: boolean) => engine.setup(passphrase, remember);
export const unlockSync = (passphrase: string, remember: boolean) => engine.unlock(passphrase, remember);
export const syncNow = () => engine.sync();
export const forgetOnThisDevice = () => engine.forgetOnThisDevice();
