// Renders every frame of an animated stage scene: node frames.mjs <ws> <scene> '<opts json>' <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from './cdp.mjs';
const [, , browserWs, scene, opts, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
const c = await connect(browserWs);
await c.open('http://127.0.0.1:5178/stage.html', { width: 1300, height: 700, settle: 1500 });
const info = await c.evaluate(`stage.start(${JSON.stringify(scene)}, ${opts})`);
for (let i = 0; i < info.frames; i++) {
  const url = await c.evaluate(`stage.frame(${i})`);
  writeFileSync(join(outDir, `f${String(i).padStart(5, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(JSON.stringify(info));
c.close();
process.exit(0);
