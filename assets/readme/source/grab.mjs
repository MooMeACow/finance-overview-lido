// Renders one stage scene to a PNG: node grab.mjs <ws> <scene> '<opts json>' <out.png>
import { writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';
const [, , browserWs, scene, opts, out] = process.argv;
const c = await connect(browserWs);
await c.open('http://127.0.0.1:5178/stage.html', { width: 1300, height: 700, settle: 1500 });
const url = await c.evaluate(`stage.png(${JSON.stringify(scene)}, ${opts})`);
writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
c.close();
process.exit(0);
