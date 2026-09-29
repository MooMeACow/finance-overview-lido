/**
 * Checks a Cloudflare Access login token (JWT, RS256) using Web Crypto.
 * Only used when Cloudflare hasn't already validated it for us (ctx.access).
 * See https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

type Jwk = JsonWebKey & { kid?: string };
type Payload = { email?: string; iss?: string; aud?: string | string[]; exp?: number; nbf?: number };

let cachedKeys: { at: number; domain: string; keys: Jwk[] } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKeys(teamDomain: string, fetcher: typeof fetch): Promise<Jwk[]> {
  if (cachedKeys && cachedKeys.domain === teamDomain && Date.now() - cachedKeys.at < 10 * 60_000) return cachedKeys.keys;
  const res = await fetcher(`${teamDomain.replace(/\/$/, '')}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('Could not load Access keys');
  const { keys } = (await res.json()) as { keys: Jwk[] };
  cachedKeys = { at: Date.now(), domain: teamDomain, keys };
  return keys;
}

/** Returns the token's payload if it is valid for this app, otherwise null. */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  audience: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<Payload | null> {
  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256') return null;
    const keys = await getKeys(teamDomain, fetcher);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(sig) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource,
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as Payload;
    const seconds = now / 1000;
    if (typeof payload.exp !== 'number' || payload.exp < seconds) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > seconds + 60) return null;
    if (payload.iss !== teamDomain.replace(/\/$/, '')) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(audience)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** For tests */
export function clearKeyCache() {
  cachedKeys = null;
}
