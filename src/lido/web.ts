import { Platform } from 'react-native';

import { motion } from '../theme';

export const isWeb = Platform.OS === 'web';

/**
 * Web-only CSS that React Native Web passes straight through to the page: transitions,
 * keyframes, gradients, backdrop blur, cursors. Native ignores it (returns undefined,
 * which style arrays skip), so the phone app keeps its static styles.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function web(style: Record<string, unknown>): any {
  return isWeb ? style : undefined;
}

/** Transition only the named properties (never `all`). */
export function transition(properties: string[], ms: number = motion.hover, easing: string = motion.easeOut) {
  return web({
    transitionProperty: properties.join(', '),
    transitionDuration: `${ms}ms`,
    transitionTimingFunction: easing,
  });
}

/** A one-shot entrance: opacity plus a small rise, optionally delayed for a stagger. */
export function enter(delayMs = 0, rise = 8, ms = 420, reduced = false) {
  return web({
    animationKeyframes: reduced
      ? { '0%': { opacity: 0 }, '100%': { opacity: 1 } }
      : { '0%': { opacity: 0, transform: `translateY(${rise}px)` }, '100%': { opacity: 1, transform: 'translateY(0px)' } },
    animationDuration: `${reduced ? 200 : ms}ms`,
    animationTimingFunction: motion.easeOut,
    animationDelay: `${delayMs}ms`,
    animationFillMode: 'both',
  });
}
