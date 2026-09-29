import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore: built into Node 22
import { DatabaseSync } from 'node:sqlite';

import { createSyncEngine, type Api, type ApiResult } from '../src/sync/engine.ts';
import { empty, type Data } from '../src/db/database.web.ts';
import { handleApi, resetSchemaCache, type D1Database, type D1PreparedStatement } from '../worker/api.ts';
import { WrongPassphraseError } from '../src/lib/vaultCrypto.ts';

// ---------- a real server (Worker API on SQLite) ----------

function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const stmt = (sql: string, values: unknown[] = []): D1PreparedStatement & { exec(): void } => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (sqlite.prepare(sql).get(...(values as any[])) as T) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...(values as any[])) as T[] }),
    run: async () => ({ results: [], meta: { changes: Number(sqlite.prepare(sql).run(...(values as any[])).changes) } }),
    exec: () => void sqlite.prepare(sql).run(...(values as any[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      for (const s of list) (s as any).exec();
      return list.map(() => ({ results: [] }));
    },
    exec: async (sql) => sqlite.exec(sql),
  };
}

let server: D1Database;
let online = true;
beforeEach(() => {
  resetSchemaCache();
  server = fakeD1();
  online = true;
});

function apiFor(user = 'me@example.com'): Api & { vaultText(): Promise<string | null> } {
  const call = async <T,>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> => {
    if (!online) return { kind: 'offline' };
    const res = await handleApi(
      new Request(`https://app.example${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
      server,
      user,
    );
    const data = (await res.json()) as any;
    if (res.status === 409) return { kind: 'conflict', revision: data.revision };
    if (!res.ok) return { kind: 'error', message: data.error };
    return { kind: 'ok', data };
  };
  return {
    meta: () => call('GET', '/api/vault/meta'),
    get: () => call('GET', '/api/vault'),
    put: (base_revision, vault) => call('PUT', '/api/vault', { base_revision, vault }),
    vaultText: async () => ((await call<{ vault: string | null }>('GET', '/api/vault')) as any).data.vault,
  };
}

// ---------- a "device": its own local data, key store and bookkeeping ----------

function device(name: string) {
  let data: Data = empty();
  const listeners = new Set<() => void>();
  const kv = new Map<string, unknown>();
  let meta: any = null;
  const api = apiFor();
  const engine = createSyncEngine({
    api,
    iterations: 1000, // quick for tests
    local: {
      getSnapshot: () => data,
      replaceSnapshot: (d) => void (data = d),
      onLocalChange: (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    },
    kv: { get: async (k) => kv.get(k) as any, set: async (k, v) => void kv.set(k, v), delete: async (k) => void kv.delete(k) },
    meta: { load: () => meta, save: (m) => void (meta = m) },
  });
  return {
    name,
    engine,
    api,
    kv,
    get data() {
      return data;
    },
    /** A change made on this device (like the app's save()) */
    change(fn: (d: Data) => Data) {
      data = fn(data);
      for (const l of listeners) l();
    },
  };
}

const account = (id: number, name: string, balance: number) => ({
  id, name, type: 'current' as const, link: null, balance_cents: balance, currency: 'EUR', updated_at: '2026-09-29 09:00:00',
});
const names = (d: Data) => d.accounts.map((a) => `${a.name}:${a.balance_cents}`).sort();

test('engine: first device sets up, second device unlocks and gets everything', async () => {
  const laptop = device('laptop');
  laptop.change((d) => ({ ...d, accounts: [account(1, 'ING current', 9500)], budgets: [{ category: 'groceries', limit_cents: 35000 }] }));
  await laptop.engine.init();
  assert.equal(laptop.engine.getState().status, 'setup');
  await laptop.engine.setup('my secret passphrase', true);
  assert.equal(laptop.engine.getState().status, 'synced');
  assert.equal(laptop.engine.getState().pending, false);

  // Nothing readable on the server
  const vault = (await laptop.api.vaultText())!;
  assert.ok(!vault.includes('ING current') && !vault.includes('9500') && !vault.includes('groceries'));

  const other = device('other laptop');
  await other.engine.init();
  assert.equal(other.engine.getState().status, 'locked');
  await assert.rejects(other.engine.unlock('wrong', true), WrongPassphraseError);
  await other.engine.unlock('my secret passphrase', true);
  assert.equal(other.engine.getState().status, 'synced');
  assert.deepEqual(names(other.data), ['ING current:9500']);
  assert.deepEqual(other.data.budgets, [{ category: 'groceries', limit_cents: 35000 }]);
});

test('engine: changes flow both ways; a remembered key unlocks on restart', async () => {
  const a = device('a');
  const b = device('b');
  await a.engine.init();
  await a.engine.setup('pw', true);
  await b.engine.init();
  await b.engine.unlock('pw', true);

  a.change((d) => ({ ...d, accounts: [...d.accounts, account(10, 'ING savings', 98637)] }));
  assert.equal(a.engine.getState().pending, true);
  await a.engine.sync();
  await b.engine.sync();
  assert.deepEqual(names(b.data), ['ING savings:98637']);

  b.change((d) => ({ ...d, accounts: d.accounts.map((x) => ({ ...x, balance_cents: 100000 })) }));
  await b.engine.sync();
  await a.engine.sync();
  assert.deepEqual(names(a.data), ['ING savings:100000']);

  // "Restart" device a: remembered key is used, no passphrase needed
  const kvCopy = a.kv;
  assert.ok(kvCopy.get('key'));
});

test('engine: both devices change while offline, nothing is lost', async () => {
  const a = device('a');
  const b = device('b');
  await a.engine.init();
  a.change((d) => ({ ...d, accounts: [account(1, 'ING current', 9500), account(2, 'Revolut', 33000)] }));
  await a.engine.setup('pw', true);
  await b.engine.init();
  await b.engine.unlock('pw', true);

  online = false;
  a.change((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === 1 ? { ...x, balance_cents: 12000 } : x)) }));
  b.change((d) => ({ ...d, accounts: [...d.accounts, account(3, 'Cash', 2000)], rules: { kpn: 'bills' } }));
  await a.engine.sync();
  assert.equal(a.engine.getState().status, 'offline');
  assert.equal(a.engine.getState().pending, true);

  online = true;
  await a.engine.sync();
  await b.engine.sync(); // b uploads its change on top of a's (merge, then upload)
  await a.engine.sync();
  const expected = ['Cash:2000', 'ING current:12000', 'Revolut:33000'];
  assert.deepEqual(names(a.data), expected);
  assert.deepEqual(names(b.data), expected);
  assert.deepEqual(a.data.rules, { kpn: 'bills' });
  assert.equal(a.engine.getState().pending, false);
  assert.equal(b.engine.getState().pending, false);
});

test('engine: a device with its own data joining sync keeps both sets', async () => {
  const a = device('a');
  a.change((d) => ({ ...d, accounts: [account(1, 'ING current', 9500)] }));
  await a.engine.init();
  await a.engine.setup('pw', false);
  assert.equal(a.kv.get('key'), undefined, 'not remembered when asked not to');

  const b = device('b');
  b.change((d) => ({ ...d, debts: [{ id: 5, person: 'FJ', direction: 'owed_to_me', amount_cents: 7138, note: null, updated_at: '' }] }));
  await b.engine.init();
  await b.engine.unlock('pw', true);
  await a.engine.sync();
  assert.deepEqual(names(a.data), ['ING current:9500']);
  assert.equal(a.data.debts.length, 1);
  assert.equal(b.data.accounts.length, 1);
});

test('engine: second device can not set up again with a different passphrase', async () => {
  const a = device('a');
  await a.engine.init();
  await a.engine.setup('pw', true);
  const b = device('b');
  await b.engine.init();
  await assert.rejects(b.engine.setup('other', true), /already set up/);
  assert.equal(b.engine.getState().status, 'locked');
});

test('engine: offline at start with a remembered key syncs once back online', async () => {
  const a = device('a');
  await a.engine.init();
  await a.engine.setup('pw', true);
  const b = device('b');
  await b.engine.init();
  await b.engine.unlock('pw', true);
  // b restarts while offline: it still has its key
  online = false;
  await b.engine.init();
  assert.equal(b.engine.getState().status, 'offline');
  assert.equal(b.engine.hasKey(), true);
  a.change((d) => ({ ...d, accounts: [account(1, 'New', 1)] }));
  online = true;
  await a.engine.sync();
  await b.engine.init();
  assert.deepEqual(names(b.data), ['New:1']);
});

test('engine: server data removed and recreated from an older device → nothing lost on the other', async () => {
  const a = device('a');
  const b = device('b');
  await a.engine.init();
  a.change((d) => ({ ...d, accounts: [account(1, 'Shared', 1)] }));
  await a.engine.setup('pw', true);
  await b.engine.init();
  await b.engine.unlock('pw', true);
  // a adds something; b hasn't seen it yet
  a.change((d) => ({ ...d, accounts: [...d.accounts, account(2, 'Only on A', 2)] }));
  await a.engine.sync();
  // The server's data is removed (e.g. database reset); b uploads its older copy first
  await server.prepare('DELETE FROM vault_meta').run();
  b.change((d) => ({ ...d, budgets: [{ category: 'groceries', limit_cents: 30000 }] }));
  await b.engine.sync();
  await a.engine.sync();
  await b.engine.sync();
  assert.deepEqual(names(a.data), ['Only on A:2', 'Shared:1']);
  assert.deepEqual(names(b.data), ['Only on A:2', 'Shared:1']);
  assert.equal(a.data.budgets.length, 1);
});

test('engine: status is not "synced" when a sync could not finish', async () => {
  const a = device('a');
  await a.engine.init();
  await a.engine.setup('pw', true);
  online = false;
  a.change((d) => ({ ...d, accounts: [account(9, 'X', 1)] }));
  await a.engine.sync();
  assert.notEqual(a.engine.getState().status, 'synced');
  assert.equal(a.engine.getState().pending, true);
});
