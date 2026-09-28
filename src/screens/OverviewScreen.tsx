import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Card, EmptyState, MonthSwitcher, ScreenHeader, SectionTitle, type IconName } from '../components/ui';
import { MonthlyBars } from '../components/MonthlyBars';
import { TransactionRow } from '../components/TransactionRow';
import { EditTransactionSheet } from '../components/TransactionSheets';
import { space, useColors } from '../theme';
import { useAppState } from '../state';
import { getCategory } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { monthLabel } from '../lib/dates';
import {
  type CategoryTotal,
  type MonthTotals,
  type Txn,
  getCategoryTotals,
  getMonthTotals,
  getTransactions,
} from '../db/database';

export function OverviewScreen({ onImport, onShowCategory }: { onImport: () => void; onShowCategory: (c: string) => void }) {
  const db = useSQLiteContext();
  const c = useColors();
  const { month, setMonth, currency, version } = useAppState();
  const [history, setHistory] = useState<MonthTotals[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [biggest, setBiggest] = useState<Txn[]>([]);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [h, cats, out] = await Promise.all([
        getMonthTotals(db, month, 6),
        getCategoryTotals(db, month),
        getTransactions(db, month, { direction: 'out' }),
      ]);
      if (!alive) return;
      setHistory(h);
      setCategories(cats);
      setBiggest(
        out
          .filter((t) => t.excluded === 0)
          .sort((a, b) => a.amount_cents - b.amount_cents)
          .slice(0, 3),
      );
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [db, month, version]);

  const current = history[history.length - 1] ?? { in_cents: 0, out_cents: 0 };
  const net = current.in_cents - current.out_cents;
  const totalOut = categories.reduce((s, x) => s + x.out_cents, 0);
  const hasAnyData = history.some((h) => h.in_cents || h.out_cents);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="Overview" />
      <MonthSwitcher month={month} onChange={setMonth} />

      <Card style={styles.hero}>
        <Text style={[styles.heroLabel, { color: c.textSecondary }]}>Net for {monthLabel(month)}</Text>
        <Text style={[styles.heroValue, { color: c.text }]}>{formatMoney(net, currency, 'always')}</Text>
        <View style={styles.stats}>
          <Stat label="Money in" value={formatMoney(current.in_cents, currency)} swatch={c.seriesIn} />
          <View style={[styles.divider, { backgroundColor: c.hairline }]} />
          <Stat label="Money out" value={formatMoney(current.out_cents, currency)} swatch={c.seriesOut} />
        </View>
      </Card>

      {loaded && !hasAnyData ? (
        <Card style={{ marginTop: space.lg }}>
          <EmptyState
            icon="document-text-outline"
            title="No transactions yet"
            body="Import a bank statement (CSV) or add a transaction by hand to see your overview."
          />
          <Button label="Import a statement" icon="cloud-upload-outline" onPress={onImport} />
        </Card>
      ) : null}

      {hasAnyData ? (
        <>
          <SectionTitle>Last 6 months</SectionTitle>
          <Card>
            <MonthlyBars data={history} selected={month} currency={currency} onSelect={setMonth} />
          </Card>

          <SectionTitle>Spending by category</SectionTitle>
          <Card style={{ paddingVertical: space.sm }}>
            {categories.length === 0 ? (
              <Text style={[styles.muted, { color: c.textSecondary }]}>No spending this month.</Text>
            ) : (
              categories.map((cat) => {
                const info = getCategory(cat.category);
                const share = totalOut ? cat.out_cents / totalOut : 0;
                return (
                  <Pressable
                    key={cat.category}
                    onPress={() => onShowCategory(cat.category)}
                    accessibilityRole="button"
                    accessibilityLabel={`${info.label}: ${formatMoney(cat.out_cents, currency)}, ${Math.round(share * 100)} percent`}
                    style={({ pressed }) => [styles.catRow, pressed && { opacity: 0.6 }]}
                  >
                    <View style={styles.catTop}>
                      <Ionicons name={info.icon as IconName} size={16} color={c.textSecondary} />
                      <Text style={[styles.catName, { color: c.text }]}>{info.label}</Text>
                      <Text style={[styles.catPct, { color: c.textMuted }]}>{Math.round(share * 100)}%</Text>
                      <Text style={[styles.catValue, { color: c.text }]}>{formatMoney(cat.out_cents, currency)}</Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: c.track }]}>
                      <View style={[styles.fill, { width: `${Math.max(2, share * 100)}%` as `${number}%`, backgroundColor: c.seriesOut }]} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </Card>

          {biggest.length > 0 ? (
            <>
              <SectionTitle>Biggest expenses</SectionTitle>
              <Card style={{ paddingVertical: space.xs, paddingHorizontal: space.sm }}>
                {biggest.map((t) => (
                  <TransactionRow key={t.id} txn={t} onPress={() => setEditing(t)} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <EditTransactionSheet txn={editing} onClose={() => setEditing(null)} />
    </ScrollView>
  );
}

function Stat({ label, value, swatch }: { label: string; value: string; swatch: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
        <Text style={[styles.statLabel, { color: c.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  hero: { marginTop: space.lg, gap: space.xs },
  heroLabel: { fontSize: 14 },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  stats: { flexDirection: 'row', marginTop: space.lg, alignItems: 'stretch' },
  stat: { flex: 1, gap: 4 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 20, fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: space.lg },
  muted: { fontSize: 15, paddingVertical: space.md },
  catRow: { paddingVertical: space.md, gap: space.sm },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  catName: { flex: 1, fontSize: 15 },
  catPct: { fontSize: 13, fontVariant: ['tabular-nums'] },
  catValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
