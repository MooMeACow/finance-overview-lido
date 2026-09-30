import { Platform } from 'react-native';

import { motion } from '../theme';

export const isWeb = Platform.OS === 'web';

type Keyframes = Record<string, Record<string, string | number>>;

const keyframeNames = new Map<string, string>();
let keyframeSheet: CSSStyleSheet | null = null;

/**
 * React Native Web only compiles `animationKeyframes` in StyleSheet.create and silently drops
 * it from inline styles, so inline keyframes are written to a stylesheet here, once each.
 */
function keyframesName(frames: Keyframes): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = JSON.stringify(frames);
  const known = keyframeNames.get(key);
  if (known) return known;
  if (!keyframeSheet) {
    const el = document.createElement('style');
    el.setAttribute('data-lido', 'keyframes');
    document.head.appendChild(el);
    keyframeSheet = el.sheet;
  }
  if (!keyframeSheet) return undefined;
  const name = `lido-kf-${keyframeNames.size}`;
  const css = (decl: Record<string, string | number>) =>
    Object.entries(decl)
      .map(([prop, value]) => `${prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
      .join(';');
  const body = Object.entries(frames)
    .map(([at, decl]) => `${at}{${css(decl)}}`)
    .join('');
  keyframeSheet.insertRule(`@keyframes ${name}{${body}}`, keyframeSheet.cssRules.length);
  keyframeNames.set(key, name);
  return name;
}

/**
 * Web-only CSS that React Native Web passes straight through to the page: transitions,
 * keyframes, gradients, backdrop blur, cursors. Native ignores it (returns undefined,
 * which style arrays skip), so the phone app keeps its static styles.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function web(style: Record<string, unknown>): any {
  if (!isWeb) return undefined;
  const { animationKeyframes, ...rest } = style;
  if (!animationKeyframes) return style;
  return { ...rest, animationName: keyframesName(animationKeyframes as Keyframes) };
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
    animationFillMode: 'backwards',
  });
}
