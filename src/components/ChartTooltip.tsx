import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { space, useColors } from '../theme';

export type TooltipLine = { label: string; value: string; swatch?: string; strong?: boolean };

/**
 * Small floating box shown above a chart column while the mouse hovers it.
 * Values stay in text color; a swatch beside each line carries the series identity.
 */
export function ChartTooltip({ title, lines, align = 'center' }: { title: string; lines: TooltipLine[]; align?: 'left' | 'center' | 'right' }) {
  const c = useColors();
  const pos = align === 'left' ? { left: 0 } : align === 'right' ? { right: 0 } : { left: '50%' as const, transform: [{ translateX: -80 }] };
  return (
    <View
      pointerEvents="none"
      style={[
        styles.box,
        pos,
        { backgroundColor: c.card, borderColor: c.hairline, shadowColor: '#000' },
      ]}
    >
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {lines.map((l) => (
        <View key={l.label} style={styles.line}>
          {l.swatch ? <View style={[styles.swatch, { backgroundColor: l.swatch }]} /> : null}
          <Text style={[styles.label, { color: c.textSecondary }]}>{l.label}</Text>
          <Text style={[styles.value, { color: c.text, fontWeight: l.strong ? '700' : '600' }]}>{l.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    width: 160,
    padding: space.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    zIndex: 10,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  title: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  label: { fontSize: 12, flex: 1 },
  value: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
