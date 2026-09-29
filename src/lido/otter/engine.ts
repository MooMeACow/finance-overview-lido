/**
 * Sea otters for the pool, drawn in code on a 2D canvas.
 *
 * One otter per account floats in the water hugging a pebble; the pebble's size follows the
 * balance (sand-coloured stone for everyday money, sea glass for savings). They turn to look
 * at the cursor, blink, bob, yawn, sniff, roll and dive, and perk up when you hover them or
 * their account row.
 *
 * Credits: the idea of creatures that turn to look at you comes from GordenSun's
 * "little-critters" (no licence, so used as a reference only; this is original code). The
 * hand-inked line that "boils" at 12 fps is adapted from procedural-film by Dean Kuhn (MIT).
 */

export type OtterSpec = {
  id: number;
  /** Tooltip title, e.g. the account name */
  label: string;
  /** Tooltip line, e.g. the formatted balance */
  sub: string;
  /** 0..1: pebble size relative to the biggest balance */
  share: number;
  kind: 'current' | 'savings' | 'none';
};

export type Mood = 'good' | 'ok' | 'low';

type Particle = {
  kind: 'bubble' | 'heart' | 'z' | 'drop' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
};

type Action = { id: ActionId; t0: number; dur: number; side: number; fired: number };
type ActionId = 'yawn' | 'ears' | 'happy' | 'dive' | 'roll' | 'sniff' | 'look';

const TAU = Math.PI * 2;
const INK = '#1E1A33';
const NOSE = '#2A1B18';
const EYE = '#16100E';
const BLUSH = '#F29C8E';

const COATS = [
  { coat: '#7B4F34', dark: '#573523', face: '#F2E3C9', muzzle: '#FCF3E4' },
  { coat: '#684430', dark: '#4A2E1F', face: '#EEDCBF', muzzle: '#FAF0DD' },
  { coat: '#8F5F3E', dark: '#683F27', face: '#F5E9D5', muzzle: '#FEF7EC' },
  { coat: '#5D3F30', dark: '#41291E', face: '#E8D5B7', muzzle: '#F8ECD8' },
];

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const ease = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** 0 → 1 → 0 envelope over an action's progress */
const env = (p: number, a = 0.18, b = 0.18) => (p < a ? p / a : p > 1 - b ? (1 - p) / b : 1);

function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rng(seed: number) {
  let a = seed | 0;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next: r, range: (lo: number, hi: number) => lo + (hi - lo) * r() };
}

// ---------- the inked line ----------

/**
 * Strokes (and optionally fills) a closed or open path through `pts` with a hand-drawn line:
 * every vertex drifts sideways by a small seeded amount that changes 12 times a second.
 */
