import React from 'react';

import { useIsDark } from '../theme';

const GRAIN =
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`,
  ) +
  '")';

/**
 * The deck around the pool: a low golden-hour sun warming the top of the page (a cool pool
 * glow at night), and a fixed film grain over everything. Both are fixed layers that ignore
 * the pointer, so scrolling never repaints them.
 */
export function Backdrop() {
  const dark = useIsDark();
  const sky = dark
    ? 'radial-gradient(900px 520px at 78% -8%, rgba(63,212,245,0.16), transparent 62%), radial-gradient(700px 480px at 6% 0%, rgba(91,133,255,0.14), transparent 60%), linear-gradient(180deg, #0A1A44 0%, #07122E 42%)'
    : 'radial-gradient(1000px 560px at 88% -12%, rgba(255,190,98,0.42), transparent 62%), radial-gradient(760px 460px at 0% -4%, rgba(90,190,245,0.18), transparent 60%), linear-gradient(180deg, #FDEBD0 0%, #FBF3E4 40%)';
  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: sky }} />
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          pointerEvents: 'none',
          backgroundImage: GRAIN,
          backgroundSize: '220px 220px',
          opacity: dark ? 0.07 : 0.06,
          mixBlendMode: dark ? 'soft-light' : 'multiply',
        }}
      />
    </>
  );
}
