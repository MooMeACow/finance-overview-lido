import React, { useEffect, useRef } from 'react';

import { Portrait } from './otter/engine';
import { pointer, trackPointer } from './pointer';
import { useReducedMotion } from './motionPrefs';

/**
 * One otter's face in a small round window (the logo, empty states). It blinks, and
 * watches the cursor wherever it is on the page.
 */
export function OtterPortrait({ size = 36, seed = 7, background = '#1F4FE0' }: { size?: number; seed?: number; background?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    trackPointer();
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const face = new Portrait(seed);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    let last = performance.now() / 1000;
    let frame = 0;
    let running = false;
    const R = size * 0.34;
    const tick = () => {
      const now = performance.now() / 1000;
      const rect = canvas.getBoundingClientRect();
      const look = pointer.active ? { x: pointer.x - rect.left, y: pointer.y - rect.top } : null;
      face.update(now - last, now, look, size / 2, size * 0.5, R, reduced);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      face.draw(ctx, reduced);
    };
    const loop = () => {
      tick();
      frame = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(frame);
    };
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()));
    io.observe(canvas);
    tick();
    play();
    return () => {
      pause();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [size, seed, reduced]);

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        overflow: 'hidden',
        backgroundColor: background,
        backgroundImage: 'radial-gradient(120% 90% at 80% 0%, rgba(120,220,255,0.55), transparent 60%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 6px rgba(0,10,40,0.25)',
        flexShrink: 0,
      }}
    >
      <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} />
    </div>
  );
}
