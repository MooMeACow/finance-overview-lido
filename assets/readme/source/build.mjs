// Pulls the app's real renderers into plain browser modules for the README stage:
// the otter engine (TypeScript → ES module), the water shader, and the fonts.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT = process.env.PROJECT ?? join(here, '..', '..', '..');
const out = join(here, '.build');
mkdirSync(join(out, 'fonts'), { recursive: true });

const ts = createRequire(join(PROJECT, 'package.json'))('typescript');
const engine = readFileSync(join(PROJECT, 'src/lido/otter/engine.ts'), 'utf8');
let js = ts.transpileModule(engine, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
// The idle bob, tilt and whisker sway read their speed from a table, so a scene can make
// them fit a GIF loop exactly. Defaults are the app's speeds.
const speeds = [
  ['Math.sin(t * 1.15 + this.phase)', 'Math.sin(t * __otterW.b1 + this.phase)'],
  ['Math.sin(t * 0.55 + this.phase * 1.7)', 'Math.sin(t * __otterW.b2 + this.phase * 1.7)'],
  ['Math.sin(now * 0.8 + o.phase)', 'Math.sin(now * __otterW.rot + o.phase)'],
  ['Math.sin(now * 1.4 + o.phase)', 'Math.sin(now * __otterW.sway + o.phase)'],
];
for (const [from, to] of speeds) {
  if (js.split(from).length !== 2) throw new Error(`engine changed: expected one "${from}"`);
  js = js.replace(from, to);
}
js = 'globalThis.__otterW ??= { b1: 1.15, b2: 0.55, rot: 0.8, sway: 1.4 };\n' + js;
writeFileSync(join(out, 'engine.js'), js);

const water = readFileSync(join(PROJECT, 'src/lido/Water.web.tsx'), 'utf8');
const literal = (name) => water.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`))[1];
const object = (name) => water.match(new RegExp(`const ${name} = (\\{[^}]*\\});`))[1];
writeFileSync(
  join(out, 'water.js'),
  `export const VERT = \`${literal('VERT')}\`;\nexport const FRAG = \`${literal('FRAG')}\`;\nexport const DAY = ${object('DAY')};\nexport const NIGHT = ${object('NIGHT')};\n`,
);

const fonts = [
  ['bricolage-grotesque', '800ExtraBold', 'BricolageGrotesque_800ExtraBold.ttf'],
  ['bricolage-grotesque', '700Bold', 'BricolageGrotesque_700Bold.ttf'],
  ['geist', '400Regular', 'Geist_400Regular.ttf'],
  ['geist', '500Medium', 'Geist_500Medium.ttf'],
  ['geist', '600SemiBold', 'Geist_600SemiBold.ttf'],
];
for (const [pkg, weight, file] of fonts) copyFileSync(join(PROJECT, 'node_modules/@expo-google-fonts', pkg, weight, file), join(out, 'fonts', file));

console.log(`built ${out}`);
