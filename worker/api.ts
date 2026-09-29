/**
 * Sync API: stores one encrypted "vault" per user.
 *
 * The app encrypts everything on the device before uploading, so this code
 * (and Cloudflare) only ever handles unreadable data. Each upload gets a new
 * revision number; an upload based on an old revision is refused with 409 so
 * the device can merge first instead of overwriting another device's changes.
 *
 * Large vaults are split into chunks because a D1 row can hold at most 2 MB.
 */

export interface D1Result<T = unknown> {
  results: T[];
  meta?: { changes?: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
  exec(sql: string): Promise<unknown>;
}

export const CHUNK_SIZE = 1_000_000; // characters; vaults are ASCII (base64 JSON)
export const MAX_VAULT_SIZE = 50_000_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS vault_meta (
     user TEXT PRIMARY KEY,
     revision INTEGER NOT NULL,
     vault_id TEXT NOT NULL,
     writer TEXT NOT NULL,
     chunks INTEGER NOT NULL,
     size INTEGER NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS vault_chunks (
     user TEXT NOT NULL,
     writer TEXT NOT NULL,
     revision INTEGER NOT NULL,
     idx INTEGER NOT NULL,
     data TEXT NOT NULL,
     PRIMARY KEY (user, writer, idx)
   )`,
];

let schemaReady: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .batch(SCHEMA.map((sql) => db.prepare(sql)))
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null;
        throw e;
      });
  }
  return schemaReady;
}

/** For tests: forget that the schema was created. */
export function resetSchemaCache() {
  schemaReady = null;
}

type Meta = { revision: number; vault_id: string; writer: string; chunks: number; size: number; updated_at: string };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function getMeta(db: D1Database, user: string): Promise<Meta | null> {
  return db.prepare('SELECT revision, vault_id, writer, chunks, size, updated_at FROM vault_meta WHERE user = ?').bind(user).first<Meta>();
}

async function readVault(db: D1Database, user: string, meta: Meta): Promise<string> {
  const { results } = await db
    .prepare('SELECT data FROM vault_chunks WHERE user = ? AND writer = ? ORDER BY idx')
    .bind(user, meta.writer)
    .all<{ data: string }>();
  if (results.length !== meta.chunks) throw new Error('Stored data is incomplete');
  return results.map((r) => r.data).join('');
}

/** Handles /api/* for an authenticated user. */
export async function handleApi(request: Request, db: D1Database, user: string): Promise<Response> {
  await ensureSchema(db);
  const url = new URL(request.url);

  if (url.pathname === '/api/whoami' && request.method === 'GET') {
    return json({ email: user });
  }

  if (url.pathname === '/api/vault/meta' && request.method === 'GET') {
    const meta = await getMeta(db, user);
    // vault_id changes if the stored data is ever removed and created again, so devices know not to trust their last copy
    return json({ revision: meta?.revision ?? 0, vault_id: meta?.vault_id ?? null, updated_at: meta?.updated_at ?? null, email: user });
  }

  if (url.pathname === '/api/vault' && request.method === 'GET') {
    const meta = await getMeta(db, user);
    if (!meta) return json({ revision: 0, vault_id: null, vault: null });
    return json({ revision: meta.revision, vault_id: meta.vault_id, updated_at: meta.updated_at, vault: await readVault(db, user, meta) });
  }

  if (url.pathname === '/api/vault' && request.method === 'PUT') {
    let body: { base_revision?: unknown; vault?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const base = body.base_revision;
    const vault = body.vault;
    if (typeof base !== 'number' || !Number.isInteger(base) || base < 0 || typeof vault !== 'string' || !vault) {
      return json({ error: 'Expected { base_revision: number, vault: string }' }, 400);
    }
    if (vault.length > MAX_VAULT_SIZE) return json({ error: 'Data too large' }, 413);

    const current = await getMeta(db, user);
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== base) return json({ error: 'conflict', revision: currentRevision }, 409);

    const next = base + 1;
    // Every upload writes its own chunks (unique writer id), so two devices
    // uploading at the same moment can't mix up each other's data
    const writer = crypto.randomUUID();
    const vaultId = current?.vault_id ?? crypto.randomUUID();
    const chunks: string[] = [];
    for (let i = 0; i < vault.length; i += CHUNK_SIZE) chunks.push(vault.slice(i, i + CHUNK_SIZE));
    const now = new Date().toISOString();

    await db.batch(
      chunks.map((data, idx) =>
        db
          .prepare('INSERT INTO vault_chunks (user, writer, revision, idx, data) VALUES (?, ?, ?, ?, ?)')
          .bind(user, writer, next, idx, data),
      ),
    );
    // Move the pointer only if the revision is still the one this upload was based on
    await db
      .prepare(
        `INSERT INTO vault_meta (user, revision, vault_id, writer, chunks, size, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user) DO UPDATE SET revision = excluded.revision, writer = excluded.writer,
           chunks = excluded.chunks, size = excluded.size, updated_at = excluded.updated_at
         WHERE vault_meta.revision = ?`,
      )
      .bind(user, next, vaultId, writer, chunks.length, vault.length, now, base)
      .run();

    const after = await getMeta(db, user);
    if (after?.writer !== writer) {
      // Another device got there first: remove what this upload wrote
      await db.prepare('DELETE FROM vault_chunks WHERE user = ? AND writer = ?').bind(user, writer).run();
      return json({ error: 'conflict', revision: after?.revision ?? 0 }, 409);
    }
    // Remove older versions (never a newer upload that may be in progress)
    await db.prepare('DELETE FROM vault_chunks WHERE user = ? AND revision < ?').bind(user, next).run();
    return json({ revision: next, vault_id: after.vault_id, updated_at: now });
  }

  return json({ error: 'Not found' }, 404);
}
