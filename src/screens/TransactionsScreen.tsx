import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useDb } from '../db/provider';

import {
  Button,
  EmptyState,
  IconButton,
  MonthSwitcher,
  Page,
  Panel,
  Press,
  ScreenHeader,
  Segmented,
  Text,
  inputStyle,
  usePagePadding,
} from '../components/ui';
import { TransactionsTable } from '../components/TransactionsTable';
import { useLayout } from '../layout';
import { TransactionRow } from '../components/TransactionRow';
import { AddTransactionSheet, EditTransactionSheet } from '../components/TransactionSheets';
import { fonts, radius, shadow, space, type as T, useColors } from '../theme';
import { useAppState } from '../state';
import { dayLabel } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { getCategory } from '../lib/categories';
import { type Txn, getTransactions } from '../db/database';
import { Icon } from '../lido/Icon';
import { web } from '../lido/web';

type Direction = 'all' | 'in' | 'out';

const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in', label: 'Money in' },
  { key: 'out', label: 'Money out' },
];

export function TransactionsScreen({
  categoryFilter,
  onClearCategory,
}: {
  categoryFilter: string | null;
  onClearCategory: () => void;
}) {
  const db = useDb();
  const c = useColors();
  const { month, setMonth, version, currency } = useAppState();
  const { isWide } = useLayout();
  const pad = usePagePadding();
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

  const counted = txns.filter((t) => t.excluded === 0);
  const inSum = counted.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0);
  const outSum = counted.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0);

  const searchBox = (
    <View style={[styles.searchWrap, isWide && { flex: 1, maxWidth: 380 }]}>
      <Icon name="search" size={18} color={c.textMuted} weight="bold" style={styles.searchIcon} />
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search description or note"
        placeholderTextColor={c.textMuted}
        autoCorrect={false}
        accessibilityLabel="Search transactions"
        style={[inputStyle(c), styles.search]}
      />
    </View>
  );

  const filters = (
    <View style={styles.filters}>
      <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} />
      {categoryFilter ? (
        <Press
          onPress={onClearCategory}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter ${getCategory(categoryFilter).label}`}
          style={({ hovered }) => [styles.filterChip, { backgroundColor: hovered ? c.primaryPressed : c.primary }]}
        >
          <Text style={[T.label, { fontSize: 14, color: c.onPrimary }]}>{getCategory(categoryFilter).label}</Text>
          <Icon name="close" size={14} color={c.onPrimary} weight="bold" />
        </Press>
      ) : null}
    </View>
  );

  const emptyBody = search || direction !== 'all' || categoryFilter ? 'No transactions match your filters.' : 'No transactions this month.';

  if (isWide) {
    return (
      <Page>
        <ScreenHeader
          title="Transactions"
          subtitle="Click a column to sort, click a row to edit"
          right={
            <View style={styles.headerActions}>
              <MonthSwitcher month={month} onChange={setMonth} />
              <Button label="Add transaction" icon="add" onPress={() => setAdding(true)} />
            </View>
          }
        />
        <View style={[styles.strip, { backgroundColor: c.card }, shadow(c, 1)]}>
          <Stat label="Transactions" value={String(txns.length)} />
          <View style={[styles.stripRule, { backgroundColor: c.hairline }]} />
          <Stat label="Money in" value={formatMoney(inSum, currency)} swatch="#2D6BE6" />
          <View style={[styles.stripRule, { backgroundColor: c.hairline }]} />
          <Stat label="Money out" value={formatMoney(outSum, currency)} swatch="#EE6A43" />
          <View style={[styles.stripRule, { backgroundColor: c.hairline }]} />
          <Stat label="Net" value={formatMoney(inSum - outSum, currency, 'always')} />
        </View>
        <Panel padded={false} style={{ paddingTop: space.lg, paddingBottom: space.sm }}>
          <View style={styles.toolbar}>
            {searchBox}
            {filters}
          </View>
          {txns.length === 0 ? <EmptyState icon="receipt-outline" title="Nothing here" body={emptyBody} /> : <TransactionsTable txns={txns} onEdit={setEditing} />}
        </Panel>
        <EditTransactionSheet txn={editing} onClose={() => setEditing(null)} />
        <AddTransactionSheet visible={adding} onClose={() => setAdding(false)} />
      </Page>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        style={web({ overscrollBehavior: 'contain' })}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <ScreenHeader title="Transactions" right={<IconButton icon="add" size={22} label="Add transaction" onPress={() => setAdding(true)} color={c.primary} />} />
            <MonthSwitcher month={month} onChange={setMonth} />
            {searchBox}
            {filters}
            <Text style={[T.small, { color: c.textMuted, paddingHorizontal: 4 }]}>
              {txns.length} transaction{txns.length === 1 ? '' : 's'}, {formatMoney(inSum, currency)} in, {formatMoney(outSum, currency)} out
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.dayHeader}>
            <Text style={[T.label, { color: c.textSecondary, fontFamily: fonts.ui[600] }]}>{section.title}</Text>
            <Text style={[T.label, { color: c.textMuted, fontVariant: ['tabular-nums'] }]}>{formatMoney(section.total, currency, 'always')}</Text>
          </View>
        )}
        renderItem={({ item }) => <TransactionRow txn={item} onPress={() => setEditing(item)} />}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="Nothing here" body={emptyBody} />}
      />
      <EditTransactionSheet txn={editing} onClose={() => setEditing(null)} />
      <AddTransactionSheet visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

function Stat({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <View style={styles.statLabel}>
        {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
        <Text style={[T.label, { color: c.textMuted }]}>{label}</Text>
      </View>
      <Text style={[T.number, { color: c.text, fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg },
  searchWrap: { justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.md },
  searchIcon: { position: 'absolute', left: 16, zIndex: 1 },
  search: { paddingLeft: 44, borderRadius: radius.pill, height: 44, paddingTop: 0, paddingBottom: 0 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  strip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, paddingVertical: space.lg, paddingHorizontal: space.xl, gap: space.xl },
  stripRule: { width: 1, alignSelf: 'stretch' },
  stat: { flex: 1, gap: 4, minWidth: 0 },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
});
