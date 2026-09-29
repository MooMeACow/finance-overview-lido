// Screenshots of the live demo for the README wall: node shots.mjs <ws> [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';
const [, , browserWs, outDir = join(dirname(fileURLToPath(import.meta.url)), 'shots')] = process.argv;
mkdirSync(outDir, { recursive: true });
const SITE = 'https://finance-overview-lido.pages.dev/';
const shots = [
  { name: 'desk-monthly-day', width: 1280, height: 800, scheme: 'light', tab: 'Monthly' },
  { name: 'desk-transactions-night', width: 1280, height: 800, scheme: 'dark', tab: 'Transactions' },
  { name: 'desk-dashboard-night', width: 1280, height: 800, scheme: 'dark' },
  { name: 'phone-dashboard-day', width: 390, height: 844, scheme: 'light', mobile: true },
  { name: 'phone-dashboard-night', width: 390, height: 844, scheme: 'dark', mobile: true },
  { name: 'phone-monthly-night', width: 390, height: 844, scheme: 'dark', mobile: true, tab: 'Monthly' },
];
const c = await connect(browserWs);
for (const s of shots) {
  await c.send('Emulation.setTouchEmulationEnabled', { enabled: !!s.mobile });
  await c.open(SITE, { width: s.width, height: s.height, dpr: 2, scheme: s.scheme, mobile: !!s.mobile, settle: 6500 });
  // park the pointer out of the way so nothing shows a hover state
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: s.height - 2, button: 'none', pointerType: 'mouse' });
  if (s.tab) {
    const ok = await c.evaluate(`(() => { const t = [...document.querySelectorAll('[role=tab]')].find((e) => (e.getAttribute('aria-label') || e.textContent).trim() === ${JSON.stringify(s.tab)}); if (!t) return false; t.click(); return true; })()`);
    if (!ok) console.warn('tab not found', s.tab);
    await c.sleep(4000);
  }
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${s.name}.png`), Buffer.from(shot.data, 'base64'));
  console.log('shot', s.name);
}
await c.send('Emulation.setTouchEmulationEnabled', { enabled: false });
c.close();
process.exit(0);
