import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { space, useColors } from '../theme';
import { monthLabel } from '../lib/dates';
import { formatMoney, formatMoneyShort } from '../lib/money';
import type { MonthTotals } from '../db/database';

const CHART_HEIGHT = 120;
const BAR_WIDTH = 10;

/**
 * Money in vs out for the last few months. Tap a month to open it.
 * The selected month's values are labeled directly above its bars.
 */
export function MonthlyBars({
  data,
  selected,
  currency,
  onSelect,
}: {
  data: MonthTotals[];
  selected: string;
  currency: string;
  onSelect: (month: string) => void;
}) {
  const c = useColors();
  const max = Math.max(1, ...data.flatMap((d) => [d.in_cents, d.out_cents]));
  const h = (v: number) => (v === 0 ? 0 : Math.max(2, Math.round((v / max) * CHART_HEIGHT)));

  return (
    <View>
      <View style={styles.legend}>
        <LegendItem color={c.seriesIn} label="Money in" />
        <LegendItem color={c.seriesOut} label="Money out" />
      </View>

      <View style={[styles.plot, { borderBottomColor: c.baseline }]}>
        {data.map((d) => {
          const isSel = d.month === selected;
          return (
            <Pressable
              key={d.month}
              onPress={() => onSelect(d.month)}
              accessibilityRole="button"
              accessibilityLabel={`${monthLabel(d.month)}: in ${formatMoney(d.in_cents, currency)}, out ${formatMoney(d.out_cents, currency)}`}
              style={[styles.group, isSel && { backgroundColor: c.track }]}
            >
              {isSel ? (
                <Text style={[styles.valueLabel, { color: c.textSecondary }]} numberOfLines={1}>
                  {formatMoneyShort(d.in_cents, currency)} / {formatMoneyShort(d.out_cents, currency)}
                </Text>
              ) : null}
              <View style={styles.bars}>
                <View style={[styles.bar, { height: h(d.in_cents), backgroundColor: c.seriesIn, opacity: isSel ? 1 : 0.55 }]} />
                <View style={[styles.bar, { height: h(d.out_cents), backgroundColor: c.seriesOut, opacity: isSel ? 1 : 0.55 }]} />
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
    height: CHART_HEIGHT + 28,
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
  bar: { width: BAR_WIDTH, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', marginTop: 6 },
  axisLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
});
