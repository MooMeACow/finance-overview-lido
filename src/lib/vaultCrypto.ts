/**
 * End-to-end encryption for synced data.
 *
 * Your passphrase is turned into a key with PBKDF2 (SHA-256, many rounds) and
 * the data is encrypted with AES-GCM 256 on your device. The server only ever
 * receives the encrypted result, so it can't read your data. Without the
 * passphrase the data can't be recovered.
 *
 * Uses the browser's built-in Web Crypto API (also available in Node for tests).
 */

export const VAULT_FORMAT = 'finance-overview-vault';
export const ITERATIONS = 600_000; // OWASP's current recommendation for PBKDF2-HMAC-SHA256

export type Vault = {
  format: typeof VAULT_FORMAT;
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  ct: string;
};

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Encryption needs a secure (https) connection in a modern browser.');
  return s;
};

// ---------- base64 helpers ----------

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ---------- keys ----------

export function newSalt(): string {
  return toBase64(random(16));
}

/** Turns a passphrase into an AES key. The key can't be exported, only used. */
export async function deriveKey(passphrase: string, salt: string, iterations = ITERATIONS): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt) as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------- encrypt / decrypt ----------

export async function encryptJson(key: CryptoKey, salt: string, value: unknown, iterations = ITERATIONS): Promise<string> {
  const iv = random(12);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain as BufferSource));
  const vault: Vault = {
    format: VAULT_FORMAT,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    iv: toBase64(iv),
    ct: toBase64(ct),
  };
  return JSON.stringify(vault);
}

export function readVault(text: string): Vault {
  const v = JSON.parse(text) as Vault;
  if (v?.format !== VAULT_FORMAT || v.v !== 1) throw new Error('Unknown data format from the server.');
  return v;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase.');
  }
}

/** Decrypts a vault. Throws WrongPassphraseError if the key doesn't fit. */
export async function decryptJson<T>(key: CryptoKey, vaultText: string): Promise<T> {
  const v = readVault(vaultText);
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(v.iv) as BufferSource }, key, fromBase64(v.ct) as BufferSource);
  } catch {
    throw new WrongPassphraseError();
  }
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Key for an existing vault, from the passphrase (uses the vault's own salt and rounds). */
export async function keyForVault(passphrase: string, vaultText: string): Promise<{ key: CryptoKey; salt: string; iterations: number }> {
  const v = readVault(vaultText);
  const key = await deriveKey(passphrase, v.kdf.salt, v.kdf.iterations);
  return { key, salt: v.kdf.salt, iterations: v.kdf.iterations };
}
