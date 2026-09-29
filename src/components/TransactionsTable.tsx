import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, radius, space, useColors } from '../theme';
import { getCategory } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { shortDate } from '../lib/dates';
import type { Txn } from '../db/database';
import { Press, Text, type IconName } from './ui';
import { Icon } from '../lido/Icon';

type SortKey = 'date' | 'description' | 'category' | 'amount';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const COLUMNS: { key: SortKey; label: string; flex: number; align?: 'right' }[] = [
  { key: 'date', label: 'Date', flex: 0.9 },
  { key: 'description', label: 'Description', flex: 3 },
  { key: 'category', label: 'Category', flex: 1.7 },
  { key: 'amount', label: 'Amount', flex: 1.2, align: 'right' },
];

function compare(a: Txn, b: Txn, key: SortKey): number {
  switch (key) {
    case 'date':
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;
    case 'description':
      return a.description.localeCompare(b.description);
    case 'category':
      return getCategory(a.category).label.localeCompare(getCategory(b.category).label);
    case 'amount':
      return a.amount_cents - b.amount_cents;
  }
}

/** Desktop: transactions as a table. Click a column header to sort, click a row to edit. */
export function TransactionsTable({ txns, onEdit }: { txns: Txn[]; onEdit: (t: Txn) => void }) {
  const c = useColors();
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' });

  const sorted = useMemo(() => {
    const list = [...txns].sort((a, b) => compare(a, b, sort.key));
    return sort.dir === 'desc' ? list.reverse() : list;
  }, [txns, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'description' || key === 'category' ? 'asc' : 'desc' }));

  return (
    <View>
      <View style={[styles.tr, styles.th, { borderBottomColor: c.hairline }]}>
        {COLUMNS.map((col) => {
          const active = sort.key === col.key;
          return (
            <Press
              key={col.key}
              feedback="soft"
              onPress={() => toggle(col.key)}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${col.label}`}
              style={({ hovered }) => [
                styles.thCell,
                { flex: col.flex, justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' },
                hovered && { backgroundColor: c.hover },
              ]}
            >
              <Text style={[styles.thText, { color: active ? c.text : c.textMuted }]}>{col.label}</Text>
              <Icon name={active ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'} size={12} color={active ? c.primary : c.baseline} weight="bold" />
            </Press>
          );
        })}
      </View>

      {sorted.map((t) => {
        const cat = getCategory(t.category);
        const excluded = t.excluded === 1;
        return (
          <Press
            key={t.id}
            feedback="none"
            onPress={() => onEdit(t)}
            accessibilityRole="button"
            accessibilityLabel={`${t.description}, ${formatMoney(t.amount_cents, t.currency, 'always')}. Edit`}
            style={({ hovered }) => [styles.tr, { borderBottomColor: c.hairline }, hovered && { backgroundColor: c.hover }]}
          >
            <Text style={[styles.td, { flex: 0.9, color: c.textSecondary, fontVariant: ['tabular-nums'] }]}>{shortDate(t.date, false)}</Text>
            <View style={{ flex: 3, minWidth: 0 }}>
              <Text style={[styles.td, { color: c.text, fontFamily: fonts.ui[500] }]} numberOfLines={1}>
                {t.description}
              </Text>
              {t.note || excluded ? (
                <Text style={{ color: c.textMuted, fontSize: 12, fontFamily: fonts.ui[400] }} numberOfLines={1}>
                  {[excluded ? 'Not counted in totals' : null, t.note].filter(Boolean).join(', ')}
                </Text>
              ) : null}
            </View>
            <View style={[styles.catCell, { flex: 1.7 }]}>
              <View style={[styles.catIcon, { backgroundColor: c.track }]}>
                <Icon name={cat.icon as IconName} size={14} color={c.primary} weight="duotone" duotoneColor={c.primary} />
              </View>
              <Text style={[styles.td, { color: c.textSecondary }]} numberOfLines={1}>
                {cat.label}
              </Text>
            </View>
            <Text
              style={[
                styles.td,
                styles.amount,
                { flex: 1.2, color: t.amount_cents > 0 ? c.positive : c.text },
                excluded && { opacity: 0.45, textDecorationLine: 'line-through' },
              ]}
            >
              {formatMoney(t.amount_cents, t.currency, 'always')}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    paddingHorizontal: space.xl,
    borderBottomWidth: 1,
  },
  th: { paddingVertical: 6 },
  thCell: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: radius.xs },
  thText: { fontFamily: fonts.ui[500], fontSize: 12, letterSpacing: 0.2 },
  td: { fontFamily: fonts.ui[400], fontSize: 14 },
  catCell: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  catIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  amount: { textAlign: 'right', fontFamily: fonts.ui[600], fontVariant: ['tabular-nums'] },
});
