import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDb } from '../db/provider';

import { Button, Card, Columns, EmptyState, KpiCard, KpiRow, MonthSwitcher, Page, Panel, ScreenHeader, type IconName } from '../components/ui';
import { useLayout } from '../layout';
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
  const { isWide } = useLayout();
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

  const savedShare = current.in_cents > 0 ? Math.round((net / current.in_cents) * 100) : null;

  const categoryList =
    rows.length === 0 ? (
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
            style={(state) => [
              styles.catRow,
              (state as { hovered?: boolean }).hovered && { backgroundColor: c.track },
              state.pressed && { opacity: 0.6 },
            ]}
          >
            <View style={styles.catTop}>
              <Ionicons name={info.icon as IconName} size={16} color={c.textSecondary} />
              <Text style={[styles.catName, { color: c.text }]}>{info.label}</Text>
              {limit === undefined ? <Text style={[styles.catPct, { color: c.textMuted }]}>{Math.round(share * 100)}%</Text> : null}
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
    );

  return (
    <Page>
      <ScreenHeader
        title="Monthly"
        subtitle={isWide ? 'Where your money came from and went' : undefined}
        right={isWide ? <MonthSwitcher month={month} onChange={setMonth} /> : undefined}
      />
      {!isWide ? <MonthSwitcher month={month} onChange={setMonth} /> : null}

      {isWide ? (
        <KpiRow>
          <KpiCard tone="hero" label={`Net · ${monthLabel(month)}`} value={formatMoney(net, currency, 'always')} hint="Money in minus money out" />
          <KpiCard swatch={c.seriesIn} label="Money in" value={formatMoney(current.in_cents, currency)} />
          <KpiCard swatch={c.seriesOut} label="Money out" value={formatMoney(current.out_cents, currency)} />
          <KpiCard
            icon="pie-chart-outline"
            label="Kept of income"
            value={savedShare === null ? '—' : `${savedShare}%`}
            hint={savedShare === null ? 'No income this month' : 'Net as a share of money in'}
          />
        </KpiRow>
      ) : (
        <View style={[styles.hero, { backgroundColor: c.hero }]}>
          <Text style={[styles.heroLabel, { color: c.heroMuted }]}>Net for {monthLabel(month)}</Text>
          <Text style={[styles.heroValue, { color: c.heroText }]}>{formatMoney(net, currency, 'always')}</Text>
          <View style={styles.stats}>
            <Stat label="Money in" value={formatMoney(current.in_cents, currency)} />
            <View style={[styles.divider, { backgroundColor: c.heroPill }]} />
            <Stat label="Money out" value={formatMoney(current.out_cents, currency)} />
          </View>
        </View>
      )}

      {loaded && !hasAnyData ? (
        <Card>
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
          <Columns weights={[3, 2]} breakpoint="wide">
            <Panel title="Last 6 months" style={{ flex: 1 }}>
              <MonthlyBars data={history} selected={month} currency={currency} onSelect={setMonth} height={isWide ? 220 : 120} />
            </Panel>
            <Panel title="Spending by category" style={{ flex: 1 }}>
              <View>{categoryList}</View>
            </Panel>
          </Columns>

          {biggest.length > 0 ? (
            <Panel title="Biggest expenses">
              <View>
                {biggest.map((t) => (
                  <TransactionRow key={t.id} txn={t} onPress={() => setEditing(t)} />
                ))}
              </View>
            </Panel>
          ) : null}
        </>
      ) : null}

      <EditTransactionSheet txn={editing} onClose={() => setEditing(null)} />
    </Page>
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
  hero: { gap: space.xs, borderRadius: 20, padding: space.xl },
  heroLabel: { fontSize: 14 },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  stats: { flexDirection: 'row', marginTop: space.lg, alignItems: 'stretch' },
  stat: { flex: 1, gap: 4 },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 20, fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: space.lg },
  muted: { fontSize: 15, paddingVertical: space.md },
  catRow: { paddingVertical: space.md, paddingHorizontal: space.xs, gap: space.sm, borderRadius: 8 },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  catName: { flex: 1, fontSize: 15 },
  catPct: { fontSize: 13, fontVariant: ['tabular-nums'] },
  catValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
