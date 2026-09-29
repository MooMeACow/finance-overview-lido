// Records a scripted walk through the live demo with Chrome's screencast, for README GIFs.
// Usage: node record.mjs <ws-browser-url> <scenario> <outDir>
// Writes numbered PNG frames plus list.txt (ffmpeg concat format with real frame durations).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from './cdp.mjs';

const [, , browserWs, scenario, outDir] = process.argv;
const SITE = 'https://finance-overview-lido.pages.dev/';
const scenes = {
  pool: { width: 1280, height: 800, scheme: 'light' },
  night: { width: 1280, height: 800, scheme: 'dark' },
  card: { width: 1280, height: 820, scheme: 'light' },
  'card-night': { width: 1280, height: 820, scheme: 'dark' },
  tour: { width: 1280, height: 800, scheme: 'light' },
};
const scene = scenes[scenario];
// Headless Chrome only paints ~12 frames a second. Run the page's clock K times slower
// (JS time, animation frames, timers and CSS animations), capture, then play back at K×.
const K = Number(process.env.SLOW ?? 3);
const c = await connect(browserWs);
const { send, evaluate } = c;
const sleep = (ms) => c.sleep(ms * K);
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const K = ${K};
    const pn = performance.now.bind(performance);
    const base = pn();
    performance.now = () => base + (pn() - base) / K;
    const dn = Date.now;
    const dbase = dn();
    Date.now = () => dbase + (dn() - dbase) / K;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((ts) => cb(base + (ts - base) / K));
    const st = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms = 0, ...a) => st(fn, ms * K, ...a);
    const si = window.setInterval.bind(window);
    window.setInterval = (fn, ms = 0, ...a) => si(fn, ms * K, ...a);
  })();`,
});
await c.open(SITE, { width: scene.width, height: scene.height, scheme: scene.scheme, settle: 7000 });
await send('Animation.enable');
await send('Animation.setPlaybackRate', { playbackRate: 1 / K });

// Headless Chrome draws no pointer: add one (and a soft ring on each press). Recording only.
await evaluate(`(() => {
  document.getElementById('__cursor')?.remove();
  const c = document.createElement('div');
  c.id = '__cursor';
  c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18.5 L13 27 L17 25.2 L13 16.8 L21 16.8 Z" fill="#fff" stroke="#0E1B3D" stroke-width="2" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.35))', transform: 'translate(-3px,-2px)' });
  document.body.appendChild(c);
  window.addEventListener('pointermove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  window.addEventListener('pointerdown', (e) => {
    const r = document.createElement('div');
    Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgba(255,248,236,0.98)', boxShadow: '0 0 0 3px rgba(31,79,224,0.45)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform 420ms cubic-bezier(0.23,1,0.32,1), opacity 420ms' });
    document.body.appendChild(r);
    requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; }));
    setTimeout(() => r.remove(), 520);
  }, true);
  return true;
})()`);

// ---------- input ----------
let mx = -30;
let my = scene.height * 0.3;
const moveTo = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', pointerType: 'mouse' });
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function move(x, y, ms = 700) {
  ms *= K;
  const x0 = mx;
  const y0 = my;
  const start = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - start) / ms);
    mx = x0 + (x - x0) * ease(t);
    my = y0 + (y - y0) * ease(t);
    await moveTo(mx, my);
    if (t >= 1) break;
    await c.sleep(14);
  }
}
async function click() {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1, pointerType: 'mouse' });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, pointerType: 'mouse' });
}
async function type(text, perChar = 110) {
  for (const ch of text) {
    await send('Input.insertText', { text: ch });
    await sleep(perChar);
  }
}
async function key(k, code, modifiers = 0, vk = 0) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk });
}
const centerOf = (js) => evaluate(`(() => { const e = ${js}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, left: r.x, top: r.y }; })()`);
const tab = (label) => centerOf(`[...document.querySelectorAll('[role=tab]')].find((e) => (e.getAttribute('aria-label') || e.textContent).trim() === ${JSON.stringify(label)})`);

// ---------- capture ----------
const frames = [];
c.on('Page.screencastFrame', (p) => {
  frames.push({ t: p.metadata.timestamp, data: p.data });
  send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
});
await moveTo(mx, my);
await sleep(300);
const FORMAT = process.env.FORMAT ?? 'jpeg';
await send('Page.startScreencast', { format: FORMAT, quality: 95, everyNthFrame: 1 });
const t0 = Date.now();

if (scenario === 'pool' || scenario === 'night') {
  // otter heads (1280 wide): x ≈ 697 811 925 1039 1153; front row heads y ≈ 396, back row y ≈ 369
  mx = 380;
  my = 250;
  await moveTo(mx, my);
  await sleep(400);
  await move(700, 185, 1200);
  await move(925, 392, 800);
  await sleep(1000);
  await move(1040, 366, 600);
  await sleep(800);
  await move(840, 205, 700);
  await click();
  await sleep(1100);
  await move(380, 250, 800);
  await sleep(300);
} else if (scenario.startsWith('card')) {
  // open the Revolut otter's card, grow its pebble by typing a balance, make it savings,
  // half-hold delete (the fill snaps back), then close
  mx = 700;
  my = 240;
  await moveTo(mx, my);
  await sleep(300);
  await move(811, 372, 700);
  await sleep(500);
  await click();
  await sleep(1200);
  const amount = await centerOf(`document.querySelector('input[aria-label="Current balance"]')`);
  if (amount) {
    await move(amount.left + amount.w * 0.7, amount.y, 800);
    await click();
    await sleep(200);
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, commands: ['selectAll'] });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
    await sleep(200);
    await type('9850', 170);
    await sleep(900);
  } else console.warn('no amount field');
  const savings = await tab('Savings & investments');
  if (savings) {
    await move(savings.x, savings.y, 800);
    await click();
    await sleep(1300);
  } else console.warn('no savings tab');
  const hold = await centerOf(`[...document.querySelectorAll('[role=button]')].find((e) => e.textContent.includes('Hold to delete'))`);
  if (hold) {
    await move(hold.x, hold.y, 800);
    await sleep(150);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1, pointerType: 'mouse' });
    await sleep(620);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1, pointerType: 'mouse' });
    await sleep(800);
  } else console.warn('no hold button');
  const close = await centerOf(`[...document.querySelectorAll('[aria-label="Close"]')].find((e) => e.getBoundingClientRect().width < 80)`);
  if (close) {
    await move(close.x, close.y, 800);
    await click();
    await sleep(900);
  } else console.warn('no close button');
  await move(700, 240, 700);
  await sleep(300);
} else if (scenario === 'tour') {
  await sleep(300);
  for (const label of ['Monthly', 'Transactions', 'Import', 'Dashboard']) {
    const p = await tab(label);
    if (!p) continue;
    await move(p.x, p.y, 750);
    await click();
    await sleep(label === 'Dashboard' ? 1400 : 2000);
  }
}

await send('Page.stopScreencast');
const seconds = (Date.now() - t0) / 1000 / K;
mkdirSync(outDir, { recursive: true });
frames.sort((a, b) => a.t - b.t);
const list = [];
frames.forEach((f, i) => {
  const name = `f${String(i).padStart(5, '0')}.${FORMAT === 'png' ? 'png' : 'jpg'}`;
  writeFileSync(join(outDir, name), Buffer.from(f.data, 'base64'));
  const next = frames[i + 1];
  list.push(`file '${name}'`, `duration ${(next ? Math.max(0.001, (next.t - f.t) / K) : 0.5).toFixed(4)}`);
});
list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.${FORMAT === 'png' ? 'png' : 'jpg'}'`);
writeFileSync(join(outDir, 'list.txt'), list.join('\n') + '\n');
console.log(JSON.stringify({ scenario, frames: frames.length, seconds: seconds.toFixed(1), fps: (frames.length / seconds).toFixed(1) }));
c.close();
process.exit(0);
