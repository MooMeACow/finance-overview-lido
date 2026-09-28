import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button, Card, ScreenHeader, SectionTitle, type IconName } from '../components/ui';
import { ForecastBars } from '../components/ForecastBars';
import { AccountSheet, BudgetSheet, PlanSheet } from '../components/PlanningSheets';
import { space, radius, useColors } from '../theme';
import { useAppState } from '../state';
import { useDb } from '../db/provider';
import { formatMoney } from '../lib/money';
import { dayLabel, monthLabel, todayString } from '../lib/dates';
import { getCategory } from '../lib/categories';
import { buildForecast, frequencyLabel, monthlyEquivalent, upcoming } from '../lib/forecast';
import {
  type Account,
  type Budget,
  type CategoryTotal,
  type MonthTotals,
  type Plan,
  getAccounts,
  getBudgets,
  getCategoryTotals,
  getMonthTotals,
  getPlans,
} from '../db/database';

export function DashboardScreen({ onOpenMonthly }: { onOpenMonthly: () => void }) {
  const db = useDb();
  const c = useColors();
  const { currency, version, setMonth } = useAppState();
  const today = todayString();
  const thisMonth = today.slice(0, 7);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spent, setSpent] = useState<CategoryTotal[]>([]);
  const [month, setMonthTotals] = useState<MonthTotals>({ month: thisMonth, in_cents: 0, out_cents: 0 });
  const [selectedForecast, setSelectedForecast] = useState(thisMonth);

  // Sheets
  const [accountSheet, setAccountSheet] = useState<{ open: boolean; account: Account | null }>({ open: false, account: null });
  const [planSheet, setPlanSheet] = useState<{ open: boolean; plan: Plan | null; kind: 'expense' | 'income' }>({ open: false, plan: null, kind: 'expense' });
  const [budgetSheet, setBudgetSheet] = useState<{ open: boolean; budget: Budget | null }>({ open: false, budget: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, p, b, s, m] = await Promise.all([
        getAccounts(db),
        getPlans(db),
        getBudgets(db),
        getCategoryTotals(db, thisMonth),
        getMonthTotals(db, thisMonth, 1),
      ]);
      if (!alive) return;
      setAccounts(a);
      setPlans(p);
      setBudgets(b);
      setSpent(s);
      setMonthTotals(m[0]);
    })();
    return () => {
      alive = false;
    };
  }, [db, version, thisMonth]);

  const spentMap = useMemo(() => new Map(spent.map((s) => [s.category, s.out_cents])), [spent]);
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const forecast = useMemo(
    () => buildForecast({ startBalanceCents: total, plans, budgets, spentThisMonth: spentMap, today, months: 6 }),
    [total, plans, budgets, spentMap, today],
  );
  const coming = useMemo(() => upcoming(plans, today, 30), [plans, today]);
  const selectedRow = forecast.find((r) => r.month === selectedForecast) ?? forecast[0];
  const budgetTotal = budgets.reduce((s, b) => s + b.limit_cents, 0);
  const budgetSpent = budgets.reduce((s, b) => s + (spentMap.get(b.category) ?? 0), 0);
  const incomePlans = plans.filter((p) => p.kind === 'income');
  const expensePlans = plans.filter((p) => p.kind === 'expense');
  const monthlyIn = incomePlans.reduce((s, p) => s + monthlyEquivalent(p), 0);
  const monthlyOut = expensePlans.reduce((s, p) => s + monthlyEquivalent(p), 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader title="Dashboard" />

      {/* Total money */}
      <View style={[styles.hero, { backgroundColor: c.hero }]}>
        <Text style={[styles.heroLabel, { color: c.heroMuted }]}>Total money</Text>
        <Text style={[styles.heroValue, { color: c.heroText }]}>{formatMoney(total, currency)}</Text>
        <Text style={[styles.heroSub, { color: c.heroMuted }]}>
          {accounts.length === 0 ? 'Add your accounts to see your total' : `Across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
        </Text>
        <View style={styles.pills}>
          {accounts.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => setAccountSheet({ open: true, account: a })}
              accessibilityRole="button"
              accessibilityLabel={`${a.name}: ${formatMoney(a.balance_cents, a.currency)}. Edit`}
              style={({ pressed }) => [styles.pill, { backgroundColor: c.heroPill, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.pillName, { color: c.heroMuted }]} numberOfLines={1}>{a.name}</Text>
              <Text style={[styles.pillValue, { color: c.heroText }]}>{formatMoney(a.balance_cents, a.currency)}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setAccountSheet({ open: true, account: null })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.pill, styles.addPill, { borderColor: c.heroMuted, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="add" size={18} color={c.heroText} />
            <Text style={[styles.pillValue, { color: c.heroText }]}>Account</Text>
          </Pressable>
        </View>
      </View>

      {/* This month */}
      <SectionTitle right={<LinkText label="Monthly overview" onPress={() => { setMonth(thisMonth); onOpenMonthly(); }} />}>
        {monthLabel(thisMonth)}
      </SectionTitle>
      <View style={styles.statRow}>
        <StatCard label="Money in" value={formatMoney(month.in_cents, currency)} swatch={c.seriesIn} />
        <StatCard label="Money out" value={formatMoney(month.out_cents, currency)} swatch={c.seriesOut} />
      </View>
      {budgets.length > 0 ? (
        <Card style={{ marginTop: space.sm, gap: space.sm }}>
          <View style={styles.between}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>Budgets used</Text>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
              {formatMoney(budgetSpent, currency)} of {formatMoney(budgetTotal, currency)}
            </Text>
          </View>
          <Progress value={budgetTotal ? budgetSpent / budgetTotal : 0} />
        </Card>
      ) : null}

      {/* Forecast */}
      <SectionTitle>Expected balance · next 6 months</SectionTitle>
      <Card style={{ gap: space.md }}>
        {accounts.length === 0 && plans.length === 0 ? (
          <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 21 }}>
            Add your accounts and your planned income and expenses below, and you'll see how your money is expected to develop.
          </Text>
        ) : (
          <>
            <ForecastBars rows={forecast} currency={currency} selected={selectedRow.month} onSelect={setSelectedForecast} />
            <View style={[styles.detail, { backgroundColor: c.background }]}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>
                {monthLabel(selectedRow.month)}
                {selectedRow.month === thisMonth ? ' (rest of month)' : ''}
              </Text>
              <DetailLine label="Planned income" cents={selectedRow.income_cents} currency={currency} sign="+" />
              <DetailLine label="Planned expenses" cents={selectedRow.expense_cents} currency={currency} sign="−" />
              <DetailLine label="Budgeted spending" cents={selectedRow.budget_cents} currency={currency} sign="−" />
              <View style={[styles.hr, { backgroundColor: c.hairline }]} />
              <View style={styles.between}>
                <Text style={{ color: c.text, fontWeight: '600' }}>Expected balance at month end</Text>
                <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {formatMoney(selectedRow.end_balance_cents, currency)}
                </Text>
              </View>
            </View>
            <Text style={{ color: c.textMuted, fontSize: 12, lineHeight: 17 }}>
              Estimate based on your account balances, plans and budgets. Tap a month for details.
            </Text>
          </>
        )}
      </Card>

      {/* Coming up */}
      <SectionTitle>Coming up · next 30 days</SectionTitle>
      <Card style={{ paddingVertical: space.xs }}>
        {coming.length === 0 ? (
          <Text style={[styles.emptyLine, { color: c.textSecondary }]}>Nothing planned in the next 30 days.</Text>
        ) : (
          coming.slice(0, 8).map((o, i) => (
            <Pressable
              key={`${o.plan.id}-${o.date}`}
              onPress={() => setPlanSheet({ open: true, plan: o.plan, kind: o.plan.kind })}
              style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }]}
            >
              <View style={[styles.dateBadge, { backgroundColor: c.accentSoft }]}>
                <Text style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>{Number(o.date.slice(8, 10))}</Text>
                <Text style={{ color: c.primary, fontSize: 10 }}>{monthLabel(o.date.slice(0, 7), true)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{o.plan.description}</Text>
                <Text style={{ color: c.textMuted, fontSize: 13 }}>{dayLabel(o.date)}</Text>
              </View>
              <PlanAmount plan={o.plan} currency={currency} />
            </Pressable>
          ))
        )}
      </Card>

      {/* Plans */}
      <SectionTitle>Plans</SectionTitle>
      <Card style={{ paddingVertical: space.sm, gap: space.xs }}>
        {plans.length > 0 ? (
          <Text style={{ color: c.textSecondary, fontSize: 13, paddingHorizontal: space.xs, paddingBottom: space.xs }}>
            Per month on average: {formatMoney(monthlyIn, currency, 'always')} in · {formatMoney(-monthlyOut, currency)} out
          </Text>
        ) : null}
        <PlanGroup title="Income" icon="arrow-down-circle-outline" plans={incomePlans} currency={currency} onEdit={(p) => setPlanSheet({ open: true, plan: p, kind: 'income' })} />
        <PlanGroup title="Expenses" icon="arrow-up-circle-outline" plans={expensePlans} currency={currency} onEdit={(p) => setPlanSheet({ open: true, plan: p, kind: 'expense' })} />
        <View style={[styles.row, { marginTop: space.sm }]}>
          <View style={{ flex: 1 }}>
            <Button label="Income" icon="add" variant="secondary" onPress={() => setPlanSheet({ open: true, plan: null, kind: 'income' })} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Expense" icon="add" variant="secondary" onPress={() => setPlanSheet({ open: true, plan: null, kind: 'expense' })} />
          </View>
        </View>
      </Card>

      {/* Budgets */}
      <SectionTitle>Monthly budgets</SectionTitle>
      <Card style={{ gap: space.md }}>
        {budgets.length === 0 ? (
          <Text style={{ color: c.textSecondary, fontSize: 15, lineHeight: 21 }}>
            Set a monthly limit for categories like groceries or eating out to keep an eye on day-to-day spending.
          </Text>
        ) : (
          budgets.map((b) => {
            const used = spentMap.get(b.category) ?? 0;
            const over = used > b.limit_cents;
            const info = getCategory(b.category);
            return (
              <Pressable key={b.category} onPress={() => setBudgetSheet({ open: true, budget: b })} style={{ gap: 6 }}>
                <View style={styles.between}>
                  <View style={styles.row}>
                    <Ionicons name={info.icon as IconName} size={16} color={c.textSecondary} />
                    <Text style={{ color: c.text, fontSize: 15 }}>{info.label}</Text>
                  </View>
                  <Text style={{ color: c.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {formatMoney(used, currency)} <Text style={{ color: c.textMuted }}>of {formatMoney(b.limit_cents, currency)}</Text>
                  </Text>
                </View>
                <Progress value={used / b.limit_cents} over={over} />
                {over ? (
                  <View style={styles.row}>
                    <Ionicons name="alert-circle" size={14} color={c.danger} />
                    <Text style={{ color: c.text, fontSize: 12 }}>Over by {formatMoney(used - b.limit_cents, currency)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
        <Button label="Budget" icon="add" variant="secondary" onPress={() => setBudgetSheet({ open: true, budget: null })} />
      </Card>

      <AccountSheet visible={accountSheet.open} account={accountSheet.account} onClose={() => setAccountSheet({ open: false, account: null })} />
      <PlanSheet
        visible={planSheet.open}
        plan={planSheet.plan}
        defaultKind={planSheet.kind}
        onClose={() => setPlanSheet((s) => ({ ...s, open: false, plan: null }))}
      />
      <BudgetSheet
        visible={budgetSheet.open}
        category={budgetSheet.budget?.category ?? null}
        limitCents={budgetSheet.budget?.limit_cents ?? null}
        spentCents={budgetSheet.budget ? spentMap.get(budgetSheet.budget.category) ?? 0 : 0}
        onClose={() => setBudgetSheet({ open: false, budget: null })}
      />
    </ScrollView>
  );
}

function StatCard({ label, value, swatch }: { label: string; value: string; swatch: string }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, gap: 6, padding: space.md }}>
      <View style={styles.row}>
        <View style={[styles.swatch, { backgroundColor: swatch }]} />
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{label}</Text>
      </View>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{value}</Text>
    </Card>
  );
}

function Progress({ value, over }: { value: number; over?: boolean }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[styles.track, { backgroundColor: c.track }]}>
      <View style={[styles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: over ? c.danger : c.primary }]} />
    </View>
  );
}

function DetailLine({ label, cents, currency, sign }: { label: string; cents: number; currency: string; sign: '+' | '−' }) {
  const c = useColors();
  return (
    <View style={styles.between}>
      <Text style={{ color: c.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {cents === 0 ? formatMoney(0, currency) : `${sign}${formatMoney(cents, currency)}`}
      </Text>
    </View>
  );
}

function PlanAmount({ plan, currency }: { plan: Plan; currency: string }) {
  const c = useColors();
  const income = plan.kind === 'income';
  return (
    <Text style={{ color: income ? c.positive : c.text, fontWeight: '600', fontSize: 15, fontVariant: ['tabular-nums'] }}>
      {formatMoney(income ? plan.amount_cents : -plan.amount_cents, currency, 'always')}
    </Text>
  );
}

function PlanGroup({
  title,
  icon,
  plans,
  currency,
  onEdit,
}: {
  title: string;
  icon: IconName;
  plans: Plan[];
  currency: string;
  onEdit: (p: Plan) => void;
}) {
  const c = useColors();
  if (plans.length === 0) return null;
  return (
    <View>
      <View style={[styles.row, { paddingHorizontal: space.xs, paddingTop: space.sm }]}>
        <Ionicons name={icon} size={15} color={c.textMuted} />
        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Text>
      </View>
      {plans.map((p) => (
        <Pressable key={p.id} onPress={() => onEdit(p)} style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.6 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{p.description}</Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={1}>
              {frequencyLabel(p)}
              {p.kind === 'expense' ? ` · ${getCategory(p.category).label}` : ''}
            </Text>
          </View>
          <PlanAmount plan={p} currency={currency} />
        </Pressable>
      ))}
    </View>
  );
}

function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={styles.row}>
      <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={c.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  hero: { borderRadius: radius.lg, padding: space.xl, gap: 4 },
  heroLabel: { fontSize: 14, fontWeight: '500' },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  heroSub: { fontSize: 13 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  pill: { borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, minWidth: 96 },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center' },
  pillName: { fontSize: 12 },
  pillValue: { fontSize: 15, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: space.sm },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  detail: { borderRadius: radius.md, padding: space.md, gap: 6 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs },
  dateBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptyLine: { fontSize: 15, paddingVertical: space.md },
});
