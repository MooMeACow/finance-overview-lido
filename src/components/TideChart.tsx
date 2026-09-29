import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fonts, radius, space, useColors } from '../theme';
import { monthLabel } from '../lib/dates';
import { formatMoney, formatMoneyShort } from '../lib/money';
import type { ForecastMonth } from '../lib/forecast';
import { ChartTooltip } from './ChartTooltip';
import { Text } from '../lido/Text';
import { Icon } from '../lido/Icon';
import { Liquid } from '../lido/Liquid';
import { transition } from '../lido/web';
import { useReducedMotion } from '../lido/motionPrefs';

/**
 * Expected balance at the end of each month, as water standing in six columns. Heights are
 * measured from zero, so the columns compare honestly; the value sits above each one. A month
 * expected to go below zero drains below the line in coral and is called out in words too.
 */
export function TideChart({
  rows,
  currency,
  selected,
  onSelect,
  height = 180,
}: {
  rows: ForecastMonth[];
  currency: string;
  selected: string;
  onSelect: (month: string) => void;
  height?: number;
}) {
  const c = useColors();
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const values = rows.map((r) => r.end_balance_cents);
  const maxPos = Math.max(0, ...values);
  const maxNeg = Math.max(0, ...values.map((v) => -v));
  const span = Math.max(1, maxPos + maxNeg);
  const posH = Math.round((maxPos / span) * height);
  const negH = height - posH;
  const firstNegative = rows.find((r) => r.end_balance_cents < 0);

  return (
    <View>
      <View style={styles.plot}>
        {rows.map((r, i) => {
          const isSel = r.month === selected;
          const isHover = hovered === r.month;
          const v = r.end_balance_cents;
          return (
            <Pressable
              key={r.month}
              onPress={() => onSelect(r.month)}
              onHoverIn={() => setHovered(r.month)}
              onHoverOut={() => setHovered((h) => (h === r.month ? null : h))}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${monthLabel(r.month)}: expected balance ${formatMoney(v, currency)}`}
              style={[styles.group, isHover && { zIndex: 5 }]}
            >
              {isHover ? (
                <ChartTooltip
                  title={monthLabel(r.month)}
                  align={i === 0 ? 'left' : i === rows.length - 1 ? 'right' : 'center'}
                  lines={[
                    { label: 'Planned income', value: formatMoney(r.income_cents, currency) },
                    { label: 'Planned expenses', value: formatMoney(-r.expense_cents, currency) },
                    { label: 'Budgets', value: formatMoney(-r.budget_cents, currency) },
                    { label: 'End balance', value: formatMoney(v, currency), swatch: c.aqua, strong: true },
                  ]}
                />
              ) : null}
              <Text
                style={[
                  styles.value,
                  { color: isSel ? c.text : c.textMuted, fontFamily: isSel ? fonts.display[700] : fonts.ui[500] },
                ]}
                numberOfLines={1}
              >
                {v < 0 ? '-' : ''}
                {formatMoneyShort(v, currency)}
              </Text>
              <View
                style={[
                  styles.vessel,
                  { height, backgroundColor: c.track },
                  isSel && { boxShadow: `0 0 0 2px ${c.primary}` },
                  transition(['box-shadow', 'transform'], 160),
                ]}
              >
                {/* above the zero line */}
                <View style={{ height: posH, justifyContent: 'flex-end' }}>
                  {v > 0 ? (
                    <View style={{ height: `${(v / Math.max(1, maxPos)) * 86}%` as `${number}%` }}>
                      <Liquid fraction={1} top={isSel || isHover ? '#5CD6F5' : '#7EDDF6'} bottom={isSel || isHover ? c.primary : '#3B79E6'} still={reduced} delay={i * 1.3} />
                    </View>
                  ) : null}
                </View>
                {maxNeg > 0 ? <View style={[styles.zero, { backgroundColor: c.baseline }]} /> : null}
                {/* below it */}
                <View style={{ height: negH }}>
                  {v < 0 ? <View style={{ height: `${(-v / Math.max(1, maxNeg)) * 92}%` as `${number}%`, backgroundColor: c.coral, opacity: 0.85 }} /> : null}
                </View>
              </View>
              <Text style={[styles.axis, { color: isSel ? c.text : c.textMuted, fontFamily: isSel ? fonts.ui[600] : fonts.ui[400] }]}>
                {monthLabel(r.month, true)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {firstNegative ? (
        <View style={styles.warning}>
          <Icon name="alert-circle" size={16} color={c.danger} />
          <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>
            Your balance is expected to go below zero in {monthLabel(firstNegative.month)}.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', gap: 10 },
  group: { flex: 1, alignItems: 'stretch', gap: 8 },
  value: { fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
  vessel: { borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-start' },
  zero: { height: 2 },
  axis: { fontSize: 12, textAlign: 'center' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
});
