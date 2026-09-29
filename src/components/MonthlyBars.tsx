import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, radius, space, useColors } from '../theme';
import { monthLabel } from '../lib/dates';
import { formatMoney, formatMoneyShort } from '../lib/money';
import type { MonthTotals } from '../db/database';
import { ChartTooltip } from './ChartTooltip';
import { Text } from '../lido/Text';
import { Liquid } from '../lido/Liquid';
import { useReducedMotion } from '../lido/motionPrefs';

const IN = { top: '#7EDDF6', bottom: '#2D6BE6' };
const OUT = { top: '#FFC7A3', bottom: '#EE6A43' };

/**
 * Money in vs out for the last few months, as two columns of water per month (cool for in,
 * warm for out). Tap a month to open it. The selected month's values are written above its
 * columns; on the web, hovering a month shows its exact values.
 */
export function MonthlyBars({
  data,
  selected,
  currency,
  onSelect,
  height = 120,
  showValues = true,
}: {
  data: MonthTotals[];
  selected: string;
  currency: string;
  onSelect: (month: string) => void;
  height?: number;
  /** Write the selected month's values above its columns (too tight on phones) */
  showValues?: boolean;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.in_cents, d.out_cents]));
  const frac = (v: number) => (v <= 0 ? 0 : Math.max(0.02, (v / max) * 0.9));

  return (
    <View>
      <View style={styles.legend}>
        <LegendItem color={IN.bottom} label="Money in" />
        <LegendItem color={OUT.bottom} label="Money out" />
      </View>

      <View style={[styles.plot, { height: height + (showValues ? 26 : 8) }]}>
        {data.map((d, i) => {
          const isSel = d.month === selected;
          const isHover = hovered === d.month;
          return (
            <Pressable
              key={d.month}
              onPress={() => onSelect(d.month)}
              onHoverIn={() => setHovered(d.month)}
              onHoverOut={() => setHovered((h) => (h === d.month ? null : h))}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${monthLabel(d.month)}: in ${formatMoney(d.in_cents, currency)}, out ${formatMoney(d.out_cents, currency)}`}
              style={[styles.group, isHover && { zIndex: 5 }]}
            >
              {isHover ? (
                <ChartTooltip
                  title={monthLabel(d.month)}
                  align={i === 0 ? 'left' : i === data.length - 1 ? 'right' : 'center'}
                  lines={[
                    { label: 'Money in', value: formatMoney(d.in_cents, currency), swatch: IN.bottom },
                    { label: 'Money out', value: formatMoney(d.out_cents, currency), swatch: OUT.bottom },
                    { label: 'Net', value: formatMoney(d.in_cents - d.out_cents, currency, 'always'), strong: true },
                  ]}
                />
              ) : null}
              {showValues ? (
                <Text style={[styles.valueLabel, { color: isSel ? c.textSecondary : 'transparent' }]} numberOfLines={1}>
                  {formatMoneyShort(d.in_cents, currency)} / {formatMoneyShort(d.out_cents, currency)}
                </Text>
              ) : null}
              <View style={[styles.pair, { height }, (isSel || isHover) && { backgroundColor: c.track }]}>
                {[
                  { v: d.in_cents, col: IN },
                  { v: d.out_cents, col: OUT },
                ].map(({ v, col }, k) => (
                  <View key={k} style={[styles.vessel, { opacity: isSel || isHover ? 1 : 0.62 }]}>
                    <Liquid fraction={frac(v)} top={col.top} bottom={col.bottom} still={reduced} waveHeight={6} speed={6 + k * 2} delay={i * 0.9 + k} />
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.axis}>
        {data.map((d) => (
          <Text
            key={d.month}
            style={[styles.axisLabel, { color: d.month === selected ? c.text : c.textMuted, fontFamily: d.month === selected ? fonts.ui[600] : fonts.ui[400] }]}
          >
            {monthLabel(d.month, true)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const c = useColors();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: c.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: space.lg, marginBottom: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fonts.ui[500], fontSize: 13 },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  group: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  valueLabel: { fontFamily: fonts.ui[500], fontSize: 10, marginBottom: 6, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pair: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.sm + 2, alignItems: 'flex-end' },
  vessel: { flex: 1, height: '100%', borderRadius: 8, overflow: 'hidden' },
  axis: { flexDirection: 'row', marginTop: 8, gap: 8 },
  axisLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
});