function ink(
  ctx: CanvasRenderingContext2D,
  pts: number[],
  o: { closed?: boolean; width?: number; color?: string; fill?: string | CanvasGradient; seed: number; boil: number; amp: number; alpha?: number },
) {
  const n = pts.length / 2;
  if (n < 2) return;
  const closed = o.closed !== false;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = (hash(i, o.seed, o.boil) - 0.5) * 2 * o.amp;
  const P = new Float32Array(pts.length);
  for (let i = 0; i < n; i++) {
    const ip = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
    const inx = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const j = (raw[ip] + 2 * raw[i] + raw[inx]) / 4;
    const tx = pts[2 * inx] - pts[2 * ip];
    const ty = pts[2 * inx + 1] - pts[2 * ip + 1];
    const tl = Math.hypot(tx, ty) || 1;
    P[2 * i] = pts[2 * i] - (ty / tl) * j;
    P[2 * i + 1] = pts[2 * i + 1] + (tx / tl) * j;
  }
  ctx.beginPath();
  if (closed) {
    const mx = (P[2 * (n - 1)] + P[0]) / 2;
    const my = (P[2 * (n - 1) + 1] + P[1]) / 2;
    ctx.moveTo(mx, my);
    for (let i = 0; i < n; i++) {
      const nx = P[2 * ((i + 1) % n)];
      const ny = P[2 * ((i + 1) % n) + 1];
      ctx.quadraticCurveTo(P[2 * i], P[2 * i + 1], (P[2 * i] + nx) / 2, (P[2 * i + 1] + ny) / 2);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(P[0], P[1]);
    for (let i = 1; i < n - 1; i++) {
      ctx.quadraticCurveTo(P[2 * i], P[2 * i + 1], (P[2 * i] + P[2 * i + 2]) / 2, (P[2 * i + 1] + P[2 * i + 3]) / 2);
    }
    ctx.lineTo(P[2 * (n - 1)], P[2 * (n - 1) + 1]);
  }
  const a = ctx.globalAlpha;
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.width) {
    ctx.globalAlpha = a * (o.alpha ?? 0.9);
    ctx.lineWidth = o.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.color ?? INK;
    ctx.stroke();
    ctx.globalAlpha = a;
  }
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n = 28, rot = 0): number[] {
  const out: number[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

function tracePts(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

// ---------- one otter ----------

class Otter {
  spec: OtterSpec;
  seed: number;
  coat: (typeof COATS)[number];
  // layout (canvas px)
  x = 0;
  wl = 0; // waterline
  R = 30;
  back = false;
  // life
  phase: number;
  yaw = 0;
  yawV = 0;
  pitch = 0;
  pitchV = 0;
  ex = 0;
  ey = 0;
  roll = 0;
  lid = 0;
  blinkAt: number;
  blinkT = -1;
  mouth = 0;
  smile = 0.4;
  ears = 0;
  sniff = 0;
  happy = 0;
  sleepy = 0;
  dive = 0; // how far under the surface, in R
  hover = 0;
  perk = 0;
  appear = 0;
  appearAt = 0;
  action: Action | null = null;
  nextAction: number;
  wander = { x: 0, y: 0, until: 0 };
  nextRing: number;
  ringT = -10;
  pebble: number[];

  constructor(spec: OtterSpec, index: number, now: number) {
    this.spec = spec;
    this.seed = (spec.id * 2654435761 + index * 97) | 0;
    const r = rng(this.seed);
    this.coat = COATS[Math.floor(r.next() * COATS.length)];
    this.phase = r.range(0, TAU);
    this.blinkAt = now + r.range(1.2, 4.5);
    this.nextAction = now + r.range(2.5, 7);
    this.nextRing = now + r.range(0.5, 2.5);
    // an irregular pebble outline, fixed per otter
    this.pebble = [];
    const k = 9;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU;
      const rr = 1 + (r.next() - 0.5) * 0.28;
      this.pebble.push(Math.cos(a) * rr * 1.18, Math.sin(a) * rr * 0.9);
    }
  }

  /** Head centre in canvas px */
  head(t: number, reduced: boolean) {
    const bob = reduced ? 0 : (Math.sin(t * 1.15 + this.phase) * 0.055 + Math.sin(t * 0.55 + this.phase * 1.7) * 0.03) * this.R;
    const rise = (1 - this.appear) * 2.8 * this.R;
    return { hx: this.x, hy: this.wl - 1.52 * this.R + bob + this.dive * this.R + rise };
  }
}

// ---------- the raft ----------

export type Layout = {
  width: number;
  height: number;
  /** Horizontal band the otters float in, as fractions of the width */
  x0: number;
  x1: number;
  /** Waterline of the front row, as a fraction of the height */
  waterline: number;
  /** Largest head radius allowed, px */
  maxR: number;
};

export class Raft {
  otters: Otter[] = [];
  particles: Particle[] = [];
  mood: Mood = 'ok';
  hovered: Otter | null = null;
  private t = 0;
  private started = false;

  setOtters(specs: OtterSpec[], now: number, intro: boolean) {
    const byId = new Map(this.otters.map((o) => [o.spec.id, o]));
    this.otters = specs.map((s, i) => {
      const existing = byId.get(s.id);
      if (existing) {
        existing.spec = s;
        return existing;
      }
      const o = new Otter(s, i, now);
      o.appear = intro ? 0 : 1;
      o.appearAt = now + 0.35 + i * 0.09;
      return o;
    });
  }

  layout(l: Layout) {
    const n = this.otters.length;
    if (n === 0) return;
    const x0 = l.x0 * l.width;
    const x1 = l.x1 * l.width;
    const span = x1 - x0;
    const step = span / n;
    const R = Math.max(14, Math.min(l.maxR, step * 0.5));
    const wl = l.waterline * l.height;
    this.otters.forEach((o, i) => {
      const jitter = (hash(o.seed, 7) - 0.5) * step * 0.12;
      o.back = n > 3 && i % 2 === 1;
      o.R = R * (o.back ? 0.86 : 1) * (0.94 + hash(o.seed, 3) * 0.1);
      o.x = x0 + step * (i + 0.5) + jitter;
      o.wl = wl - (o.back ? R * 0.55 : 0);
    });
  }

  /** The otter under a canvas-local point, if any */
  hit(x: number, y: number): Otter | null {
    for (let i = this.otters.length - 1; i >= 0; i--) {
      const o = this.otters[i];
      if (o.appear < 0.5 || o.dive > 0.8) continue;
      const { hx, hy } = o.head(this.t, false);
      const dx = (x - hx) / (o.R * 1.3);
      const dy = (y - (hy + o.R * 0.25)) / (o.R * 1.45);
      if (dx * dx + dy * dy < 1) return o;
    }
    return null;
  }

  /** Something made the otter happy (a click): a little splash and a flip of joy. */
  cheer(o: Otter, now: number) {
    o.action = { id: 'happy', t0: now, dur: 1.8, side: hash(o.seed, now | 0) < 0.5 ? -1 : 1, fired: 0 };
    const { hx } = o.head(this.t, false);
    for (let i = 0; i < 6; i++) this.emit('drop', hx + (i - 2.5) * o.R * 0.25, o.wl, { vx: (i - 2.5) * o.R * 0.9, vy: -o.R * (2.2 + hash(i, o.seed) * 1.4), life: 0.9, size: 0.6 + hash(o.seed, i) * 0.5 });
  }

  private emit(kind: Particle['kind'], x: number, y: number, o: Partial<Particle> = {}) {
    if (this.particles.length > 160) return;
    this.particles.push({
      kind,
      x,
      y,
      vx: o.vx ?? 0,
      vy: o.vy ?? -20,
      born: this.t,
      life: o.life ?? 1.4,
      size: o.size ?? 1,
    });
  }

  /**
   * Advance the simulation.
   * @param look  where to look (canvas-local px), or null to let each otter wander
   * @param idle  seconds since the pointer last moved (sleepy after a while)
   * @param perkId the account whose row is hovered elsewhere on the page
   */
  update(dt: number, now: number, look: { x: number; y: number } | null, idle: number, perkId: number | null, reduced: boolean) {
    this.t = now;
    if (!this.started) this.started = true;
    dt = Math.min(dt, 0.05);
    const sleepyPage = !reduced && idle > 28;

    for (const o of this.otters) {
      // entrance: rise out of the water, staggered
      if (o.appear < 1) {
        const p = clamp((now - o.appearAt) / 0.9);
        const before = o.appear;
        o.appear = reduced ? 1 : 1 - Math.pow(1 - p, 3);
        if (before < 0.55 && o.appear >= 0.55 && !reduced) {
          for (let i = 0; i < 5; i++) this.emit('bubble', o.x + (hash(i, o.seed) - 0.5) * o.R * 1.6, o.wl, { vy: -o.R * (0.8 + hash(o.seed, i)), life: 1.2, size: 0.5 + hash(i, 3) * 0.6 });
        }
      }

      const { hx, hy } = o.head(now, reduced);
      const isHover = this.hovered === o;
      o.hover = ease(o.hover, isHover ? 1 : 0, 10, dt);
      o.perk = ease(o.perk, perkId === o.spec.id ? 1 : 0, 8, dt);

      // ----- gaze -----
      let tx: number;
      let ty: number;
      if (look) {
        tx = look.x;
        ty = look.y;
      } else {
        if (now > o.wander.until) {
          const r = rng((o.seed + Math.floor(now * 3)) | 0);
          o.wander = { x: hx + r.range(-6, 6) * o.R, y: hy + r.range(-3, 2) * o.R, until: now + r.range(1.8, 4.5) };
        }
        tx = o.wander.x;
        ty = o.wander.y;
      }
      const D = o.R * 5;
      let yawT = clamp((tx - hx) / D, -1, 1);
      let pitchT = clamp((ty - hy) / D, -0.8, 0.9);

      // ----- actions -----
      let mouthT = 0;
      let smileT = this.mood === 'good' ? 0.55 : this.mood === 'low' ? 0.05 : 0.35;
      let earsT = 0;
      let sniffT = 0;
      let happyT = 0;
      let rollT = 0;
      let diveT = 0;
      let lidT = 0;

      if (!reduced && !o.action && now > o.nextAction && o.appear >= 1) {
        o.action = this.pickAction(o, now);
        o.nextAction = now + o.action.dur + rng(o.seed + Math.floor(now)).range(3, 9);
      }
      const a = o.action;
      if (a) {
        const p = (now - a.t0) / a.dur;
        if (p >= 1) o.action = null;
        else if (a.id === 'yawn') {
          const k = p < 0.3 ? p / 0.3 : p < 0.7 ? 1 : (1 - p) / 0.3;
          mouthT = k;
          lidT = 0.8 * k;
          if (!look) pitchT = -0.35 * k;
        } else if (a.id === 'ears') {
          earsT = Math.sin(p * Math.PI * 6) * (1 - p);
        } else if (a.id === 'sniff') {
          sniffT = env(p) * (0.5 + 0.5 * Math.sin(p * Math.PI * 14));
          pitchT -= 0.25 * env(p);
        } else if (a.id === 'happy') {
          happyT = env(p, 0.12, 0.2);
          smileT = 1;
          if (a.fired === 0 && p > 0.25) {
            a.fired = 1;
            this.emit('heart', hx + o.R * 0.9 * a.side, hy - o.R * 0.7, { vx: a.side * o.R * 0.3, vy: -o.R * 1.1, life: 1.3, size: 1 });
          }
          if (a.fired === 1 && p > 0.5) {
            a.fired = 2;
            this.emit('spark', hx - o.R * 0.85 * a.side, hy - o.R * 0.9, { vx: 0, vy: -o.R * 0.6, life: 0.9, size: 0.9 });
          }
        } else if (a.id === 'roll') {
          rollT = Math.sin(p * TAU) * 0.32 * env(p, 0.2, 0.2) * a.side;
        } else if (a.id === 'look') {
          if (!look) {
            yawT = (p < 0.45 ? -0.8 : p < 0.85 ? 0.8 : 0) * a.side;
            pitchT = 0.1;
          }
        } else if (a.id === 'dive') {
          // sink, stay under with bubbles, pop back up with a splash
          diveT = p < 0.22 ? smooth(0, 0.22, p) * 2.9 : p < 0.55 ? 2.9 : p < 0.8 ? 2.9 * (1 - smooth(0.55, 0.8, p)) - 0.25 * Math.sin(smooth(0.55, 0.8, p) * Math.PI) : 0;
          if (p > 0.22 && p < 0.55 && hash(Math.floor(now * 9), o.seed) < 0.35) {
            this.emit('bubble', hx + (hash(Math.floor(now * 30), 1) - 0.5) * o.R, o.wl, { vy: -o.R * 0.9, life: 0.9, size: 0.4 + hash(Math.floor(now * 30), 2) * 0.5 });
          }
          if (a.fired === 0 && p > 0.62) {
            a.fired = 1;
            o.ringT = now;
            for (let i = 0; i < 7; i++) this.emit('drop', hx + (i - 3) * o.R * 0.22, o.wl, { vx: (i - 3) * o.R * 0.8, vy: -o.R * (2.4 + hash(i, o.seed) * 1.6), life: 0.95, size: 0.55 + hash(o.seed, i) * 0.55 });
          }
          if (!look) pitchT = -0.3;
        }
      }

      if (sleepyPage) {
        o.sleepy = ease(o.sleepy, 1, 0.6, dt);
      } else o.sleepy = ease(o.sleepy, 0, 4, dt);
      if (o.sleepy > 0.6 && hash(Math.floor(now * 1.3), o.seed) < 0.012) this.emit('z', hx + o.R * 0.8, hy - o.R * 0.8, { vx: o.R * 0.2, vy: -o.R * 0.5, life: 2.2, size: 1 });

      // hover and a perked-up row: look bright, smile, lift a little
      if (o.hover > 0.01 || o.perk > 0.01) {
        const k = Math.max(o.hover, o.perk);
        smileT = Math.max(smileT, 0.9 * k);
        lidT *= 1 - k;
      }
      lidT = Math.max(lidT, o.sleepy * 0.82);
      if (o.sleepy > 0.3 && !look) pitchT = Math.max(pitchT, 0.35 * o.sleepy);

      // ----- blink -----
      if (o.blinkT < 0 && now > o.blinkAt) o.blinkT = now;
      let blink = 0;
      if (o.blinkT >= 0) {
        const b = (now - o.blinkT) / 0.16;
        blink = b < 0.5 ? b * 2 : b < 1 ? (1 - b) * 2 : 0;
        if (b >= 1) {
          o.blinkT = -1;
          const r = rng((o.seed + Math.floor(now * 7)) | 0);
          o.blinkAt = now + (r.next() < 0.15 ? 0.25 : r.range(2.2, 6));
        }
      }

      // ----- springs (a head has a little weight, eyes are quick) -----
      const k = 70;
      const c = 13;
      o.yawV += ((yawT - o.yaw) * k - o.yawV * c) * dt;
      o.yaw += o.yawV * dt;
      o.pitchV += ((pitchT - o.pitch) * k - o.pitchV * c) * dt;
      o.pitch += o.pitchV * dt;
      o.ex = ease(o.ex, yawT, 18, dt);
      o.ey = ease(o.ey, pitchT, 18, dt);
      o.lid = Math.max(blink, ease(o.lid, lidT, 12, dt));
      o.mouth = ease(o.mouth, mouthT, 10, dt);
      o.smile = ease(o.smile, smileT, 6, dt);
      o.ears = ease(o.ears, earsT, 30, dt);
      o.sniff = ease(o.sniff, sniffT, 25, dt);
      o.happy = ease(o.happy, happyT, 10, dt);
      o.roll = ease(o.roll, rollT, 6, dt);
      o.dive = ease(o.dive, diveT, 9, dt);

      // a ring spreads on the water now and then
      if (!reduced && now > o.nextRing) {
        o.ringT = now;
        o.nextRing = now + 2.2 + hash(o.seed, Math.floor(now)) * 2.5;
      }
    }

    // particles
    for (const p of this.particles) {
      const age = now - p.born;
      if (p.kind === 'drop') {
        p.vy += 520 * dt * (p.size + 0.4);
      } else if (p.kind === 'bubble') {
        p.vx = Math.sin(age * 6 + p.x) * 8;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => now - p.born < p.life);
  }

  private pickAction(o: Otter, now: number): Action {
    const w: [ActionId, number][] = [
      ['yawn', 0.7],
      ['ears', 0.9],
      ['sniff', 1],
      ['happy', this.mood === 'good' ? 1.1 : this.mood === 'low' ? 0.3 : 0.7],
      ['roll', 0.6],
      ['look', 0.9],
      ['dive', 0.45],
    ];
    const total = w.reduce((s, x) => s + x[1], 0);
    let r = hash(o.seed, Math.floor(now * 10)) * total;
    let id: ActionId = 'look';
    for (const [k, v] of w) {
      if ((r -= v) <= 0) {
        id = k;
        break;
      }
    }
    const dur = { yawn: 2.4, ears: 1.0, sniff: 1.5, happy: 2.0, roll: 1.8, look: 2.4, dive: 2.8 }[id];
    return { id, t0: now, dur, side: hash(o.seed, Math.floor(now)) < 0.5 ? -1 : 1, fired: 0 };
  }

  draw(ctx: CanvasRenderingContext2D, reduced: boolean) {
    const now = this.t;
    const boil = reduced ? 0 : Math.floor(now * 12);
    const order = [...this.otters].sort((a, b) => Number(b.back) - Number(a.back));
    for (const o of order) {
      if (o.appear <= 0.001) continue;
      const { hx, hy } = o.head(now, reduced);
      const W = ctx.canvas.width;
      // the part under the surface shows faintly through the water
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, o.wl, W, ctx.canvas.height);
      ctx.clip();
      ctx.globalAlpha = 0.1;
      drawOtter(ctx, o, hx, hy, boil, reduced, now, false);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, o.wl);
      ctx.clip();
      drawOtter(ctx, o, hx, hy, boil, reduced, now, true);
      ctx.restore();
      drawWaterline(ctx, o, hx, now);
    }
    for (const p of this.particles) drawParticle(ctx, p, now);
  }
}

// ---------- drawing ----------

function drawWaterline(ctx: CanvasRenderingContext2D, o: Otter, hx: number, now: number) {
  const R = o.R;
  const under = o.dive > 1.6;
  ctx.save();
  ctx.lineWidth = Math.max(1.2, R * 0.045);
  ctx.strokeStyle = 'rgba(214,247,255,0.6)';
  if (!under) {
    ctx.beginPath();
    ctx.ellipse(hx, o.wl, R * 1.02, R * 0.15, 0, 0, TAU);
    ctx.stroke();
  }
  const age = now - o.ringT;
  if (age >= 0 && age < 1.8) {
    const k = age / 1.8;
    ctx.globalAlpha = 0.55 * (1 - k);
    ctx.beginPath();
    ctx.ellipse(hx, o.wl, R * (1.05 + k * 1.1), R * (0.16 + k * 0.14), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOtter(ctx: CanvasRenderingContext2D, o: Otter, hx: number, hy: number, boil: number, reduced: boolean, now: number, lines: boolean) {
  const R = o.R;
  const col = o.coat;
  const amp = reduced ? 0 : Math.max(0.35, R * 0.012);
  const lw = lines ? Math.max(1.4, R * 0.055) : 0;
  const yaw = o.yaw;
  const pitch = o.pitch;
  const lift = -o.hover * R * 0.06 - o.perk * R * 0.08 - o.happy * Math.abs(Math.sin(now * 9)) * R * 0.07;

  ctx.save();
  ctx.translate(hx, hy + lift);
  ctx.rotate(o.roll + (reduced ? 0 : Math.sin(now * 0.8 + o.phase) * 0.03));
  const s = 1 + o.hover * 0.04;
  ctx.scale(s, s);

  // body and paws hold still-ish; the head turns
  const bodyPts = ellipsePts(0, R * 1.62, R * 1.02, R * 1.2, 30);
  ink(ctx, bodyPts, { fill: col.coat, width: lw, seed: o.seed + 1, boil, amp });

  // pebble hugged to the chest
  const pr = R * (0.2 + 0.26 * clamp(o.spec.share));
  const pcx = yaw * R * 0.06;
  const pcy = R * 1.05;
  if (o.spec.kind !== 'none') {
    const pp: number[] = [];
    for (let i = 0; i < o.pebble.length; i += 2) pp.push(pcx + o.pebble[i] * pr, pcy + o.pebble[i + 1] * pr);
    const g = ctx.createLinearGradient(pcx - pr, pcy - pr, pcx + pr, pcy + pr);
    if (o.spec.kind === 'savings') {
      g.addColorStop(0, '#C6FBF2');
      g.addColorStop(0.55, '#6FD6D2');
      g.addColorStop(1, '#2E98AA');
    } else {
      g.addColorStop(0, '#F2E4C6');
      g.addColorStop(0.6, '#D2B88E');
      g.addColorStop(1, '#A88D64');
    }
    ink(ctx, pp, { fill: g, width: lw * 0.9, seed: o.seed + 9, boil, amp });
    ctx.save();
    ctx.globalAlpha *= o.spec.kind === 'savings' ? 0.85 : 0.55;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(pcx - pr * 0.38, pcy - pr * 0.32, pr * 0.26, pr * 0.13, -0.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const side of [-1, 1]) {
    const px = side * R * (0.28 + pr / R * 0.72);
    ink(ctx, ellipsePts(px, R * 1.02, R * 0.2, R * 0.16, 18, side * 0.4), { fill: col.dark, width: lw, seed: o.seed + 20 + side, boil, amp });
  }

  // ears sit behind the head and move the other way when it turns
  for (const side of [-1, 1]) {
    const wig = side === 1 ? o.ears * 0.25 : -o.ears * 0.2;
    const ex = (side * 0.84 - yaw * 0.12) * R;
    const ey = (-0.55 - pitch * 0.04) * R;
    ink(ctx, ellipsePts(ex, ey, R * 0.21, R * 0.18, 16, wig), { fill: col.coat, width: lw, seed: o.seed + 30 + side, boil, amp });
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.ellipse(ex + side * R * 0.02, ey + R * 0.02, R * 0.1, R * 0.08, wig, 0, TAU);
    ctx.fill();
  }

  // head
  const headPts: number[] = [];
  const N = 36;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    let x = Math.cos(a) * 1.12;
    let y = Math.sin(a) * 0.95;
    if (y < 0) y *= 0.96;
    const cheek = 0.07 * (Math.exp(-((a - 0.72) ** 2) / 0.06) + Math.exp(-((a - 2.42) ** 2) / 0.06));
    x += Math.cos(a) * cheek;
    y += Math.sin(a) * cheek;
    x = x * (1 - Math.abs(yaw) * 0.05) + yaw * 0.05;
    headPts.push(x * R, y * R);
  }
  ink(ctx, headPts, { fill: col.coat, seed: o.seed + 40, boil, amp });

  // pale face, clipped to the head
  ctx.save();
  tracePts(ctx, headPts);
  ctx.clip();
  ctx.fillStyle = col.face;
  ctx.beginPath();
  ctx.ellipse(yaw * 0.22 * R, (0.16 + pitch * 0.1) * R, R * 0.95, R * 0.8, 0, 0, TAU);
  ctx.fill();
  // low sun from the top right
  const sheen = ctx.createRadialGradient(R * 0.55, -R * 0.55, R * 0.05, R * 0.4, -R * 0.4, R * 1.3);
  sheen.addColorStop(0, 'rgba(255,214,150,0.35)');
  sheen.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-R * 1.3, -R * 1.2, R * 2.6, R * 2.4);
  ctx.restore();
  ink(ctx, headPts, { width: lw, seed: o.seed + 41, boil, amp });

  // cheeks
  ctx.save();
  ctx.globalAlpha *= 0.32 + o.smile * 0.18;
  ctx.fillStyle = BLUSH;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse((side * 0.6 + yaw * 0.25) * R, (0.3 + pitch * 0.2) * R, R * 0.17, R * 0.1, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // whisker pads
  const mx = yaw * 0.42 * R;
  const my = (0.38 + pitch * 0.3) * R;
  for (const side of [-1, 1]) {
    ink(ctx, ellipsePts(mx + side * R * 0.19, my, R * 0.21, R * 0.18, 18), { fill: col.muzzle, width: lw * 0.55, alpha: 0.5, seed: o.seed + 50 + side, boil, amp });
    ctx.fillStyle = 'rgba(40,26,24,0.55)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(mx + side * R * (0.13 + k * 0.07), my + R * (0.02 + (k % 2) * 0.05), Math.max(0.8, R * 0.018), 0, TAU);
      ctx.fill();
    }
  }
  if (lines) {
    ctx.save();
    ctx.strokeStyle = 'rgba(30,26,51,0.45)';
    ctx.lineWidth = Math.max(0.8, R * 0.022);
    ctx.lineCap = 'round';
    const sway = reduced ? 0 : Math.sin(now * 1.4 + o.phase) * 0.05 + o.sniff * 0.08;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const bx = mx + side * R * 0.34;
        const by = my + R * (k * 0.06 - 0.02);
        const ang = (side > 0 ? 0 : Math.PI) + side * (-0.22 + k * 0.2 + sway);
        const len = R * (0.5 - k * 0.06);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + Math.cos(ang) * len * 0.55, by + Math.sin(ang) * len * 0.55 - R * 0.03, bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // nose
  const nx = yaw * 0.5 * R;
  const ny = (0.19 + pitch * 0.32) * R;
  const ns = 1 + o.sniff * 0.12;
  ctx.save();
  ctx.translate(nx, ny);
  ctx.scale(ns, ns);
  ctx.fillStyle = NOSE;
  ctx.beginPath();
  ctx.moveTo(-R * 0.18, -R * 0.07);
  ctx.quadraticCurveTo(0, -R * 0.14, R * 0.18, -R * 0.07);
  ctx.quadraticCurveTo(R * 0.17, R * 0.04, 0, R * 0.1);
  ctx.quadraticCurveTo(-R * 0.17, R * 0.04, -R * 0.18, -R * 0.07);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-R * 0.06, -R * 0.06, R * 0.06, R * 0.025, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // mouth
  const my2 = ny + R * 0.13;
  if (o.mouth > 0.05) {
    ctx.fillStyle = '#3B1D26';
    ctx.beginPath();
    ctx.ellipse(nx * 0.95, my2 + R * 0.12 * o.mouth, R * 0.12, R * 0.16 * o.mouth + R * 0.02, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#EE8E93';
    ctx.beginPath();
    ctx.ellipse(nx * 0.95, my2 + R * 0.2 * o.mouth, R * 0.08, R * 0.06 * o.mouth, 0, 0, TAU);
    ctx.fill();
  } else if (lines) {
    ctx.strokeStyle = INK;
    ctx.globalAlpha *= 0.85;
    ctx.lineWidth = Math.max(1, R * 0.035);
    ctx.lineCap = 'round';
    const up = o.smile * R * 0.06;
    ctx.beginPath();
    ctx.moveTo(nx, ny + R * 0.09);
    ctx.lineTo(nx, my2);
    ctx.moveTo(nx - R * 0.14, my2 + R * 0.02 - up);
    ctx.quadraticCurveTo(nx - R * 0.07, my2 + R * 0.09 + up * 0.3, nx, my2);
    ctx.quadraticCurveTo(nx + R * 0.07, my2 + R * 0.09 + up * 0.3, nx + R * 0.14, my2 + R * 0.02 - up);
    ctx.stroke();
    ctx.globalAlpha /= 0.85;
  }

  // eyes
  const happy = Math.max(o.happy, o.hover * 0.0);
  for (const side of [-1, 1]) {
    const ex = (side * 0.37 + yaw * 0.3 + o.ex * 0.05) * R;
    const ey = (-0.1 + pitch * 0.22 + o.ey * 0.04) * R;
    const er = R * 0.115 * (1 + side * yaw * 0.08) * (1 + o.hover * 0.08);
    if (happy > 0.5) {
      ctx.strokeStyle = EYE;
      ctx.lineWidth = Math.max(1.2, R * 0.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey + er * 0.35, er * 0.9, Math.PI + 0.35, TAU - 0.35);
      ctx.stroke();
      continue;
    }
    const open = 1 - o.lid;
    if (open < 0.12) {
      ctx.strokeStyle = EYE;
      ctx.lineWidth = Math.max(1.1, R * 0.042);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - er, ey + er * 0.1);
      ctx.quadraticCurveTo(ex, ey + er * 0.55, ex + er, ey + er * 0.1);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = EYE;
    ctx.beginPath();
    ctx.ellipse(ex, ey + er * (1 - open) * 0.5, er, er * open, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ex + er * 0.34, ey - er * 0.32 * open, er * 0.32, 0, TAU);
    ctx.fill();
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.arc(ex - er * 0.3, ey + er * 0.28 * open, er * 0.12, 0, TAU);
    ctx.fill();
    ctx.globalAlpha /= 0.7;
  }
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, now: number) {
  const k = (now - p.born) / p.life;
  const a = k < 0.15 ? k / 0.15 : 1 - smooth(0.55, 1, k);
  ctx.save();
  ctx.globalAlpha = a;
  const s = p.size;
  if (p.kind === 'bubble') {
    ctx.strokeStyle = 'rgba(225,250,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2 + s * 2.6, 0, TAU);
    ctx.stroke();
  } else if (p.kind === 'drop') {
    ctx.fillStyle = 'rgba(214,247,255,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.4 + s * 2, 0, TAU);
    ctx.fill();
  } else if (p.kind === 'heart') {
    const r = 5 * s;
    ctx.fillStyle = '#FF8A73';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + r * 0.9);
    ctx.bezierCurveTo(p.x - r * 1.6, p.y - r * 0.2, p.x - r * 0.6, p.y - r * 1.4, p.x, p.y - r * 0.45);
    ctx.bezierCurveTo(p.x + r * 0.6, p.y - r * 1.4, p.x + r * 1.6, p.y - r * 0.2, p.x, p.y + r * 0.9);
    ctx.fill();
  } else if (p.kind === 'spark') {
    const r = 6 * s;
    ctx.fillStyle = '#FFD36B';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU;
      const rr = i % 2 === 0 ? r : r * 0.32;
      ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
  } else if (p.kind === 'z') {
    ctx.fillStyle = 'rgba(255,248,236,0.9)';
    ctx.font = `600 ${Math.round(12 + k * 6)}px Geist_600SemiBold, system-ui, sans-serif`;
    ctx.fillText('z', p.x, p.y);
  }
  ctx.restore();
}

/**
 * A single otter face for small places (the logo, empty states): the same drawing,
 * cropped to the head, looking at a point.
 */
export class Portrait {
  private raft = new Raft();
  constructor(id: number) {
    this.raft.setOtters([{ id, label: '', sub: '', share: 0, kind: 'none' }], 0, false);
  }
  update(dt: number, now: number, look: { x: number; y: number } | null, cx: number, cy: number, R: number, reduced: boolean) {
    const o = this.raft.otters[0];
    o.x = cx;
    o.R = R;
    o.wl = cy + 1.52 * R + R * 2; // keep the waterline out of frame
    this.raft.update(dt, now, look, 0, null, reduced);
    // keep portraits calm: no diving out of the frame
    if (o.action?.id === 'dive') o.action = null;
  }
  draw(ctx: CanvasRenderingContext2D, reduced: boolean) {
    const o = this.raft.otters[0];
    const { hx, hy } = o.head(0, true);
    const boil = reduced ? 0 : Math.floor(performance.now() / 1000 * 12);
    drawOtter(ctx, o, hx, hy - o.R * 2, boil, reduced, performance.now() / 1000, true);
  }
}
