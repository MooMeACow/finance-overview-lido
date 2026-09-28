import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { space, useColors } from '../theme';
import { monthLabel } from '../lib/dates';
import { formatMoney, formatMoneyShort } from '../lib/money';
import type { ForecastMonth } from '../lib/forecast';

const HEIGHT = 110;

/**
 * Expected balance at the end of each month. One series, so no legend; the
 * title names it. Negative months grow below the baseline and are called out
 * with an icon and text, not color alone.
 */
export function ForecastBars({
  rows,
  currency,
  selected,
  onSelect,
}: {
  rows: ForecastMonth[];
  currency: string;
  selected: string;
  onSelect: (month: string) => void;
}) {
  const c = useColors();
  const values = rows.map((r) => r.end_balance_cents);
  const maxPos = Math.max(0, ...values);
  const maxNeg = Math.max(0, ...values.map((v) => -v));
  const span = Math.max(1, maxPos + maxNeg);
  const posHeight = Math.round((maxPos / span) * HEIGHT);
  const negHeight = HEIGHT - posHeight;
  const h = (v: number) => (v === 0 ? 0 : Math.max(2, Math.round((Math.abs(v) / span) * HEIGHT)));

  return (
    <View>
      <View style={styles.plot}>
        {rows.map((r) => {
          const isSel = r.month === selected;
          const v = r.end_balance_cents;
          return (
            <Pressable
              key={r.month}
              onPress={() => onSelect(r.month)}
              accessibilityRole="button"
              accessibilityLabel={`${monthLabel(r.month)}: expected balance ${formatMoney(v, currency)}`}
              style={[styles.group, isSel && { backgroundColor: c.accentSoft }]}
            >
              <Text style={[styles.valueLabel, { color: isSel ? c.text : c.textMuted, fontWeight: isSel ? '700' : '400' }]} numberOfLines={1}>
                {v < 0 ? '−' : ''}
                {formatMoneyShort(v, currency)}
              </Text>
              {/* Positive area */}
              <View style={[styles.area, { height: posHeight, justifyContent: 'flex-end' }]}>
                {v > 0 ? <View style={[styles.bar, styles.barUp, { height: h(v), backgroundColor: c.seriesIn, opacity: isSel ? 1 : 0.6 }]} /> : null}
              </View>
              <View style={[styles.baseline, { backgroundColor: c.baseline }]} />
              {/* Negative area */}
              <View style={[styles.area, { height: negHeight }]}>
                {v < 0 ? <View style={[styles.bar, styles.barDown, { height: h(v), backgroundColor: c.seriesIn, opacity: isSel ? 1 : 0.6 }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        {rows.map((r) => (
          <Text
            key={r.month}
            style={[styles.axisLabel, { color: r.month === selected ? c.text : c.textMuted, fontWeight: r.month === selected ? '700' : '400' }]}
          >
            {monthLabel(r.month, true)}
          </Text>
        ))}
      </View>
      {rows.some((r) => r.end_balance_cents < 0) ? (
        <View style={styles.warning}>
          <Ionicons name="alert-circle" size={16} color={c.danger} />
          <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>
            Your balance is expected to go below zero in {monthLabel(rows.find((r) => r.end_balance_cents < 0)!.month)}.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row' },
  group: { flex: 1, alignItems: 'center', borderRadius: 10, paddingTop: 4 },
  valueLabel: { fontSize: 11, marginBottom: 4, fontVariant: ['tabular-nums'] },
  area: { width: '100%', alignItems: 'center' },
  baseline: { height: StyleSheet.hairlineWidth * 2, width: '100%' },
  bar: { width: 18 },
  barUp: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barDown: { borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  axis: { flexDirection: 'row', marginTop: 6 },
  axisLabel: { flex: 1, textAlign: 'center', fontSize: 12 },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
});
