import React from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, space } from '../theme';
import { Text } from '../lido/Text';
import { web } from '../lido/web';

export type TooltipLine = { label: string; value: string; swatch?: string; strong?: boolean };

/**
 * Small floating card above a chart column while the mouse hovers it. Always ink-dark with
 * cream text, so it reads the same over light and dark pages. Values stay in text colour; a
 * swatch beside each line carries the series identity.
 */
export function ChartTooltip({ title, lines, align = 'center' }: { title: string; lines: TooltipLine[]; align?: 'left' | 'center' | 'right' }) {
  const pos = align === 'left' ? { left: 0 } : align === 'right' ? { right: 0 } : { left: '50%' as const, marginLeft: -88 };
  return (
    <View
      style={[{ pointerEvents: 'none' },
        styles.box,
        pos,
        web({
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 14px 34px -14px rgba(0,6,24,0.7), inset 0 1px 0 rgba(255,255,255,0.1)',
          animationKeyframes: { '0%': { opacity: 0, transform: 'translateY(4px) scale(0.97)' }, '100%': { opacity: 1, transform: 'translateY(0px) scale(1)' } },
          animationDuration: '130ms',
          animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
          animationFillMode: 'both',
          transformOrigin: '50% 100%',
        }),
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      {lines.map((l) => (
        <View key={l.label} style={styles.line}>
          {l.swatch ? <View style={[styles.swatch, { backgroundColor: l.swatch }]} /> : null}
          <Text style={styles.label}>{l.label}</Text>
          <Text style={[styles.value, { fontFamily: l.strong ? fonts.ui[700] : fonts.ui[600] }]}>{l.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 8,
    width: 176,
    padding: 12,
    borderRadius: 14,
    gap: 5,
    zIndex: 10,
    backgroundColor: 'rgba(6,17,46,0.92)',
  },
  title: { fontFamily: fonts.display[600], fontSize: 14, lineHeight: 18, color: '#FFF8EC', marginBottom: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm - 2 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  label: { fontFamily: fonts.ui[400], fontSize: 12, flex: 1, color: 'rgba(255,248,236,0.72)' },
  value: { fontSize: 12, color: '#FFF8EC', fontVariant: ['tabular-nums'] },
});
