/**
 * Builds the web app as a public demo (mock data loads on a visitor's first visit) and uploads it
 * to Cloudflare Pages. Run `npx wrangler login` once first.
 *
 *   pnpm deploy:pages                      # project "finance-overview-lido"
 *   PAGES_PROJECT=my-name pnpm deploy:pages
 *
 * A new project has to be created once on classic Pages, or wrangler hands it to Workers and
 * tries to deploy the sync Worker from wrangler.jsonc instead:
 *
 *   npx wrangler pages project create my-name --production-branch main --force
 *
 * This is the demo only: no sync API and no database. For your own data with sync between
 * devices, use `pnpm deploy` and follow "Host it on Cloudflare" in the README.
 */
import { execSync } from 'node:child_process';

const project = process.env.PAGES_PROJECT || 'finance-overview-lido';
const env = { ...process.env, EXPO_PUBLIC_DEMO: '1' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

run('npx expo export --platform web --clear');
run(`npx wrangler pages deploy dist --project-name ${project} --branch main --commit-dirty=true`);
