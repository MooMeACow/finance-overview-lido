import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Columns, KpiCard, KpiRow, Page, Panel, ScreenHeader, type IconName } from '../components/ui';
import { ForecastBars } from '../components/ForecastBars';
import { AccountSheet, BudgetSheet, PlanSheet } from '../components/PlanningSheets';
import { space, radius, useColors } from '../theme';
import { useLayout } from '../layout';
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
  type Plan,
  getAccounts,
  getBudgets,
  getCategoryTotals,
  getPlans,
} from '../db/database';

export function DashboardScreen({ onOpenMonthly }: { onOpenMonthly: () => void }) {
  const db = useDb();
  const c = useColors();
  const { currency, version, setMonth } = useAppState();
  const { isWide } = useLayout();
  const today = todayString();
  const thisMonth = today.slice(0, 7);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spent, setSpent] = useState<CategoryTotal[]>([]);
  const [selectedForecast, setSelectedForecast] = useState(thisMonth);

  // Sheets
  const [accountSheet, setAccountSheet] = useState<{ open: boolean; account: Account | null }>({ open: false, account: null });
  const [planSheet, setPlanSheet] = useState<{ open: boolean; plan: Plan | null; kind: 'expense' | 'income' }>({ open: false, plan: null, kind: 'expense' });
  const [budgetSheet, setBudgetSheet] = useState<{ open: boolean; budget: Budget | null }>({ open: false, budget: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, p, b, s] = await Promise.all([
        getAccounts(db),
        getPlans(db),
        getBudgets(db),
        getCategoryTotals(db, thisMonth),
      ]);
      if (!alive) return;
      setAccounts(a);
      setPlans(p);
      setBudgets(b);
      setSpent(s);
    })();
    return () => {
      alive = false;
    };
  }, [db, version, thisMonth]);

  const spentMap = useMemo(() => new Map(spent.map((s) => [s.category, s.out_cents])), [spent]);
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const savingsAccounts = accounts.filter((a) => a.type === 'savings');
  const savings = savingsAccounts.reduce((s, a) => s + a.balance_cents, 0);
  const forecast = useMemo(
    () => buildForecast({ startBalanceCents: total, plans, budgets, spentThisMonth: spentMap, today, months: 6 }),
    [total, plans, budgets, spentMap, today],
  );
  const coming = useMemo(() => upcoming(plans, today, 30), [plans, today]);
  const selectedRow = forecast.find((r) => r.month === selectedForecast) ?? forecast[0];
  const incomePlans = plans.filter((p) => p.kind === 'income');
  const expensePlans = plans.filter((p) => p.kind === 'expense');
  const monthlyIn = incomePlans.reduce((s, p) => s + monthlyEquivalent(p), 0);
  const monthlyOut = expensePlans.reduce((s, p) => s + monthlyEquivalent(p), 0);

  const lastForecast = forecast[forecast.length - 1];
  const openMonthly = () => {
    setMonth(thisMonth);
    onOpenMonthly();
  };
  const addPlan = (kind: 'income' | 'expense') => setPlanSheet({ open: true, plan: null, kind });
  const editPlan = (p: Plan) => setPlanSheet({ open: true, plan: p, kind: p.kind });

  // ---------- Sections (arranged differently on desktop and phones) ----------

  const forecastPanel = (
    <Panel title="Expected balance · next 6 months" style={{ flex: 1 }}>
      {accounts.length === 0 && plans.length === 0 ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Add your accounts and your planned income and expenses, and you'll see how your money is expected to develop.
        </Text>
      ) : (
        <>
          <ForecastBars
            rows={forecast}
            currency={currency}
            selected={selectedRow.month}
            onSelect={setSelectedForecast}
            height={isWide ? 180 : 110}
          />
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
            Estimate based on your account balances, plans and budgets. {isWide ? 'Hover or click' : 'Tap'} a month for details.
          </Text>
        </>
      )}
    </Panel>
  );

  const accountsPanel = (
    <Panel
      title="Accounts"
      style={{ flex: 1 }}
      right={<SmallAction label="Add" icon="add" onPress={() => setAccountSheet({ open: true, account: null })} />}
    >
      {accounts.length === 0 ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Add each account (bank, savings, cash) with its current balance to see your total.
        </Text>
      ) : (
        <View>
          {accounts.map((a, i) => (
            <HoverRow key={a.id} onPress={() => setAccountSheet({ open: true, account: a })} first={i === 0}>
              <View style={[styles.accountIcon, { backgroundColor: c.accentSoft }]}>
                <Ionicons name={a.type === 'savings' ? 'trending-up-outline' : 'wallet-outline'} size={16} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[styles.rowSub, { color: c.textMuted }]}>
                  {a.type === 'savings' ? 'Savings' : 'Everyday'} · updated {a.updated_at.slice(0, 10)}
                </Text>
              </View>
              <Text style={[styles.amount, { color: c.text }]}>{formatMoney(a.balance_cents, a.currency)}</Text>
            </HoverRow>
          ))}
          <View style={[styles.totalRow, { borderTopColor: c.hairline }]}>
            <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Total</Text>
            <Text style={[styles.amount, { color: c.text, fontWeight: '700' }]}>{formatMoney(total, currency)}</Text>
          </View>
        </View>
      )}
    </Panel>
  );

  const comingPanel = (
    <Panel title="Coming up · next 30 days" style={{ flex: 1 }}>
      {coming.length === 0 ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>Nothing planned in the next 30 days.</Text>
      ) : (
        <View>
          {coming.slice(0, 8).map((o, i) => (
            <HoverRow key={`${o.plan.id}-${o.date}`} onPress={() => editPlan(o.plan)} first={i === 0}>
              <View style={[styles.dateBadge, { backgroundColor: c.accentSoft }]}>
                <Text style={{ color: c.primary, fontWeight: '700', fontSize: 15 }}>{Number(o.date.slice(8, 10))}</Text>
                <Text style={{ color: c.primary, fontSize: 10 }}>{monthLabel(o.date.slice(0, 7), true)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{o.plan.description}</Text>
                <Text style={[styles.rowSub, { color: c.textMuted }]}>{dayLabel(o.date)}</Text>
              </View>
              <PlanAmount plan={o.plan} currency={currency} />
            </HoverRow>
          ))}
        </View>
      )}
    </Panel>
  );

  const budgetsPanel = (
    <Panel
      title="Monthly budgets"
      style={{ flex: 1 }}
      right={<SmallAction label="Add" icon="add" onPress={() => setBudgetSheet({ open: true, budget: null })} />}
    >
      {budgets.length === 0 ? (
        <Text style={[styles.body, { color: c.textSecondary }]}>
          Set a monthly limit for categories like groceries or eating out to keep an eye on day-to-day spending.
        </Text>
      ) : (
        <View style={{ gap: space.md }}>
          {budgets.map((b) => {
            const used = spentMap.get(b.category) ?? 0;
            const over = used > b.limit_cents;
            const info = getCategory(b.category);
            return (
              <Pressable key={b.category} onPress={() => setBudgetSheet({ open: true, budget: b })} style={{ gap: 6 }}>
                <View style={styles.between}>
                  <View style={styles.inline}>
                    <Ionicons name={info.icon as IconName} size={16} color={c.textSecondary} />
                    <Text style={{ color: c.text, fontSize: 15 }}>{info.label}</Text>
                  </View>
                  <Text style={{ color: c.text, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {formatMoney(used, currency)} <Text style={{ color: c.textMuted }}>of {formatMoney(b.limit_cents, currency)}</Text>
                  </Text>
                </View>
                <Progress value={used / b.limit_cents} over={over} />
                {over ? (
                  <View style={styles.inline}>
                    <Ionicons name="alert-circle" size={14} color={c.danger} />
                    <Text style={{ color: c.text, fontSize: 12 }}>Over by {formatMoney(used - b.limit_cents, currency)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Panel>
  );

  const plansPanel = (
    <Panel
      title="Plans"
      padded={!isWide}
      right={
        <View style={styles.inline}>
          <SmallAction label="Income" icon="add" onPress={() => addPlan('income')} />
          <SmallAction label="Expense" icon="add" onPress={() => addPlan('expense')} />
        </View>
      }
    >
      {plans.length === 0 ? (
        <Text style={[styles.body, { color: c.textSecondary }, isWide && { paddingHorizontal: space.lg }]}>
          Add recurring income and expenses (salary, rent, subscriptions) and one-off plans (a trip, a new laptop).
        </Text>
      ) : isWide ? (
        <PlansTable plans={plans} currency={currency} onEdit={editPlan} />
      ) : (
        <View style={{ gap: space.xs }}>
          <PlanGroup title="Income" icon="arrow-down-circle-outline" plans={incomePlans} currency={currency} onEdit={editPlan} />
          <PlanGroup title="Expenses" icon="arrow-up-circle-outline" plans={expensePlans} currency={currency} onEdit={editPlan} />
        </View>
      )}
      {plans.length > 0 ? (
        <Text style={[styles.rowSub, { color: c.textSecondary }, isWide && { paddingHorizontal: space.lg, paddingBottom: space.xs }]}>
          Per month on average: {formatMoney(monthlyIn, currency, 'always')} in · {formatMoney(-monthlyOut, currency)} out
        </Text>
      ) : null}
    </Panel>
  );

  return (
    <Page>
      <ScreenHeader
        title="Dashboard"
        subtitle={isWide ? `Your money at a glance · ${dayLabel(today)}` : undefined}
      />

      {isWide ? null : (
        <MobileHero accounts={accounts} total={total} currency={currency} onEdit={(a) => setAccountSheet({ open: true, account: a })} />
      )}
      <KpiRow>
        {isWide ? (
          <KpiCard
            tone="hero"
            icon="wallet-outline"
            label="Total money"
            value={formatMoney(total, currency)}
            hint={`${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
          />
        ) : null}
        <KpiCard
          icon="trending-up-outline"
          label="Savings"
          value={formatMoney(savings, currency)}
          hint={
            savingsAccounts.length === 0
              ? 'Mark an account as savings'
              : total > 0
                ? `${Math.round((savings / total) * 100)}% of your money`
                : `${savingsAccounts.length} account${savingsAccounts.length === 1 ? '' : 's'}`
          }
        />
        <KpiCard
          icon="calendar-outline"
          label="Expected in 6 months"
          value={formatMoney(lastForecast.end_balance_cents, currency)}
          hint={`End of ${monthLabel(lastForecast.month)}`}
        />
      </KpiRow>

      <Pressable onPress={openMonthly} accessibilityRole="link" style={styles.link}>
        <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>Open monthly overview</Text>
        <Ionicons name="chevron-forward" size={14} color={c.primary} />
      </Pressable>

      <Columns weights={[2, 1]} breakpoint="wide">
        {forecastPanel}
        {isWide ? accountsPanel : null}
      </Columns>

      <Columns>
        {comingPanel}
        {budgetsPanel}
      </Columns>

      {plansPanel}

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
    </Page>
  );
}

// ---------- Pieces ----------

/** Phone layout: blue card with the total and account pills. */
function MobileHero({
  accounts,
  total,
  currency,
  onEdit,
}: {
  accounts: Account[];
  total: number;
  currency: string;
  onEdit: (a: Account | null) => void;
}) {
  const c = useColors();
  return (
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
            onPress={() => onEdit(a)}
            accessibilityRole="button"
            accessibilityLabel={`${a.name}: ${formatMoney(a.balance_cents, a.currency)}. Edit`}
            style={({ pressed }) => [styles.pill, { backgroundColor: c.heroPill, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.pillName, { color: c.heroMuted }]} numberOfLines={1}>{a.name}</Text>
            <Text style={[styles.pillValue, { color: c.heroText }]}>{formatMoney(a.balance_cents, a.currency)}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => onEdit(null)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.pill, styles.addPill, { borderColor: c.heroMuted, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="add" size={18} color={c.heroText} />
          <Text style={[styles.pillValue, { color: c.heroText }]}>Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Desktop: plans as a table. */
function PlansTable({ plans, currency, onEdit }: { plans: Plan[]; currency: string; onEdit: (p: Plan) => void }) {
  const c = useColors();
  return (
    <View>
      <View style={[styles.tr, styles.th, { borderBottomColor: c.hairline }]}>
        <Text style={[styles.thText, { color: c.textMuted, flex: 2 }]}>Description</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 1 }]}>Type</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 2 }]}>Schedule</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 1.2 }]}>Category</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 1, textAlign: 'right' }]}>Amount</Text>
      </View>
      {plans.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onEdit(p)}
          style={(state) => [
            styles.tr,
            { borderBottomColor: c.hairline },
            (state as { hovered?: boolean }).hovered && { backgroundColor: c.track },
          ]}
        >
          <Text style={[styles.td, { color: c.text, flex: 2, fontWeight: '500' }]} numberOfLines={1}>{p.description}</Text>
          <Text style={[styles.td, { color: c.textSecondary, flex: 1 }]}>{p.kind === 'income' ? 'Income' : 'Expense'}</Text>
          <Text style={[styles.td, { color: c.textSecondary, flex: 2 }]} numberOfLines={1}>{frequencyLabel(p)}</Text>
          <Text style={[styles.td, { color: c.textSecondary, flex: 1.2 }]} numberOfLines={1}>{p.kind === 'income' ? '—' : getCategory(p.category).label}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <PlanAmount plan={p} currency={currency} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** A list row with a hover highlight on the web. */
function HoverRow({ children, onPress, first }: { children: React.ReactNode; onPress: () => void; first?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={(state) => [
        styles.listRow,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
        (state as { hovered?: boolean }).hovered && { backgroundColor: c.track },
        state.pressed && { opacity: 0.6 },
      ]}
    >
      {children}
    </Pressable>
  );
}

function SmallAction({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={(state) => [
        styles.smallAction,
        { borderColor: c.hairline },
        (state as { hovered?: boolean }).hovered && { backgroundColor: c.accentSoft, borderColor: c.accentSoft },
      ]}
    >
      <Ionicons name={icon} size={15} color={c.primary} />
      <Text style={{ color: c.primary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
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
    <Text style={[styles.amount, { color: income ? c.positive : c.text }]}>
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
      <View style={[styles.inline, { paddingTop: space.sm }]}>
        <Ionicons name={icon} size={15} color={c.textMuted} />
        <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Text>
      </View>
      {plans.map((p, i) => (
        <HoverRow key={p.id} onPress={() => onEdit(p)} first={i === 0}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{p.description}</Text>
            <Text style={[styles.rowSub, { color: c.textMuted }]} numberOfLines={1}>
              {frequencyLabel(p)}
              {p.kind === 'expense' ? ` · ${getCategory(p.category).label}` : ''}
            </Text>
          </View>
          <PlanAmount plan={p} currency={currency} />
        </HoverRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 21 },
  hero: { borderRadius: radius.lg, padding: space.xl, gap: 4 },
  heroLabel: { fontSize: 14, fontWeight: '500' },
  heroValue: { fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  heroSub: { fontSize: 13 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  pill: { borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, minWidth: 96 },
  addPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center' },
  pillName: { fontSize: 12 },
  pillValue: { fontSize: 15, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  detail: { borderRadius: radius.md, padding: space.md, gap: 6 },
  hr: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: 8 },
  rowTitle: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 13 },
  amount: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dateBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accountIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, marginTop: space.xs, paddingHorizontal: space.xs },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { paddingVertical: space.sm },
  thText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 14 },
});
