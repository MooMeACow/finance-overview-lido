import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDb } from '../db/provider';

import { Button, Card, Columns, EmptyState, IconButton, Page, Panel, Press, ScreenHeader, Text, type IconName } from '../components/ui';
import { useLayout } from '../layout';
import { MonthlyBars } from '../components/MonthlyBars';
import { TransactionRow } from '../components/TransactionRow';
import { EditTransactionSheet } from '../components/TransactionSheets';
import { fonts, radius, shadow, space, type as T, useColors } from '../theme';
import { useAppState } from '../state';
import { getCategory } from '../lib/categories';
import { formatMoney } from '../lib/money';
import { currentMonthKey, monthLabel, shiftMonth } from '../lib/dates';
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
import { Icon } from '../lido/Icon';
import { BeadRope } from '../lido/BeadRope';
import { Lifebuoy } from '../lido/Lifebuoy';
import { useFirstVisit, useReducedMotion } from '../lido/motionPrefs';
import { enter, web } from '../lido/web';

export function MonthlyScreen({ onImport, onShowCategory }: { onImport: () => void; onShowCategory: (c: string) => void }) {
  const db = useDb();
  const c = useColors();
  const { month, setMonth, currency, version } = useAppState();
  const { isWide } = useLayout();
  const reduced = useReducedMotion();
  const first = useFirstVisit('monthly');
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
          .slice(0, 4),
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
  const kept = current.in_cents > 0 ? net / current.in_cents : null;
  const isThisMonth = month === currentMonthKey();
  const stagger = (i: number) => (first ? enter(60 + i * 70, 10, 460, reduced) : undefined);

  const monthControls = (
    <View style={[styles.arrows, { backgroundColor: c.card }, shadow(c, 1)]}>
      <IconButton icon="chevron-back" label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
      {!isThisMonth ? (
        <Press
          feedback="soft"
          onPress={() => setMonth(currentMonthKey())}
          accessibilityRole="button"
          style={({ hovered }) => [styles.todayButton, hovered && { backgroundColor: c.hover }]}
        >
          <Text style={[T.label, { color: c.primary, fontFamily: fonts.ui[600] }]}>This month</Text>
        </Press>
      ) : null}
      <IconButton icon="chevron-forward" label="Next month" onPress={() => setMonth(shiftMonth(month, 1))} />
    </View>
  );

  const categoryList =
    rows.length === 0 ? (
      <Text style={[T.body, { color: c.textSecondary, paddingVertical: space.md }]}>No spending this month.</Text>
    ) : (
      rows.map((cat) => {
        const info = getCategory(cat.category);
        const share = totalOut ? cat.out_cents / totalOut : 0;
        const limit = budgetMap.get(cat.category);
        const over = limit !== undefined && cat.out_cents > limit;
        return (
          <Press
            key={cat.category}
            feedback="soft"
            onPress={() => onShowCategory(cat.category)}
            accessibilityRole="button"
            accessibilityLabel={`${info.label}: ${formatMoney(cat.out_cents, currency)}, ${Math.round(share * 100)} percent. Show transactions`}
            style={({ hovered }) => [styles.catRow, hovered && { backgroundColor: c.hover }]}
          >
            <View style={styles.catTop}>
              <View style={[styles.catIcon, { backgroundColor: c.track }]}>
                <Icon name={info.icon as IconName} size={17} color={c.primary} weight="duotone" duotoneColor={c.primary} />
              </View>
              <Text style={[T.bodyStrong, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {info.label}
              </Text>
              {limit === undefined ? <Text style={[T.label, { color: c.textMuted, fontVariant: ['tabular-nums'] }]}>{Math.round(share * 100)}%</Text> : null}
              <Text style={[styles.catValue, { color: c.text }]}>
                {formatMoney(cat.out_cents, currency)}
                {limit !== undefined ? <Text style={{ color: c.textMuted, fontFamily: fonts.ui[400] }}> / {formatMoney(limit, currency)}</Text> : null}
              </Text>
            </View>
            {limit !== undefined ? (
              <BeadRope value={cat.out_cents / limit} beads={isWide ? 28 : 18} />
            ) : (
              <View style={styles.shareTrack}>
                <View
                  style={[
                    styles.share,
                    { width: `${Math.max(2, share * 100)}%` as `${number}%`, backgroundColor: c.seriesOut },
                    web({ backgroundImage: 'linear-gradient(90deg, #FFC7A3 0%, #EE6A43 100%)' }),
                  ]}
                />
              </View>
            )}
            {over ? (
              <View style={styles.catTop}>
                <Icon name="alert-circle" size={14} color={c.danger} />
                <Text style={[T.small, { color: c.text }]}>Over budget by {formatMoney(cat.out_cents - limit!, currency)}</Text>
              </View>
            ) : null}
          </Press>
        );
      })
    );

  const netTile = (
    <View style={[styles.netTile, !isWide && styles.netTilePhone, { backgroundColor: c.card }, shadow(c, 1)]}>
      <View style={{ flex: 1, gap: space.lg, minWidth: 0 }}>
        <View style={{ gap: 2 }}>
          <Text style={[T.label, { color: c.textMuted }]}>Net for {monthLabel(month).split(' ')[0]}</Text>
          <Text
            style={[isWide ? T.display : T.displayPhone, { color: net >= 0 ? c.text : c.danger, fontVariant: ['tabular-nums'] }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(net, currency, 'always')}
          </Text>
          <Text style={[T.small, { color: c.textMuted }]}>Money in minus money out</Text>
        </View>
        <View style={styles.flows}>
          <Flow color="#2D6BE6" label="Money in" value={formatMoney(current.in_cents, currency)} />
          <Flow color="#EE6A43" label="Money out" value={formatMoney(current.out_cents, currency)} />
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Lifebuoy share={kept} size={isWide ? 124 : 104} label="Kept of income" />
        <Text style={[T.label, { color: c.textSecondary }]}>{kept === null ? 'No income this month' : 'Kept of income'}</Text>
      </View>
    </View>
  );

  return (
    <Page>
      <View style={stagger(0)}>
        <ScreenHeader title={monthLabel(month)} subtitle="Where your money came from and went" right={isWide ? monthControls : undefined} />
        {isWide ? null : <View style={{ marginTop: space.md, alignSelf: 'flex-start' }}>{monthControls}</View>}
      </View>

      {loaded && !hasAnyData ? (
        <Card>
          <EmptyState icon="document-text-outline" title="No transactions yet" body="Import a bank statement (CSV) or add a transaction by hand to see your overview." />
          <View style={{ alignItems: 'center' }}>
            <Button label="Import a statement" icon="cloud-upload-outline" onPress={onImport} />
          </View>
        </Card>
      ) : null}

      {hasAnyData ? (
        <>
          <View style={stagger(1)}>
            <Columns weights={[5, 7]} breakpoint="wide">
              {netTile}
              <Panel title="Last 6 months" subtitle="Tap a month to open it" style={{ flex: 1 }}>
                <MonthlyBars data={history} selected={month} currency={currency} onSelect={setMonth} height={isWide ? 176 : 118} showValues={isWide} />
              </Panel>
            </Columns>
          </View>

          <View style={stagger(2)}>
            <Columns weights={[7, 5]} breakpoint="wide">
              <Panel title="Spending by category" subtitle="Tap a category to see its transactions" style={{ flex: 1 }}>
                <View style={{ gap: 2 }}>{categoryList}</View>
              </Panel>
              {biggest.length > 0 ? (
                <Panel title="Biggest expenses" style={{ flex: 1 }}>
                  <View style={{ gap: 2 }}>
                    {biggest.map((t) => (
                      <TransactionRow key={t.id} txn={t} onPress={() => setEditing(t)} />
                    ))}
                  </View>
                </Panel>
              ) : null}
            </Columns>
          </View>
        </>
      ) : null}

      <EditTransactionSheet txn={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function Flow({ color, label, value }: { color: string; label: string; value: string }) {
  const c = useColors();
  return (
    <View style={[styles.flow, { backgroundColor: c.cardSunk }]}>
      <View style={styles.flowLabel}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text style={[T.label, { color: c.textSecondary }]}>{label}</Text>
      </View>
      <Text style={{ fontFamily: fonts.ui[600], fontSize: 17, color: c.text, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  arrows: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.pill, padding: 4 },
  todayButton: { height: 40, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center' },
  netTile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xl, borderRadius: radius.lg, padding: space.xl },
  netTilePhone: { padding: 18, borderRadius: 24, gap: space.lg },
  flows: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  flow: { flexGrow: 1, flexBasis: 140, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
  flowLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  catRow: { paddingVertical: 12, paddingHorizontal: 8, gap: 10, borderRadius: radius.sm },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  catIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  catValue: { fontFamily: fonts.ui[600], fontSize: 15, fontVariant: ['tabular-nums'], textAlign: 'right' },
  shareTrack: { height: 10, justifyContent: 'center' },
  share: { height: 10, borderRadius: 5 },
});
