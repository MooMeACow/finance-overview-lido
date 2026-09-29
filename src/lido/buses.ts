/**
 * Tiny channels between parts of the pool that live in different React trees.
 * Canvas loops read these every frame, so they are plain values, not state.
 */

/** The account row currently hovered in the Accounts panel; its otter perks up. */
export const raft = {
  hovered: null as number | null,
};

type Ripple = { x: number; y: number; strength: number };
const rippleListeners = new Set<(r: Ripple) => void>();

/** Ripples on the water, in CSS pixels relative to the pool's top-left corner. */
export const pool = {
  ripple(x: number, y: number, strength = 1) {
    for (const l of rippleListeners) l({ x, y, strength });
  },
  onRipple(listener: (r: Ripple) => void): () => void {
    rippleListeners.add(listener);
    return () => rippleListeners.delete(listener);
  },
};
