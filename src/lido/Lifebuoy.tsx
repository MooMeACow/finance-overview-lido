import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { type as T, useColors } from '../theme';
import { Text } from './Text';

const SEGMENTS = 8;

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

/**
 * "Kept of income" as a lifebuoy: the ring's coral bands light up clockwise for the share
 * of this month's income you kept. The percentage sits in the middle.
 */
export function Lifebuoy({ share, size = 112, label }: { share: number | null; size?: number; label: string }) {
  const c = useColors();
  const cx = size / 2;
  const r1 = size / 2 - 2;
  const r0 = r1 * 0.58;
  const lit = share === null ? 0 : Math.max(0, Math.min(1, share)) * SEGMENTS;
  const gap = 0.035;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${label}: ${share === null ? 'no income' : `${Math.round(share * 100)} percent`}`}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cx} r={(r0 + r1) / 2} stroke={c.track} strokeWidth={r1 - r0} fill="none" />
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const a0 = -Math.PI / 2 + (i / SEGMENTS) * Math.PI * 2 + gap;
          const a1 = -Math.PI / 2 + ((i + 1) / SEGMENTS) * Math.PI * 2 - gap;
          // lit bands alternate coral and sun like a real ring; the rest stay faint
          const on = i < Math.round(lit);
          return <Path key={i} d={arc(cx, cx, r0, r1, a0, a1)} fill={i % 2 === 0 ? c.coral : c.sun} opacity={on ? 1 : 0.16} />;
        })}
      </Svg>
      <Text style={[T.number, { color: c.text, fontSize: size * 0.22, lineHeight: size * 0.26 }]}>
        {share === null ? '-' : `${Math.round(share * 100)}%`}
      </Text>
    </View>
  );
}
