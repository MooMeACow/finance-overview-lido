/**
 * Tiny channels between parts of the pool that live in different React trees.
 * Canvas loops read these every frame, so they are plain values, not state.
 */

const cheerListeners = new Set<(id: number) => void>();

export const raft = {
  /** The account row currently hovered in the Accounts panel; its otter perks up. */
  hovered: null as number | null,
  /** Make an account's otter do a little happy splash (after its account is saved). */
  cheer(id: number) {
    for (const l of cheerListeners) l(id);
  },
  onCheer(listener: (id: number) => void): () => void {
    cheerListeners.add(listener);
    return () => cheerListeners.delete(listener);
  },
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
