/**
 * Cloudflare Worker: serves the web app and the sync API.
 *
 * - Static files (the built app in ./dist) are served by Cloudflare directly.
 * - Requests to /api/* come here. They must come through Cloudflare Access
 *   (your GitHub login); the user's email identifies whose data it is.
 */
import { handleApi, json, type D1Database } from './api';
import { verifyAccessJwt } from './accessJwt';

export interface Env {
  DB: D1Database;
  /** Optional: https://<team>.cloudflareaccess.com — for checking the login token ourselves */
  TEAM_DOMAIN?: string;
  /** Optional: the Access application's audience tag */
  POLICY_AUD?: string;
  /** Optional: comma-separated emails allowed to use the API (extra safety on top of Access) */
  ALLOWED_EMAILS?: string;
}

type AccessContext = {
  access?: { getIdentity?: () => Promise<{ email?: string } | undefined> };
};

/** Email of the logged-in user, or null if the request didn't pass Cloudflare Access. */
async function userEmail(request: Request, env: Env, ctx: AccessContext): Promise<string | null> {
  // Preferred: Cloudflare validated the Access login for this Worker (ctx.access)
  if (ctx.access) {
    const identity = await ctx.access.getIdentity?.().catch(() => undefined);
    if (identity?.email) return identity.email.toLowerCase();
  }

  // Otherwise: check the signed Access token ourselves, if the app's details are configured.
  // Never trust the token without checking its signature.
  const token = request.headers.get('cf-access-jwt-assertion');
  if (token && env.TEAM_DOMAIN && env.POLICY_AUD) {
    const payload = await verifyAccessJwt(token, env.TEAM_DOMAIN, env.POLICY_AUD);
    if (payload?.email) return payload.email.toLowerCase();
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: AccessContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);

    const email = await userEmail(request, env, ctx).catch(() => null);
    if (!email) {
      return json({ error: 'Not logged in. Protect this Worker with Cloudflare Access (see README).' }, 401);
    }
    const allowed = env.ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (allowed?.length && !allowed.includes(email)) return json({ error: 'Not allowed' }, 403);

    try {
      return await handleApi(request, env.DB, email);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Server error' }, 500);
    }
  },
};
