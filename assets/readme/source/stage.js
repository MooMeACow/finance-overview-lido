// README stage: composes the hero and the otter close-up from the app's real renderers
// (the water shader and the otter engine), frame by frame on a controlled clock.
import { Raft } from './.build/engine.js';
import { VERT, FRAG, DAY, NIGHT } from './.build/water.js';

const TAU = Math.PI * 2;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// ---------- palettes (src/theme.ts) ----------
const UI = {
  day: {
    text: '#0E1B3D',
    textSecondary: '#44527A',
    textMuted: '#6E7CA0',
    primary: '#1F4FE0',
    aqua: '#22B5DD',
    sun: '#FFB938',
    coral: '#EE6A43',
    track: 'rgba(31,79,224,0.10)',
    pill: '#FFB938',
    onPill: '#0E1B3D',
    heroText: '#FFF8EC',
    heroMuted: 'rgba(255,248,236,0.8)',
  },
  night: {
    text: '#F4EFE4',
    textSecondary: '#B8C3DE',
    textMuted: '#8392B8',
    primary: '#5B85FF',
    aqua: '#3FD4F5',
    sun: '#FFC95C',
    coral: '#FF8766',
    track: 'rgba(91,133,255,0.16)',
    pill: '#FFC95C',
    onPill: '#06112E',
    heroText: '#FFF8EC',
    heroMuted: 'rgba(255,248,236,0.78)',
  },
};

