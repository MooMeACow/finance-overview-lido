import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useIsDark } from '../theme';
import { useReducedMotion } from './motionPrefs';
import { pool } from './buses';

/**
 * The pool: sunlit water with caustic light moving over the floor, drawn by one
 * fragment shader. Touching the water sends a ripple through the light.
 *
 * The caustic network is the edge distance of a slowly moving cell pattern, warped so
 * the filaments curve the way refracted light does, in two layers at different scales.
 * Rendered below device resolution (the light is soft anyway), paused when off-screen
 * or in a hidden tab, and a single still frame when the user prefers reduced motion.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uLight;
uniform vec3 uSun;
uniform float uNight;
uniform float uGain;
uniform vec4 uRip[4];

vec2 hash22(vec2 p) {
  vec3 a = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  a += dot(a, a.yzx + 33.33);
  return fract((a.xx + a.yz) * a.zy);
}

float cellEdge(vec2 p, float t) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = hash22(g + o);
      vec2 c = o + 0.5 + 0.4 * sin(t + 6.2831853 * h);
      float d = length(c - f);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}

float caustic(vec2 p, float t) {
  vec2 w = p + 0.3 * vec2(sin(p.y * 1.7 + t * 0.8), sin(p.x * 1.4 - t * 0.7));
  float e = cellEdge(w, t);
  return exp(-e * 15.0) + 0.28 * exp(-e * 4.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  vec2 disp = vec2(0.0);
  float ring = 0.0;
  for (int k = 0; k < 4; k++) {
    vec4 r = uRip[k];
    float age = uTime - r.z;
    if (r.w > 0.0 && age > 0.0 && age < 3.0) {
      vec2 dv = (gl_FragCoord.xy - r.xy) / uRes.y;
      float d = length(dv);
      float band = exp(-pow((d - age * 0.34) * 20.0, 2.0));
      float fade = (1.0 - age / 3.0) * r.w;
      disp += normalize(dv + 0.00001) * band * fade * 0.05;
      ring += band * fade;
    }
  }

  // the far end of the pool (top) compresses the light cells
  float far = uv.y;
  vec2 q = vec2((p.x - 0.5 * aspect) * (1.0 + far * 0.8) + 0.5 * aspect, p.y * (1.0 + far * 0.7));
  q += disp;

  float t = uTime;
  float c = caustic(q * 3.0, t) * 0.8 + caustic(q * 5.1 + 3.7, t * 1.21 + 1.3) * 0.45;

  float depth = clamp(0.58 * (1.0 - uv.y) + 0.42 * (1.0 - uv.x), 0.0, 1.0);
  vec3 col = mix(uShallow, uMid, smoothstep(0.05, 0.6, depth));
  col = mix(col, uDeep, smoothstep(0.5, 1.0, depth));

  col += uLight * c * mix(0.85, 0.32, depth) * uGain;
  col += uLight * ring * 0.3;

  // golden-hour warmth where the low sun reaches the water (top right)
  float sunAmt = pow(clamp(uv.x * 0.9 + uv.y * 0.6 - 0.45, 0.0, 1.0), 2.0);
  col += uSun * sunAmt * mix(0.24, 0.07, uNight);

  // at night the pool lamps glow up from the floor
  vec2 l1 = (uv - vec2(0.74, -0.06)) * vec2(aspect * 0.55, 2.4);
  vec2 l2 = (uv - vec2(0.24, -0.1)) * vec2(aspect * 0.55, 2.4);
  col += vec3(0.2, 0.72, 1.0) * (exp(-length(l1) * 2.8) + 0.7 * exp(-length(l2) * 3.0)) * 0.5 * uNight;

  vec2 vv = (uv - 0.5) * vec2(1.0, 1.15);
  col *= 1.0 - 0.26 * smoothstep(0.35, 0.85, length(vv));
  gl_FragColor = vec4(col, 1.0);
}
`;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

const DAY = { deep: '#0A3A9E', mid: '#1766E0', shallow: '#46C4F0', light: '#D2F6FF', sun: '#FFC56A' };
const NIGHT = { deep: '#020A2A', mid: '#07226F', shallow: '#0E5AAE', light: '#86E4FF', sun: '#FFB547' };

/** Resolution scale for the light (it is soft, so rendering under device pixels is invisible). */
const QUALITY = 0.62;

