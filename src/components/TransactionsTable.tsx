import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { space, useColors } from '../theme';
import { getCategory } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { shortDate } from '../lib/dates';
import type { Txn } from '../db/database';
import type { IconName } from './ui';

type SortKey = 'date' | 'description' | 'category' | 'amount';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const COLUMNS: { key: SortKey; label: string; flex: number; align?: 'right' }[] = [
  { key: 'date', label: 'Date', flex: 1 },
  { key: 'description', label: 'Description', flex: 3 },
  { key: 'category', label: 'Category', flex: 1.6 },
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
            <Pressable
              key={col.key}
              onPress={() => toggle(col.key)}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${col.label}`}
              style={[styles.thCell, { flex: col.flex, justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }]}
            >
              <Text style={[styles.thText, { color: active ? c.text : c.textMuted }]}>{col.label}</Text>
              <Ionicons
                name={active ? (sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'swap-vertical'}
                size={12}
                color={active ? c.text : c.baseline}
              />
            </Pressable>
          );
        })}
      </View>

      {sorted.map((t) => {
        const cat = getCategory(t.category);
        const excluded = t.excluded === 1;
        return (
          <Pressable
            key={t.id}
            onPress={() => onEdit(t)}
            style={(state) => [
              styles.tr,
              { borderBottomColor: c.hairline },
              (state as { hovered?: boolean }).hovered && { backgroundColor: c.track },
            ]}
          >
            <Text style={[styles.td, { flex: 1, color: c.textSecondary }]}>{shortDate(t.date, false)}</Text>
            <View style={{ flex: 3, minWidth: 0 }}>
              <Text style={[styles.td, { color: c.text, fontWeight: '500' }]} numberOfLines={1}>
                {t.description}
              </Text>
              {t.note || excluded ? (
                <Text style={{ color: c.textMuted, fontSize: 12 }} numberOfLines={1}>
                  {[excluded ? 'Not counted in totals' : null, t.note].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <View style={[styles.catCell, { flex: 1.6 }]}>
              <Ionicons name={cat.icon as IconName} size={14} color={c.textMuted} />
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
          </Pressable>
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
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  th: { paddingVertical: space.sm },
  thCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  thText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 14 },
  catCell: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  amount: { textAlign: 'right', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