// the demo's five accounts, in the order the pool shows them (current first)
const ACCOUNTS = [
  { id: 1782889920000800, label: 'ING Betaalrekening', cents: 627963, kind: 'current' },
  { id: 1782889920000801, label: 'Revolut', cents: 5013, kind: 'current' },
  { id: 1782889920000802, label: 'ING Oranje Spaarrekening', cents: 1638400, kind: 'savings' },
  { id: 1782889920000803, label: 'ING Zelf Beleggen (ETFs)', cents: 2227655, kind: 'savings' },
  { id: 1782889920000804, label: 'Revolut crypto', cents: 133230, kind: 'savings' },
];
const MAX = Math.max(...ACCOUNTS.map((a) => a.cents));
const euro = (cents) => `€${(cents / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const spec = (a) => ({ id: a.id, label: a.label, sub: euro(a.cents), share: Math.sqrt(a.cents / MAX), kind: a.kind });

// ---------- fonts ----------
const FONT_FILES = [
  ['Bricolage', 'BricolageGrotesque_800ExtraBold.ttf', '800'],
  ['Bricolage', 'BricolageGrotesque_700Bold.ttf', '700'],
  ['Geist', 'Geist_400Regular.ttf', '400'],
  ['Geist', 'Geist_500Medium.ttf', '500'],
  ['Geist', 'Geist_600SemiBold.ttf', '600'],
  ['Geist_600SemiBold', 'Geist_600SemiBold.ttf', 'normal'],
];
async function loadFonts() {
  await Promise.all(
    FONT_FILES.map(async ([family, file, weight]) => {
      const face = new FontFace(family, `url(./.build/fonts/${file})`, { weight });
      await face.load();
      document.fonts.add(face);
    }),
  );
}

// ---------- water (src/lido/Water.web.tsx) ----------
function makeWater(width, height, night, frag = FRAG) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  const p = night ? NIGHT : DAY;
  gl.uniform3fv(u('uDeep'), hex(p.deep));
  gl.uniform3fv(u('uMid'), hex(p.mid));
  gl.uniform3fv(u('uShallow'), hex(p.shallow));
  gl.uniform3fv(u('uLight'), hex(p.light));
  gl.uniform3fv(u('uSun'), hex(p.sun));
  gl.uniform1f(u('uNight'), night ? 1 : 0);
  gl.uniform1f(u('uGain'), night ? 1 : 0.74);
  gl.viewport(0, 0, width, height);
  gl.uniform2f(u('uRes'), width, height);
  const ripples = new Float32Array(16);
  return {
    canvas,
    /** x, y in canvas px from the top left; time in shader seconds */
    ripple(slot, x, y, time, strength) {
      ripples.set([x, height - y, time, strength], slot * 4);
    },
    draw(time) {
      gl.uniform1f(u('uTime'), time);
      gl.uniform4fv(u('uRip'), ripples);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}

// ---------- otters (src/lido/otter/engine.ts) ----------
function makeRaft(specs, layout, mood) {
  const raft = new Raft();
  raft.setOtters(specs, 0, false);
  raft.mood = mood;
  raft.layout(layout);
  for (const o of raft.otters) o.nextAction = 1e9; // no random yawns or dives: the scene is scripted
  return { raft, t: 0 };
}
function simulate(sim, to, look, hovered = null) {
  const dt = 1 / 240;
  while (sim.t < to - 1e-9) {
    const step = Math.min(dt, to - sim.t);
    sim.t += step;
    sim.raft.hovered = hovered;
    sim.raft.update(step, sim.t, look, 0, null, false);
  }
}
function drawRaft(sim, w, h, S) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * S);
  c.height = Math.round(h * S);
  const ctx = c.getContext('2d');
  ctx.setTransform(S, 0, 0, S, 0, 0);
  sim.raft.draw(ctx, false);
  return c;
}

// ---------- drawing helpers ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function text(ctx, str, x, y, { font, color, spacing = 0, align = 'left', baseline = 'alphabetic' }) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.letterSpacing = '0px';
  return w;
}
function fitFont(ctx, str, weight, family, size, maxWidth, spacingEm = 0) {
  let s = size;
  for (; s > 10; s -= 1) {
    ctx.font = `${weight} ${s}px ${family}`;
    ctx.letterSpacing = `${s * spacingEm}px`;
    const w = ctx.measureText(str).width;
    ctx.letterSpacing = '0px';
    if (w <= maxWidth) break;
  }
  return s;
}
/** A budget lane rope (src/lido/BeadRope.tsx) */
function laneRope(ctx, x, y, width, value, C, { beads = 20, height = 12, gap = 4, water = false } = {}) {
  const bw = (width - gap * (beads - 1)) / beads;
  const filled = Math.round(Math.max(0, Math.min(1, value)) * beads);
  const warnFrom = Math.floor(beads * 0.8);
  const floats = water ? { off: 'rgba(255,248,236,0.22)', a: '#FFF8EC', b: '#8DEBFF' } : { off: C.track, a: C.primary, b: C.aqua };
  for (let i = 0; i < beads; i++) {
    const on = i < filled;
    ctx.fillStyle = !on ? floats.off : value > 1 ? C.coral : i >= warnFrom ? C.sun : i % 2 === 0 ? floats.a : floats.b;
    rr(ctx, x + i * (bw + gap), y, bw, height, height / 2);
    ctx.fill();
  }
}

// ---------- the hero ----------
function hero({ night = false, S = 2, t = 9, waterTime = 7.7, look = 'title', total = true, cta = true } = {}) {
  const W = 1200;
  const H = 500;
  const C = night ? UI.night : UI.day;
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(S, 0, 0, S, 0, 0);

  ctx.save();
  rr(ctx, 0, 0, W, H, 36);
  ctx.clip();

  // the deck (src/lido/Backdrop.web.tsx)
  const base = ctx.createLinearGradient(0, 0, 0, H);
  if (night) {
    base.addColorStop(0, '#0A1A44');
    base.addColorStop(0.55, '#07122E');
  } else {
    base.addColorStop(0, '#FDEBD0');
    base.addColorStop(0.6, '#FBF3E4');
  }
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  if (night) {
    glow(160, -40, 520, 'rgba(91,133,255,0.16)');
    glow(1100, -60, 520, 'rgba(63,212,245,0.14)');
  } else {
    glow(220, -80, 560, 'rgba(255,190,98,0.40)');
    glow(-40, 520, 420, 'rgba(90,190,245,0.12)');
  }

  // the pool
  const P = { x: 606, y: 26, w: 568, h: 448, r: 30 };
  ctx.save();
  ctx.shadowColor = night ? 'rgba(0,0,0,0.45)' : 'rgba(14,27,61,0.22)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 16;
  rr(ctx, P.x, P.y, P.w, P.h, P.r);
  ctx.fillStyle = night ? '#07226F' : '#1766E0';
  ctx.fill();
  ctx.restore();

  const ws = S * 0.62; // the app renders the light under device resolution; it is soft anyway
  const water = makeWater(Math.round(P.w * ws), Math.round(P.h * ws), night);
  water.draw(waterTime);
  ctx.save();
  rr(ctx, P.x, P.y, P.w, P.h, P.r);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(water.canvas, P.x, P.y, P.w, P.h);

  if (total) {
    // keeps the words readable over the moving light (as in PoolHero)
    const scrim = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, 420);
    scrim.addColorStop(0, 'rgba(3,16,60,0.62)');
    scrim.addColorStop(0.55, 'rgba(3,16,60,0.26)');
    scrim.addColorStop(1, 'rgba(3,16,60,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(P.x, P.y, P.w, P.h);
    text(ctx, 'Overall total', P.x + 30, P.y + 50, { font: '500 17px Geist', color: C.heroMuted });
    text(ctx, euro(ACCOUNTS.reduce((s, a) => s + a.cents, 0)), P.x + 28, P.y + 100, { font: '800 50px Bricolage', color: C.heroText, spacing: -1.2 });
    text(ctx, 'across 5 accounts', P.x + 30, P.y + 130, { font: '500 17px Geist', color: C.heroMuted });
  }

  const sim = makeRaft(ACCOUNTS.map(spec), { width: P.w, height: P.h, x0: 0.035, x1: 0.975, waterline: 0.86, maxR: 50 }, 'good');
  const target = look === 'title' ? { x: -330, y: 150 } : look === 'total' ? { x: 150, y: 60 } : look === 'viewer' ? { x: P.w / 2, y: P.h * 0.62 } : null;
  simulate(sim, t, target);
  ctx.drawImage(drawRaft(sim, P.w, P.h, S), P.x, P.y, P.w, P.h);
  ctx.restore();

  // a thin rim of light on the pool edge
  ctx.save();
  rr(ctx, P.x + 0.75, P.y + 0.75, P.w - 1.5, P.h - 1.5, P.r - 0.75);
  ctx.strokeStyle = night ? 'rgba(134,228,255,0.22)' : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // the words
  const X = 64;
  const titleMax = P.x - X - 40;
  ctx.font = '600 15px Geist';
  ctx.letterSpacing = '1.6px';
  const pillText = 'LIDO EDITION';
  const pw = ctx.measureText(pillText).width + 28;
  ctx.letterSpacing = '0px';
  rr(ctx, X, 46, pw, 32, 16);
  ctx.fillStyle = C.pill;
  ctx.fill();
  text(ctx, pillText, X + 14, 67, { font: '600 15px Geist', color: C.onPill, spacing: 1.6 });

  const size = fitFont(ctx, 'Overview', 800, 'Bricolage', 108, titleMax, -0.025);
  const line1 = 96 + size * 0.74;
  const line2 = line1 + size * 0.9;
  text(ctx, 'Finance', X - 4, line1, { font: `800 ${size}px Bricolage`, color: C.text, spacing: -size * 0.025 });
  text(ctx, 'Overview', X - 4, line2, { font: `800 ${size}px Bricolage`, color: C.text, spacing: -size * 0.025 });

  const ropeY = line2 + 30;
  laneRope(ctx, X, ropeY, titleMax - 20, 0.85, C, { height: 12 });

  const promise = ropeY + 12 + 48;
  text(ctx, night ? 'Your money as a pool after dark.' : 'Your money as a sunlit pool.', X, promise, { font: '600 26px Geist', color: C.text, spacing: -0.3 });
  text(ctx, 'Every account is an otter. Its pebble is the balance.', X, promise + 32, { font: '400 19px Geist', color: C.textSecondary });

  if (cta) {
    const label = 'Swim in the live demo';
    ctx.font = '600 17px Geist';
    const lw = ctx.measureText(label).width;
    const bx = X;
    const by = promise + 32 + 30;
    rr(ctx, bx, by, lw + 64, 44, 22);
    ctx.fillStyle = C.primary;
    ctx.fill();
    text(ctx, label, bx + 20, by + 28, { font: '600 17px Geist', color: night ? '#06112E' : '#FFFBF2' });
    // arrow out
    const ax = bx + lw + 34;
    const ay = by + 22;
    ctx.strokeStyle = night ? '#06112E' : '#FFFBF2';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - 5, ay + 5);
    ctx.lineTo(ax + 5, ay - 5);
    ctx.moveTo(ax - 3, ay - 5);
    ctx.lineTo(ax + 5, ay - 5);
    ctx.lineTo(ax + 5, ay + 3);
    ctx.stroke();
  }

  ctx.restore();
  return canvas;
}

// ---------- how to read an otter (a looping close-up) ----------
const ease3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function drawCursor(ctx, x, y, s = 1.15) {
  ctx.save();
  ctx.translate(x - 3 * s, y - 2 * s);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  const p = new Path2D('M3 2 L3 24 L9 18.5 L13 27 L17 25.2 L13 16.8 L21 16.8 Z');
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(p);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0E1B3D';
  ctx.stroke(p);
  ctx.restore();
}

function specimen({ S = 1, L = 6, fps = 12, night = false } = {}) {
  const W = 1200;
  const H = 440;
  const C = night ? UI.night : UI.day;
  // every idle motion completes whole cycles in one loop, so the GIF restarts without a jump
  const w = TAU / L;
  globalThis.__otterW = { b1: w, b2: w, rot: w, sway: w };

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');

  const picks = [ACCOUNTS[1], ACCOUNTS[0], ACCOUNTS[2]];
  const notes = ['small balance, small pebble', 'bigger balance, bigger pebble', 'savings hold sea glass'];
  const sim = makeRaft(picks.map(spec), { width: W, height: H, x0: 0.02, x1: 0.98, waterline: 0.6, maxR: 70 }, 'good');
  const [o1, o2, o3] = sim.raft.otters;

  // the still part: water, a scrim for the words, and the words
  const bg = document.createElement('canvas');
  bg.width = W * S;
  bg.height = H * S;
  const b = bg.getContext('2d');
  b.setTransform(S, 0, 0, S, 0, 0);
  b.save();
  rr(b, 0, 0, W, H, 36);
  b.clip();
  const water = makeWater(Math.round(W * S * 0.62), Math.round(H * S * 0.62), night);
  water.draw(9.4);
  b.imageSmoothingQuality = 'high';
  b.drawImage(water.canvas, 0, 0, W, H);
  const scrim = b.createLinearGradient(0, H * 0.6, 0, H);
  scrim.addColorStop(0, 'rgba(3,16,60,0)');
  scrim.addColorStop(0.45, 'rgba(3,16,60,0.34)');
  scrim.addColorStop(1, 'rgba(3,16,60,0.5)');
  b.fillStyle = scrim;
  b.fillRect(0, 0, W, H);
  picks.forEach((a, i) => {
    const x = sim.raft.otters[i].x;
    text(b, a.label, x, 340, { font: '600 19px Geist', color: C.heroText, align: 'center' });
    text(b, euro(a.cents), x, 378, { font: '800 30px Bricolage', color: C.heroText, align: 'center', spacing: -0.6 });
    text(b, notes[i], x, 408, { font: '500 17px Geist', color: C.heroMuted, align: 'center' });
  });
  b.restore();

  // the cursor's walk: rest, look left, look right, click the middle otter, come back
  const A = { x: 600, y: 58 };
  const Bp = { x: 190, y: 80 };
  const Cp = { x: 1010, y: 72 };
  const D = { x: o2.x + 6, y: 190 };
  const keys = [[0, A], [0.5, A], [1.6, Bp], [2.0, Bp], [3.0, Cp], [3.3, Cp], [3.9, D], [4.45, D], [5.4, A], [L, A]];
  const cursorAt = (u) => {
    for (let k = 0; k < keys.length - 1; k++) {
      const [t0, p0] = keys[k];
      const [t1, p1] = keys[k + 1];
      if (u >= t0 && u <= t1) {
        const e = t1 === t0 ? 1 : ease3((u - t0) / (t1 - t0));
        return { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e };
      }
    }
    return A;
  };
  const CLICK = 3.95;
  const blinks = [[o1, 1.15], [o2, 2.35], [o3, 0.75], [o3, 4.7], [o1, 5.05]];
  const rings = [[o1, 0.35], [o2, 1.85], [o3, 3.25]];
  const crossed = (u0, u1, at) => u0 < at && u1 >= at;

  function step(to) {
    const dt = 1 / 240;
    while (sim.t < to - 1e-9) {
      const t0 = sim.t;
      sim.t = Math.min(to, sim.t + dt);
      const u0 = t0 % L;
      const u1 = u0 + (sim.t - t0);
      for (const o of sim.raft.otters) {
        o.blinkAt = 1e9;
        o.nextRing = 1e9;
        o.nextAction = 1e9;
      }
      for (const [o, at] of blinks) if (crossed(u0, u1, at)) o.blinkT = sim.t;
      for (const [o, at] of rings) if (crossed(u0, u1, at)) o.ringT = sim.t;
      if (crossed(u0, u1, CLICK)) sim.raft.cheer(o2, sim.t);
      const cur = cursorAt(sim.t % L);
      sim.raft.hovered = sim.raft.hit(cur.x, cur.y);
      sim.raft.update(sim.t - t0, sim.t, cur, 0, null, false);
    }
  }

  const frames = Math.round(L * fps);
  return {
    canvas,
    frames,
    /** frame i of the second pass through the loop (the first one settles the springs) */
    render(i) {
      const t = L + i / fps;
      step(t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bg, 0, 0);
      ctx.save();
      ctx.setTransform(S, 0, 0, S, 0, 0);
      rr(ctx, 0, 0, W, H, 36);
      ctx.clip();
      ctx.drawImage(drawRaft(sim, W, H, S), 0, 0, W, H);
      const u = t % L;
      const cur = cursorAt(u);
      const since = u - CLICK;
      if (since >= 0 && since < 0.42) {
        const k = since / 0.42;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(cur.x, cur.y, 16 + k * 20, 0, TAU);
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(31,79,224,0.55)';
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,248,236,0.98)';
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawCursor(ctx, cur.x, cur.y);
      ctx.restore();
    },
  };
}

// ---------- day swim, night swim (a wall of real screenshots) ----------
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

function shot(ctx, img, x, y, w, { r = 16, dark = false } = {}) {
  const h = (w * img.height) / img.width;
  ctx.save();
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.5)' : 'rgba(14,27,61,0.22)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = dark ? '#07122E' : '#FBF3E4';
  ctx.fill();
  ctx.restore();
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();
  return h;
}

function phone(ctx, img, x, y, w, { dark = false } = {}) {
  const bezel = 7;
  const h = (w * img.height) / img.width;
  ctx.save();
  ctx.shadowColor = dark ? 'rgba(0,0,0,0.55)' : 'rgba(14,27,61,0.3)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  rr(ctx, x - bezel, y - bezel, w + bezel * 2, h + bezel * 2, 34);
  ctx.fillStyle = '#0B1330';
  ctx.fill();
  ctx.restore();
  rr(ctx, x - bezel + 1, y - bezel + 1, w + bezel * 2 - 2, h + bezel * 2 - 2, 33);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  rr(ctx, x, y, w, h, 27);
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

async function wall({ S = 2 } = {}) {
  const W = 1200;
  const H = 700;
  const [deskDay, deskNight, phoneDay, phoneNight] = await Promise.all(
    ['desk-monthly-day', 'desk-transactions-night', 'phone-dashboard-day', 'phone-dashboard-night'].map((n) => loadImage(`./shots/${n}.png`)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.save();
  rr(ctx, 0, 0, W, H, 36);
  ctx.clip();

  // two halves of one deck: golden hour on the left, the pool lamps on the right
  const day = ctx.createLinearGradient(0, 0, 0, H);
  day.addColorStop(0, '#FDEBD0');
  day.addColorStop(0.6, '#FBF3E4');
  ctx.fillStyle = day;
  ctx.fillRect(0, 0, W / 2, H);
  const night = ctx.createLinearGradient(0, 0, 0, H);
  night.addColorStop(0, '#0A1A44');
  night.addColorStop(0.55, '#07122E');
  ctx.fillStyle = night;
  ctx.fillRect(W / 2, 0, W / 2, H);
  const glow = (x, y, r, color, clipX) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, 0, W / 2, H);
    ctx.clip();
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };
  glow(140, -60, 460, 'rgba(255,190,98,0.42)', 0);
  glow(1080, -60, 460, 'rgba(63,212,245,0.16)', W / 2);

  text(ctx, 'Day swim', 48, 70, { font: '800 30px Bricolage', color: UI.day.text, spacing: -0.6 });
  text(ctx, 'light mode', 48, 96, { font: '500 17px Geist', color: UI.day.textSecondary });
  text(ctx, 'Night swim', W - 48, 70, { font: '800 30px Bricolage', color: UI.night.text, spacing: -0.6, align: 'right' });
  text(ctx, 'dark mode, with pool lamps', W - 48, 96, { font: '500 17px Geist', color: UI.night.textSecondary, align: 'right' });

  const dw = 500;
  shot(ctx, deskDay, 48, 132, dw);
  shot(ctx, deskNight, W - 48 - dw, 132, dw, { dark: true });
  const pw = 186;
  phone(ctx, phoneDay, W / 2 - 38 - pw, 236, pw);
  phone(ctx, phoneNight, W / 2 + 38, 236, pw, { dark: true });

  ctx.restore();
  return canvas;
}

// ---------- scenes ----------
const scenes = { hero, specimen, wall };

window.stage = {
  ready: loadFonts(),
  /** Render a still scene and return it as a PNG data URL */
  async png(name, opts = {}) {
    await this.ready;
    const canvas = await scenes[name](opts);
    document.body.replaceChildren(canvas);
    canvas.style.width = `${canvas.width / (opts.S ?? 2)}px`;
    return canvas.toDataURL('image/png');
  },
  /** Start an animated scene; then call frame(i) for each frame */
  async start(name, opts = {}) {
    await this.ready;
    this.scene = scenes[name](opts);
    document.body.replaceChildren(this.scene.canvas);
    return { width: this.scene.canvas.width, height: this.scene.canvas.height, frames: this.scene.frames };
  },
  frame(i) {
    this.scene.render(i);
    return this.scene.canvas.toDataURL('image/png');
  },
};
