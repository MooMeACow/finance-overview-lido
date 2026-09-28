import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDb } from '../db/provider';

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
  type Budget,
  type CategoryTotal,
  type MonthTotals,
  type Txn,
  getBudgets,
  getCategoryTotals,
  getMonthTotals,
  getTransactions,
} from '../db/database';

export function MonthlyScreen({ onImport, onShowCategory }: { onImport: () => void; onShowCategory: (c: string) => void }) {
  const db = useDb();
  const c = useColors();
  const { month, setMonth, currency, version } = useAppState();
  const [history, setHistory] = useState<MonthTotals[]>([]);
  const [categories, setCategories] = useState<CategoryTotal[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [biggest, setBiggest] = useState<Txn[]>([]);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [h, cats, out, b] = await Promise.all([
        getMonthTotals(db, month, 6),
        getCategoryTotals(db, month),
        getTransactions(db, month, { direction: 'out' }),
        getBudgets(db),
      ]);
      if (!alive) return;
      setHistory(h);
      setCategories(cats);
      setBudgets(b);
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
  const budgetMap = new Map(budgets.map((b) => [b.category, b.limit_cents]));
  // Categories with spending, plus budgeted categories with no spending yet
  const rows: CategoryTotal[] = [
    ...categories,
    ...budgets.filter((b) => !categories.some((x) => x.category === b.category)).map((b) => ({ category: b.category, out_cents: 0, count: 0 })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="Monthly" />
      <MonthSwitcher month={month} onChange={setMonth} />

      <View style={[styles.hero, { backgroundColor: c.hero }]}>
        <Text style={[styles.heroLabel, { color: c.heroMuted }]}>Net for {monthLabel(month)}</Text>
        <Text style={[styles.heroValue, { color: c.heroText }]}>{formatMoney(net, currency, 'always')}</Text>
        <View style={styles.stats}>
          <Stat label="Money in" value={formatMoney(current.in_cents, currency)} />
          <View style={[styles.divider, { backgroundColor: c.heroPill }]} />
          <Stat label="Money out" value={formatMoney(current.out_cents, currency)} />
        </View>
      </View>

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
            {rows.length === 0 ? (
              <Text style={[styles.muted, { color: c.textSecondary }]}>No spending this month.</Text>
            ) : (
              rows.map((cat) => {
                const info = getCategory(cat.category);
                const share = totalOut ? cat.out_cents / totalOut : 0;
                const limit = budgetMap.get(cat.category);
                const over = limit !== undefined && cat.out_cents > limit;
                const fillPct = limit ? Math.min(1, cat.out_cents / limit) * 100 : Math.max(2, share * 100);
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
                      {limit === undefined ? (
                        <Text style={[styles.catPct, { color: c.textMuted }]}>{Math.round(share * 100)}%</Text>
                      ) : null}
                      <Text style={[styles.catValue, { color: c.text }]}>
                        {formatMoney(cat.out_cents, currency)}
                        {limit !== undefined ? <Text style={{ color: c.textMuted, fontWeight: '400' }}> / {formatMoney(limit, currency)}</Text> : null}
                      </Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: c.track }]}>
                      <View
                        style={[
                          styles.fill,
                          {
                            width: `${fillPct}%` as `${number}%`,
                            backgroundColor: limit === undefined ? c.seriesOut : over ? c.danger : c.primary,
                          },
                        ]}
                      />
                    </View>
                    {over ? (
                      <View style={styles.catTop}>
                        <Ionicons name="alert-circle" size={14} color={c.danger} />
                        <Text style={{ color: c.text, fontSize: 12 }}>Over budget by {formatMoney(cat.out_cents - limit!, currency)}</Text>
                      </View>
                    ) : null}
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

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: c.heroMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.heroText }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  hero: { marginTop: space.lg, gap: space.xs, borderRadius: 20, padding: space.xl },
  heroLabel: { fontSize: 14 },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  stats: { flexDirection: 'row', marginTop: space.lg, alignItems: 'stretch' },
  stat: { flex: 1, gap: 4 },
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
