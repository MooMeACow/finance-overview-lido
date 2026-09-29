import React, { useEffect, useRef } from 'react';

import { fonts } from '../theme';
import { Raft, type Layout, type Mood, type OtterSpec } from './otter/engine';
import { idleSeconds, pointer, trackPointer } from './pointer';
import { pool, raft as raftBus } from './buses';
import { useReducedMotion } from './motionPrefs';

export type { Mood, OtterSpec };

export type RaftLayout = Omit<Layout, 'width' | 'height'>;

/**
 * The otters in the pool, one per account. Draws into a canvas laid over the water;
 * the canvas ignores the pointer, so everything underneath stays clickable, and otters are
 * hit-tested from the page's pointer instead. Hover shows the account, click opens it.
 */
export function OtterRaft({
  otters,
  mood,
  layout,
  intro,
  onPress,
}: {
  otters: OtterSpec[];
  mood: Mood;
  layout: RaftLayout;
  /** Play the "rise out of the water" entrance (first visit only) */
  intro: boolean;
  onPress?: (id: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const raftRef = useRef<Raft | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const live = useRef({ otters, mood, layout, onPress });
  live.current = { otters, mood, layout, onPress };
  const reduced = useReducedMotion();

  // keep the otters in step with the accounts and the mood
  useEffect(() => {
    const r = raftRef.current;
    if (!r) return;
    r.setOtters(otters, performance.now() / 1000, false);
    r.mood = mood;
    const { w, h } = sizeRef.current;
    if (w > 0) r.layout({ width: w, height: h, ...layout });
  }, [otters, mood, layout]);

  useEffect(() => {
    trackPointer();
    const canvas = canvasRef.current;
    const tip = tipRef.current;
    if (!canvas || !tip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const raft = new Raft();
    raftRef.current = raft;
    raft.setOtters(live.current.otters, performance.now() / 1000, intro && !reduced);
    raft.mood = live.current.mood;

    let dpr = 1;
    const size = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      raft.layout({ width: r.width, height: r.height, ...live.current.layout });
    };
    size();

    let hoveredId: number | null = null;
    const setCursor = (on: boolean) => {
      document.body.style.cursor = on ? 'pointer' : '';
    };
    const showTip = (on: boolean) => {
      tip.style.opacity = on ? '1' : '0';
      tip.style.transform = on ? 'translate(-50%, -100%) scale(1)' : 'translate(-50%, -100%) scale(0.97)';
    };

    let last = performance.now() / 1000;
    let frame = 0;
    let running = false;
    let visible = true;

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = now - last;
      last = now;
      const rect = canvas.getBoundingClientRect();
      const recent = performance.now() - pointer.lastMove < 9000;
      const look = pointer.active && recent ? { x: pointer.x - rect.left, y: pointer.y - rect.top } : null;
      const inside = !!look && look.x >= 0 && look.y >= 0 && look.x <= rect.width && look.y <= rect.height;
      const hit = inside && look ? raft.hit(look.x, look.y) : null;
      raft.hovered = hit;
      const id = hit ? hit.spec.id : null;
      if (id !== hoveredId) {
        hoveredId = id;
        setCursor(id !== null);
        if (hit) {
          (tip.firstChild as HTMLElement).textContent = hit.spec.label;
          (tip.lastChild as HTMLElement).textContent = hit.spec.sub;
        }
        showTip(id !== null);
      }
      raft.update(dt, now, look, idleSeconds(), raftBus.hovered, reduced);
      if (hit) {
        const { hx, hy } = hit.head(now, reduced);
        tip.style.left = `${hx}px`;
        tip.style.top = `${hy - hit.R * 1.25}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      raft.draw(ctx, reduced);
    };
    const loop = () => {
      tick();
      frame = requestAnimationFrame(loop);
    };
    const play = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      last = performance.now() / 1000;
      frame = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const hit = raft.hit(x, y);
      if (!hit) return;
      raft.cheer(hit, performance.now() / 1000);
      pool.ripple(hit.x, hit.wl, 1);
      live.current.onPress?.(hit.spec.id);
    };
    window.addEventListener('click', onClick);

    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);

    tick();
    play();
    return () => {
      pause();
      setCursor(false);
      window.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      io.disconnect();
      raftRef.current = null;
    };
    // intro only matters for the first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <canvas ref={canvasRef} aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
      <div
        ref={tipRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          opacity: 0,
          transform: 'translate(-50%, -100%) scale(0.97)',
          transformOrigin: '50% 100%',
          transition: 'opacity 140ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)',
          padding: '8px 12px',
          borderRadius: 14,
          background: 'rgba(6,17,46,0.86)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 10px 30px -12px rgba(0,6,24,0.7), inset 0 1px 0 rgba(255,255,255,0.12)',
          color: '#FFF8EC',
          whiteSpace: 'nowrap',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontFamily: fonts.ui[500], fontSize: 12, lineHeight: '16px', opacity: 0.8 }} />
        <div style={{ fontFamily: fonts.display[600], fontSize: 17, lineHeight: '22px', fontVariantNumeric: 'tabular-nums' }} />
      </div>
    </div>
  );
}
