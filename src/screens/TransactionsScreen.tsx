import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import { Chip, EmptyState, IconButton, MonthSwitcher, ScreenHeader, inputStyle } from '../components/ui';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet, EditTransactionSheet } from '../components/TransactionSheets';
import { space, useColors } from '../theme';
import { useAppState } from '../state';
import { dayLabel } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { getCategory } from '../lib/categories';
import { type Txn, getTransactions } from '../db/database';

type Direction = 'all' | 'in' | 'out';

export function TransactionsScreen({
  categoryFilter,
  onClearCategory,
}: {
  categoryFilter: string | null;
  onClearCategory: () => void;
}) {
  const db = useSQLiteContext();
  const c = useColors();
  const { month, setMonth, version, currency } = useAppState();
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<Direction>('all');
  const [txns, setTxns] = useState<Txn[]>([]);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    getTransactions(db, month, { search, direction, category: categoryFilter ?? undefined }).then((rows) => {
      if (alive) setTxns(rows);
    });
    return () => {
      alive = false;
    };
  }, [db, month, search, direction, categoryFilter, version]);

  const sections = useMemo(() => {
    const byDay = new Map<string, Txn[]>();
    for (const t of txns) {
      const day = t.date.slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(t);
      byDay.set(day, list);
    }
    return [...byDay.entries()].map(([day, data]) => ({
      title: dayLabel(day),
      total: data.filter((t) => t.excluded === 0).reduce((s, t) => s + t.amount_cents, 0),
      data,
    }));
  }, [txns]);

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <ScreenHeader
              title="Transactions"
              right={<IconButton icon="add-circle" size={32} label="Add transaction" onPress={() => setAdding(true)} />}
            />
            <MonthSwitcher month={month} onChange={setMonth} />
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={c.textMuted} style={styles.searchIcon} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                placeholderTextColor={c.textMuted}
                autoCorrect={false}
                style={[inputStyle(c), styles.search, { backgroundColor: c.card }]}
              />
            </View>
            <View style={styles.chips}>
              <Chip label="All" selected={direction === 'all'} onPress={() => setDirection('all')} />
              <Chip label="Money in" selected={direction === 'in'} onPress={() => setDirection('in')} />
              <Chip label="Money out" selected={direction === 'out'} onPress={() => setDirection('out')} />
              {categoryFilter ? (
                <Chip label={`${getCategory(categoryFilter).label}  ✕`} selected onPress={onClearCategory} />
              ) : null}
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={[styles.dayTitle, { color: c.textSecondary }]}>{section.title}</Text>
            <Text style={[styles.dayTotal, { color: c.textMuted }]}>{formatMoney(section.total, currency, 'always')}</Text>
          </View>
        )}
        renderItem={({ item }) => <TransactionRow txn={item} onPress={() => setEditing(item)} />}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title="Nothing here"
            body={search || direction !== 'all' || categoryFilter ? 'No transactions match your filters.' : 'No transactions this month.'}
          />
        }
      />
      <EditTransactionSheet txn={editing} onClose={() => setEditing(null)} />
      <AddTransactionSheet visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  searchWrap: { justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: space.md, zIndex: 1 },
  search: { paddingLeft: 38 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  dayTitle: { fontSize: 13, fontWeight: '600' },
  dayTotal: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
