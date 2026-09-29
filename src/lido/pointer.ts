/**
 * One shared pointer for everything alive on the page (otters, the pool). Canvas loops
 * read it every frame; nothing here touches React state.
 */
export const pointer = {
  x: -1e4,
  y: -1e4,
  /** A mouse or pen moved recently (touch doesn't count as "looking around") */
  active: false,
  lastMove: 0,
  type: 'mouse',
};

let started = false;

export function trackPointer(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const move = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.type = e.pointerType;
    pointer.lastMove = performance.now();
    pointer.active = e.pointerType !== 'touch';
  };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', move, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    pointer.active = false;
  });
  window.addEventListener('blur', () => {
    pointer.active = false;
  });
}

/**
 * Whether a point on the page lands on `host` itself rather than on something laid over it
 * (a card, the top bar, the dock). The pool's canvases ignore the pointer, so this is how
 * they tell a touch of the water from a click on whatever covers it.
 */
export function reaches(host: Element | null | undefined, x: number, y: number): boolean {
  if (!host) return false;
  const under = document.elementFromPoint(x, y);
  return !!under && host.contains(under);
}

/** Seconds since the pointer last moved (for otters getting sleepy on an idle page). */
export function idleSeconds(now = performance.now()): number {
  return pointer.lastMove === 0 ? 0 : (now - pointer.lastMove) / 1000;
}
