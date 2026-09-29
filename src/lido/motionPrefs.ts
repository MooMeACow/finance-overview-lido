import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

function query(): MediaQueryList | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-reduced-motion: reduce)');
}

export function prefersReducedMotion(): boolean {
  return query()?.matches ?? false;
}

/**
 * Reduced motion means fewer and gentler, not zero: callers keep fades and color
 * changes that explain a state change, and drop movement, bobbing and loops.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const q = query();
    if (q) {
      const onChange = () => setReduced(q.matches);
      q.addEventListener('change', onChange);
      return () => q.removeEventListener('change', onChange);
    }
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

const played = new Set<string>();

/**
 * True only the first time `key` mounts in this session, so the staged entrance
 * plays on first load and not again on every tab switch.
 */
export function useFirstVisit(key: string): boolean {
  const [first] = useState(() => !played.has(key));
  useEffect(() => {
    played.add(key);
  }, [key]);
  return first;
}
