import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore: built into Node 22
import { DatabaseSync } from 'node:sqlite';

import { handleApi, resetSchemaCache, CHUNK_SIZE, type D1Database, type D1PreparedStatement } from '../worker/api.ts';
import worker from '../worker/index.ts';
import { verifyAccessJwt, clearKeyCache } from '../worker/accessJwt.ts';

/** Minimal D1 look-alike on top of Node's built-in SQLite. */
function fakeD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const stmt = (sql: string, values: unknown[] = []): D1PreparedStatement & { exec(): void } => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T,>() => (sqlite.prepare(sql).get(...(values as any[])) as T) ?? null,
    all: async <T,>() => ({ results: sqlite.prepare(sql).all(...(values as any[])) as T[] }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...(values as any[]));
      return { results: [], meta: { changes: Number(r.changes) } };
    },
    exec: () => void sqlite.prepare(sql).run(...(values as any[])),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      sqlite.exec('BEGIN');
      try {
        for (const s of list) (s as any).exec();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
      return list.map(() => ({ results: [] }));
    },
    exec: async (sql) => sqlite.exec(sql),
  };
}

const call = async (db: D1Database, method: string, path: string, body?: unknown, user = 'me@example.com') => {
  const res = await handleApi(
    new Request(`https://finance.example.workers.dev${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    db,
    user,
  );
  return { status: res.status, body: (await res.json()) as any };
};

let db: D1Database;
beforeEach(() => {
  resetSchemaCache();
  db = fakeD1();
});

test('api: empty, first upload, read back, revisions', async () => {
  assert.deepEqual((await call(db, 'GET', '/api/vault/meta')).body.revision, 0);
  assert.deepEqual((await call(db, 'GET', '/api/vault')).body, { revision: 0, vault_id: null, vault: null });

  const up = await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'encrypted-1' });
  assert.equal(up.status, 200);
  assert.equal(up.body.revision, 1);
  assert.equal((await call(db, 'GET', '/api/vault')).body.vault, 'encrypted-1');

  const up2 = await call(db, 'PUT', '/api/vault', { base_revision: 1, vault: 'encrypted-2' });
  assert.equal(up2.body.revision, 2);
  const got = await call(db, 'GET', '/api/vault');
  assert.deepEqual([got.body.revision, got.body.vault], [2, 'encrypted-2']);
  assert.equal((await call(db, 'GET', '/api/vault/meta')).body.revision, 2);
});

test('api: upload based on an old revision is refused (409)', async () => {
  await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'from laptop A' });
  const stale = await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'from laptop B' });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.revision, 1);
  assert.equal((await call(db, 'GET', '/api/vault')).body.vault, 'from laptop A');
});

test('api: two uploads at the same moment → exactly one wins, data intact', async () => {
  await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'v1' });
  const [a, b] = await Promise.all([
    call(db, 'PUT', '/api/vault', { base_revision: 1, vault: 'A'.repeat(10) }),
    call(db, 'PUT', '/api/vault', { base_revision: 1, vault: 'B'.repeat(10) }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = a.status === 200 ? 'A' : 'B';
  assert.equal((await call(db, 'GET', '/api/vault')).body.vault, winner.repeat(10));
});

test('api: large data is split into chunks and put back together', async () => {
  const big = Array.from({ length: CHUNK_SIZE * 2 + 123 }, (_, i) => 'abcdefghij'[i % 10]).join('');
  assert.equal((await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: big })).status, 200);
  assert.equal((await call(db, 'GET', '/api/vault')).body.vault, big);
  // Old chunks are removed after a new upload
  await call(db, 'PUT', '/api/vault', { base_revision: 1, vault: 'small' });
  const rows = await db.prepare('SELECT COUNT(*) AS n FROM vault_chunks').first<{ n: number }>();
  assert.equal(rows?.n, 1);
});

test('api: each user has their own data; bad input rejected', async () => {
  await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'mine' });
  assert.equal((await call(db, 'GET', '/api/vault', undefined, 'someone@else.com')).body.vault, null);
  assert.equal((await call(db, 'PUT', '/api/vault', { base_revision: 'x', vault: 'y' })).status, 400);
  assert.equal((await call(db, 'PUT', '/api/vault', { base_revision: 1 })).status, 400);
  assert.equal((await call(db, 'DELETE', '/api/vault')).status, 404);
});

test('worker: refuses requests that did not pass Cloudflare Access', async () => {
  const env = { DB: db };
  const res = await worker.fetch(new Request('https://x.workers.dev/api/vault/meta'), env, {});
  assert.equal(res.status, 401);
  // A forged token header alone is not enough
  const forged = await worker.fetch(
    new Request('https://x.workers.dev/api/vault/meta', { headers: { 'cf-access-jwt-assertion': 'a.eyJlbWFpbCI6ImFAYi5jIn0.c' } }),
    env,
    {},
  );
  assert.equal(forged.status, 401);
});

test('worker: uses the identity from Cloudflare Access; optional email allow-list', async () => {
  const ctx = { access: { getIdentity: async () => ({ email: 'Me@Example.com' }) } };
  const res = await worker.fetch(new Request('https://x.workers.dev/api/whoami'), { DB: db }, ctx);
  assert.deepEqual(await res.json(), { email: 'me@example.com' });
  const blocked = await worker.fetch(new Request('https://x.workers.dev/api/whoami'), { DB: db, ALLOWED_EMAILS: 'other@example.com' }, ctx);
  assert.equal(blocked.status, 403);
});

// ---------- Access token check ----------

const b64url = (b: Uint8Array | string) =>
  Buffer.from(typeof b === 'string' ? Buffer.from(b) : b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('access token: valid, wrong audience, expired, bad signature', async () => {
  clearKeyCache();
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  const team = 'https://myteam.cloudflareaccess.com';
  const fetcher = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
  const sign = async (payload: object) => {
    const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
    const p = b64url(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
    return `${h}.${p}.${b64url(sig)}`;
  };
  const now = Date.now();
  const good = { email: 'me@example.com', iss: team, aud: ['aud123'], exp: now / 1000 + 600 };

  assert.equal((await verifyAccessJwt(await sign(good), team, 'aud123', fetcher, now))?.email, 'me@example.com');
  assert.equal(await verifyAccessJwt(await sign(good), team, 'other-aud', fetcher, now), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, exp: now / 1000 - 1 }), team, 'aud123', fetcher, now), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, iss: 'https://evil.example' }), team, 'aud123', fetcher, now), null);
  const token = await sign(good);
  const tampered = token.split('.').map((x, i) => (i === 1 ? b64url(JSON.stringify({ ...good, email: 'attacker@x.com' })) : x)).join('.');
  assert.equal(await verifyAccessJwt(tampered, team, 'aud123', fetcher, now), null);
});

test('worker: an unsigned token is never trusted, even when ctx.access has no identity', async () => {
  const fake = `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify({ email: 'victim@example.com' }))}.x`;
  const req = () => new Request('https://x.workers.dev/api/whoami', { headers: { 'cf-access-jwt-assertion': fake } });
  assert.equal((await worker.fetch(req(), { DB: db }, { access: { getIdentity: async () => undefined } })).status, 401);
  assert.equal((await worker.fetch(req(), { DB: db }, { access: {} })).status, 401);
  // Malformed token doesn't crash the Worker
  const bad = new Request('https://x.workers.dev/api/whoami', { headers: { 'cf-access-jwt-assertion': 'nodots' } });
  assert.equal((await worker.fetch(bad, { DB: db, TEAM_DOMAIN: 'https://t.cloudflareaccess.com', POLICY_AUD: 'a' }, {})).status, 401);
});

test('api: vault id stays the same across uploads and changes when data is recreated', async () => {
  const first = await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'v1' });
  const second = await call(db, 'PUT', '/api/vault', { base_revision: 1, vault: 'v2' });
  assert.ok(first.body.vault_id);
  assert.equal(second.body.vault_id, first.body.vault_id);
  await db.prepare('DELETE FROM vault_meta').run();
  const again = await call(db, 'PUT', '/api/vault', { base_revision: 0, vault: 'v3' });
  assert.notEqual(again.body.vault_id, first.body.vault_id);
});
