import React, { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { Text } from './Text';

/**
 * Money that settles into place: on its first appearance it counts up from 92% of its value
 * (not from zero, which reads as a slot machine), then shows changes instantly.
 * The euros and the cents can be styled apart, e.g. smaller cents in the hero.
 */
export function CountUp({
  cents,
  format,
  animate,
  style,
  centsStyle,
  duration = 750,
}: {
  cents: number;
  format: (cents: number) => string;
  animate: boolean;
  style?: StyleProp<TextStyle>;
  /** When given, the decimal part is rendered with this style */
  centsStyle?: StyleProp<TextStyle>;
  duration?: number;
}) {
  const [shown, setShown] = useState(animate ? Math.round(cents * 0.92) : cents);
  const played = useRef(!animate);

  useEffect(() => {
    if (played.current || typeof requestAnimationFrame === 'undefined') {
      setShown(cents);
      return;
    }
    played.current = true;
    const from = Math.round(cents * 0.92);
    const t0 = performance.now();
    let frame = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(Math.round(from + (cents - from) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [cents, duration]);

  const text = format(shown);
  if (!centsStyle) return <Text style={style}>{text}</Text>;
  const dot = text.lastIndexOf('.');
  return (
    <Text style={style} accessibilityLabel={format(cents)}>
      {dot < 0 ? text : text.slice(0, dot)}
      {dot < 0 ? null : <Text style={centsStyle}>{text.slice(dot)}</Text>}
    </Text>
  );
}
