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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

const project = process.env.PAGES_PROJECT || 'finance-overview-lido';
const env = { ...process.env, EXPO_PUBLIC_DEMO: '1' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env });

/** All files under a folder, recursively */
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

/**
 * Cloudflare Pages never uploads files inside a node_modules folder, and Expo exports package
 * assets (the fonts) to dist/assets/node_modules/... Their names already carry a content hash,
 * so move them into one flat folder and point the bundle at the new paths.
 */
function flattenPackageAssets(dist) {
  const from = join(dist, 'assets', 'node_modules');
  if (!existsSync(from)) return;
  const to = join(dist, 'assets', 'pkg');
  mkdirSync(to, { recursive: true });
  const moved = new Map();
  for (const file of files(from)) {
    const url = '/' + relative(dist, file).split(sep).join('/');
    moved.set(url, `/assets/pkg/${basename(file)}`);
    renameSync(file, join(to, basename(file)));
  }
  rmSync(from, { recursive: true, force: true });
  for (const file of files(dist).filter((f) => /\.(js|html|json)$/.test(f))) {
    let text = readFileSync(file, 'utf8');
    const before = text;
    for (const [oldUrl, newUrl] of moved) text = text.split(oldUrl).join(newUrl);
    if (text !== before) writeFileSync(file, text);
  }
  console.log(`Moved ${moved.size} package assets to dist/assets/pkg`);
}

run('npx expo export --platform web --clear');
flattenPackageAssets('dist');
run(`npx wrangler pages deploy dist --project-name ${project} --branch main --commit-dirty=true`);