export function Water({ radius = 0 }: { radius?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dark = useIsDark();
  const reduced = useReducedMotion();
  const pal = dark ? NIGHT : DAY;
  // The GL setup outlives theme changes: a theme flip only swaps the colours (re-creating the
  // context would hand back the one we just released, and the pool would go blank)
  const darkRef = useRef(dark);
  const recolor = useRef<((dark: boolean) => void) | null>(null);

  useEffect(() => {
    darkRef.current = dark;
    recolor.current?.(dark);
  }, [dark]);

  // Release the GPU context only when the pool really leaves the page
  useEffect(
    () => () => {
      canvasRef.current?.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!gl) return; // the CSS gradient underneath stays visible

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u('uRes');
    const uTime = u('uTime');
    const uRip = u('uRip');
    const applyPalette = (isDark: boolean) => {
      const p = isDark ? NIGHT : DAY;
      gl.uniform3fv(u('uDeep'), hex(p.deep));
      gl.uniform3fv(u('uMid'), hex(p.mid));
      gl.uniform3fv(u('uShallow'), hex(p.shallow));
      gl.uniform3fv(u('uLight'), hex(p.light));
      gl.uniform3fv(u('uSun'), hex(p.sun));
      gl.uniform1f(u('uNight'), isDark ? 1 : 0);
      gl.uniform1f(u('uGain'), isDark ? 1 : 0.74);
    };
    applyPalette(darkRef.current);

    const ripples = new Float32Array(16);
    let nextRipple = 0;
    let scale = 1;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      scale = Math.min(window.devicePixelRatio || 1, 2) * QUALITY;
      canvas.width = Math.max(1, Math.round(r.width * scale));
      canvas.height = Math.max(1, Math.round(r.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    size();

    // a fixed starting point in the pattern, so the first frame always looks settled
    const start = performance.now() - 14000;
    const seconds = () => (performance.now() - start) / 1000;
    let frame = 0;
    let visible = true;
    let running = false;

    const draw = () => {
      gl.uniform1f(uTime, reduced ? 14 : seconds() * 0.55);
      gl.uniform4fv(uRip, ripples);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const offRipple = pool.onRipple(({ x, y, strength }) => {
      const i = (nextRipple++ % 4) * 4;
      ripples[i] = x * scale;
      ripples[i + 1] = canvas.height - y * scale;
      ripples[i + 2] = reduced ? -10 : seconds() * 0.55;
      ripples[i + 3] = strength;
    });

    // the pool this water fills; a press on something laid over it (a card) doesn't ripple it
    const host = canvas.parentElement?.parentElement;
    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      if (!(e.target instanceof Node) || !host?.contains(e.target)) return;
      pool.ripple(e.clientX - r.left, e.clientY - r.top, 0.9);
    };
    window.addEventListener('pointerdown', onDown, { passive: true });

    const ro = new ResizeObserver(() => {
      size();
      if (!running) draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);

    recolor.current = (isDark) => {
      applyPalette(isDark);
      if (!running) draw();
    };
    draw();
    play();
    return () => {
      pause();
      recolor.current = null;
      offRipple();
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      io.disconnect();
    };
  }, [reduced]);

  return (
    <View
      style={[{ pointerEvents: 'none' },
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: pal.mid,
          // shown until (or instead of) the shader
          backgroundImage: `radial-gradient(120% 90% at 85% 10%, ${pal.shallow} 0%, ${pal.mid} 45%, ${pal.deep} 100%)`,
        } as object,
      ]}
    >
      <canvas ref={canvasRef} aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
    </View>
  );
}
