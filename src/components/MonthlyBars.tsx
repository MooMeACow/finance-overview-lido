import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { space, useColors } from '../theme';
import { monthLabel } from '../lib/dates';
import { formatMoney, formatMoneyShort } from '../lib/money';
import type { MonthTotals } from '../db/database';
import { ChartTooltip } from './ChartTooltip';


/**
 * Money in vs out for the last few months. Tap a month to open it.
 * The selected month's values are labeled directly above its bars;
 * on the web, hovering a month shows its exact values.
 */
export function MonthlyBars({
  data,
  selected,
  currency,
  onSelect,
  height = 120,
}: {
  data: MonthTotals[];
  selected: string;
  currency: string;
  onSelect: (month: string) => void;
  height?: number;
}) {
  const c = useColors();
  const [hovered, setHovered] = useState<string | null>(null);
  const barWidth = height > 150 ? 16 : 10;
  const max = Math.max(1, ...data.flatMap((d) => [d.in_cents, d.out_cents]));
  const h = (v: number) => (v === 0 ? 0 : Math.max(2, Math.round((v / max) * height)));

  return (
    <View>
      <View style={styles.legend}>
        <LegendItem color={c.seriesIn} label="Money in" />
        <LegendItem color={c.seriesOut} label="Money out" />
      </View>

      <View style={[styles.plot, { height: height + 28, borderBottomColor: c.baseline }]}>
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
              accessibilityLabel={`${monthLabel(d.month)}: in ${formatMoney(d.in_cents, currency)}, out ${formatMoney(d.out_cents, currency)}`}
              style={[styles.group, (isSel || isHover) && { backgroundColor: c.track }, isHover && { zIndex: 5 }]}
            >
              {isSel && !isHover ? (
                <Text style={[styles.valueLabel, { color: c.textSecondary }]} numberOfLines={1}>
                  {formatMoneyShort(d.in_cents, currency)} / {formatMoneyShort(d.out_cents, currency)}
                </Text>
              ) : null}
              <View style={styles.bars}>
                {isHover ? (
                  <ChartTooltip
                    title={monthLabel(d.month)}
                    align={i === 0 ? 'left' : i === data.length - 1 ? 'right' : 'center'}
                    lines={[
                      { label: 'Money in', value: formatMoney(d.in_cents, currency), swatch: c.seriesIn },
                      { label: 'Money out', value: formatMoney(d.out_cents, currency), swatch: c.seriesOut },
                      { label: 'Net', value: formatMoney(d.in_cents - d.out_cents, currency, 'always'), strong: true },
                    ]}
                  />
                ) : null}
                <View style={[styles.bar, { width: barWidth, height: h(d.in_cents), backgroundColor: c.seriesIn, opacity: isSel || isHover ? 1 : 0.55 }]} />
                <View style={[styles.bar, { width: barWidth, height: h(d.out_cents), backgroundColor: c.seriesOut, opacity: isSel || isHover ? 1 : 0.55 }]} />
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.axis}>
        {data.map((d) => (
          <Text
            key={d.month}
            style={[
              styles.axisLabel,
              { color: d.month === selected ? c.text : c.textMuted, fontWeight: d.month === selected ? '700' : '400' },
            ]}
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
  legendText: { fontSize: 13 },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  group: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  valueLabel: { fontSize: 10, marginBottom: 4, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', marginTop: 6 },
  axisLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
});
