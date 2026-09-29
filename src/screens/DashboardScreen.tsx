import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Columns, Page, Panel, Press, SmallAction, Text, type IconName } from '../components/ui';
import { TideChart } from '../components/TideChart';
import { AccountSheet, BudgetSheet, DebtSheet, PlanSheet } from '../components/PlanningSheets';
import { fonts, radius, space, type as T, useColors } from '../theme';
import { useLayout } from '../layout';
import { useAppState } from '../state';
import { useDb } from '../db/provider';
import { formatMoney } from '../lib/money';
import { dayLabel, monthLabel, shortDate, todayString } from '../lib/dates';
import { getCategory } from '../lib/categories';
import { earliestLinkedDay, linkLabel, liveBalances, type LiveAccount } from '../lib/balances';
import { buildForecast, frequencyLabel, monthlyEquivalent, upcoming } from '../lib/forecast';
import {
  type Budget,
  type CategoryTotal,
  type Debt,
  type Plan,
  getAccounts,
  getBudgets,
  getCategoryTotals,
  getDebts,
  getPlans,
  getTransactionsAfter,
} from '../db/database';
import { Icon } from '../lido/Icon';
import { BeadRope } from '../lido/BeadRope';
import { raft } from '../lido/buses';
import { useFirstVisit, useReducedMotion } from '../lido/motionPrefs';
import { enter } from '../lido/web';
import { PoolHero } from './dashboard/PoolHero';

export function DashboardScreen({ onOpenMonthly }: { onOpenMonthly: () => void }) {
  const db = useDb();
  const c = useColors();
  const { currency, version, setMonth } = useAppState();
  const { isWide } = useLayout();
  const reduced = useReducedMotion();
  const first = useFirstVisit('dashboard');
  const today = todayString();
  const thisMonth = today.slice(0, 7);

  const [loaded, setLoaded] = useState(false);
  const [accounts, setAccounts] = useState<LiveAccount[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spent, setSpent] = useState<CategoryTotal[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtSheet, setDebtSheet] = useState<{ open: boolean; debt: Debt | null }>({ open: false, debt: null });
  const [selectedForecast, setSelectedForecast] = useState(thisMonth);

  // Sheets
  const [accountSheet, setAccountSheet] = useState<{ open: boolean; account: LiveAccount | null }>({ open: false, account: null });
  const [planSheet, setPlanSheet] = useState<{ open: boolean; plan: Plan | null; kind: 'expense' | 'income' }>({ open: false, plan: null, kind: 'expense' });
  const [budgetSheet, setBudgetSheet] = useState<{ open: boolean; budget: Budget | null }>({ open: false, budget: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [a, p, b, s, d] = await Promise.all([
        getAccounts(db),
        getPlans(db),
        getBudgets(db),
        getCategoryTotals(db, thisMonth),
        getDebts(db),
      ]);
      // Linked accounts: add imported transactions dated after their balance day
      const since = earliestLinkedDay(a);
      const recent = since ? await getTransactionsAfter(db, since) : [];
      if (!alive) return;
      setAccounts(liveBalances(a, recent));
      setPlans(p);
      setBudgets(b);
      setSpent(s);
      setDebts(d);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [db, version, thisMonth]);

  const spentMap = useMemo(() => new Map(spent.map((s) => [s.category, s.out_cents])), [spent]);
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const currentAccounts = accounts.filter((a) => a.type !== 'savings');
  const savingsAccounts = accounts.filter((a) => a.type === 'savings');
  const current = currentAccounts.reduce((s, a) => s + a.balance_cents, 0);
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
  const overBudget = budgets.filter((b) => (spentMap.get(b.category) ?? 0) > b.limit_cents).length;
  const mood = forecast.some((r) => r.end_balance_cents < 0) ? 'low' : overBudget > 0 ? 'ok' : 'good';

  const openMonthly = () => {
    setMonth(thisMonth);
    onOpenMonthly();
  };
  const addPlan = (kind: 'income' | 'expense') => setPlanSheet({ open: true, plan: null, kind });
  const editPlan = (p: Plan) => setPlanSheet({ open: true, plan: p, kind: p.kind });
  const stagger = (i: number) => (first ? enter(90 + i * 70, 10, 480, reduced) : undefined);

  // ---------- Sections (arranged differently on desktop and phones) ----------

  const forecastPanel = (
    <Panel title="Expected balance" subtitle="Next 6 months, from your accounts, plans and budgets" style={{ flex: 1 }}>
      {accounts.length === 0 && plans.length === 0 ? (
        <Text style={[T.body, { color: c.textSecondary }]}>
          Add your accounts and your planned income and expenses, and you'll see how your money is expected to develop.
        </Text>
      ) : (
        <>
          <TideChart rows={forecast} currency={currency} selected={selectedRow.month} onSelect={setSelectedForecast} height={isWide ? 184 : 120} />
          <View style={[styles.detail, { backgroundColor: c.cardSunk }]}>
            <View style={styles.between}>
              <Text style={[T.bodyStrong, { color: c.text, fontFamily: fonts.display[600], fontSize: 16 }]}>
                {monthLabel(selectedRow.month)}
                {selectedRow.month === thisMonth ? ' (rest of month)' : ''}
              </Text>
              {isWide ? <Text style={[T.small, { color: c.textMuted }]}>Hover or click a month</Text> : null}
            </View>
            <DetailLine label="Planned income" cents={selectedRow.income_cents} currency={currency} sign="+" />
            <DetailLine label="Planned expenses" cents={selectedRow.expense_cents} currency={currency} sign="-" />
            <DetailLine label="Budgeted spending" cents={selectedRow.budget_cents} currency={currency} sign="-" />
            <View style={[styles.hr, { backgroundColor: c.hairline }]} />
            <View style={styles.between}>
              <Text style={[T.bodyStrong, { color: c.text }]}>Expected balance at month end</Text>
              <Text style={[T.bodyStrong, { color: c.text, fontFamily: fonts.ui[700], fontVariant: ['tabular-nums'] }]}>
                {formatMoney(selectedRow.end_balance_cents, currency)}
              </Text>
            </View>
          </View>
        </>
      )}
    </Panel>
  );

  const accountsPanel = (
    <Panel
      title="Accounts"
      subtitle={accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}` : undefined}
      style={{ flex: 1 }}
      right={<SmallAction label="Add" icon="add" onPress={() => setAccountSheet({ open: true, account: null })} />}
    >
      {accounts.length === 0 ? (
        <Text style={[T.body, { color: c.textSecondary }]}>Add each account (bank, savings, cash) with its current balance to see your total.</Text>
      ) : (
        <View style={{ gap: space.lg }}>
          {[
            { title: 'Current', list: currentAccounts, sum: current, kind: 'current' as const },
            { title: 'Savings & investments', list: savingsAccounts, sum: savings, kind: 'savings' as const },
          ]
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <View key={g.title} style={{ gap: 2 }}>
                <View style={[styles.between, { paddingHorizontal: 8, marginBottom: 2 }]}>
                  <Text style={[T.label, { color: c.textMuted }]}>{g.title}</Text>
                  <Text style={[T.label, { color: c.textSecondary, fontVariant: ['tabular-nums'] }]}>{formatMoney(g.sum, currency)}</Text>
                </View>
                {g.list.map((a) => (
                  <HoverRow
                    key={a.id}
                    onPress={() => setAccountSheet({ open: true, account: a })}
                    onHover={(on) => (raft.hovered = on ? a.id : raft.hovered === a.id ? null : raft.hovered)}
                    label={`${a.name}, ${formatMoney(a.balance_cents, a.currency)}. Edit`}
                  >
                    <Pebble kind={g.kind} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[T.bodyStrong, { color: c.text }]} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={[T.small, { color: c.textMuted }]} numberOfLines={1}>
                        {a.link
                          ? a.change_count > 0
                            ? `${formatMoney(a.change_cents, a.currency, 'always')} from statements since ${shortDate(a.updated_at, false)}`
                            : `Auto-updates from ${linkLabel(a.link)?.split(' (')[0]} since ${shortDate(a.updated_at, false)}`
                          : `Typed in on ${shortDate(a.updated_at)}`}
                      </Text>
                    </View>
                    <Text style={[styles.amount, { color: c.text }]}>{formatMoney(a.balance_cents, a.currency)}</Text>
                  </HoverRow>
                ))}
              </View>
            ))}
          <View style={[styles.totalRow, { borderTopColor: c.hairline }]}>
            <Text style={[T.bodyStrong, { color: c.text }]}>Overall total</Text>
            <Text style={[T.number, { fontSize: 22, lineHeight: 28, color: c.text, fontVariant: ['tabular-nums'] }]}>{formatMoney(total, currency)}</Text>
          </View>
        </View>
      )}
    </Panel>
  );

  const comingPanel = (
    <Panel title="Coming up" subtitle="Planned for the next 30 days" style={{ flex: 1 }}>
      {coming.length === 0 ? (
        <Text style={[T.body, { color: c.textSecondary }]}>Nothing planned in the next 30 days.</Text>
      ) : (
        <View style={{ gap: 2 }}>
          {coming.slice(0, 7).map((o) => (
            <HoverRow key={`${o.plan.id}-${o.date}`} onPress={() => editPlan(o.plan)} label={`${o.plan.description}, ${dayLabel(o.date)}. Edit plan`}>
              <View style={[styles.dateTile, { backgroundColor: o.plan.kind === 'income' ? c.accentSoft : c.cardSunk }]}>
                <Text style={{ fontFamily: fonts.display[700], fontSize: 17, lineHeight: 19, color: o.plan.kind === 'income' ? c.primary : c.text }}>
                  {Number(o.date.slice(8, 10))}
                </Text>
                <Text style={{ fontFamily: fonts.ui[500], fontSize: 10, lineHeight: 12, color: c.textMuted }}>{monthLabel(o.date.slice(0, 7), true)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[T.bodyStrong, { color: c.text }]} numberOfLines={1}>
                  {o.plan.description}
                </Text>
                <Text style={[T.small, { color: c.textMuted }]}>{dayLabel(o.date)}</Text>
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
      subtitle={budgets.length ? `${monthLabel(thisMonth)}, ${budgets.length - overBudget} of ${budgets.length} within budget` : undefined}
      style={{ flex: 1 }}
      right={<SmallAction label="Add" icon="add" onPress={() => setBudgetSheet({ open: true, budget: null })} />}
    >
      {budgets.length === 0 ? (
        <Text style={[T.body, { color: c.textSecondary }]}>
          Set a monthly limit for categories like groceries or eating out to keep an eye on day-to-day spending.
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          {budgets.map((b, i) => {
            const used = spentMap.get(b.category) ?? 0;
            const over = used > b.limit_cents;
            const info = getCategory(b.category);
            return (
              <Press
                key={b.category}
                feedback="soft"
                onPress={() => setBudgetSheet({ open: true, budget: b })}
                accessibilityRole="button"
                accessibilityLabel={`${info.label}: ${formatMoney(used, currency)} of ${formatMoney(b.limit_cents, currency)}${over ? ', over budget' : ''}. Edit budget`}
                style={({ hovered }) => [styles.budgetRow, hovered && { backgroundColor: c.hover }]}
              >
                <View style={styles.between}>
                  <View style={styles.inline}>
                    <CategoryIcon icon={info.icon as IconName} />
                    <Text style={[T.bodyStrong, { color: c.text }]}>{info.label}</Text>
                  </View>
                  <Text style={[T.label, { color: c.text, fontVariant: ['tabular-nums'] }]}>
                    {formatMoney(used, currency)} <Text style={{ color: c.textMuted, fontFamily: fonts.ui[400] }}>of {formatMoney(b.limit_cents, currency)}</Text>
                  </Text>
                </View>
                <BeadRope value={used / b.limit_cents} animate={first && !reduced} delay={300 + i * 60} beads={isWide ? 24 : 18} />
                {over ? (
                  <View style={styles.inline}>
                    <Icon name="alert-circle" size={14} color={c.danger} />
                    <Text style={[T.small, { color: c.text }]}>Over by {formatMoney(used - b.limit_cents, currency)}</Text>
                  </View>
                ) : null}
              </Press>
            );
          })}
          <Press
            feedback="soft"
            onPress={openMonthly}
            accessibilityRole="link"
            style={({ hovered }) => [styles.linkRow, hovered && { backgroundColor: c.hover }]}
          >
            <Text style={[T.label, { color: c.primary, fontFamily: fonts.ui[600] }]}>See all of {monthLabel(thisMonth).split(' ')[0]}</Text>
            <Icon name="arrow-forward" size={15} color={c.primary} weight="bold" />
          </Press>
        </View>
      )}
    </Panel>
  );

  const plansPanel = (
    <Panel
      title="Plans"
      subtitle={plans.length ? `Per month on average: ${formatMoney(monthlyIn, currency, 'always')} in, ${formatMoney(-monthlyOut, currency)} out` : undefined}
      style={{ flex: 1 }}
      padded={!isWide}
      right={
        <View style={styles.inline}>
          <SmallAction label="Income" icon="add" onPress={() => addPlan('income')} />
          <SmallAction label="Expense" icon="add" onPress={() => addPlan('expense')} />
        </View>
      }
    >
      {plans.length === 0 ? (
        <Text style={[T.body, { color: c.textSecondary }, isWide && { paddingHorizontal: 24 }]}>
          Add recurring income and expenses (salary, rent, subscriptions) and one-off plans (a trip, a new laptop).
        </Text>
      ) : isWide ? (
        <PlansTable plans={plans} currency={currency} onEdit={editPlan} />
      ) : (
        <View style={{ gap: space.sm }}>
          <PlanGroup title="Income" plans={incomePlans} currency={currency} onEdit={editPlan} />
          <PlanGroup title="Expenses" plans={expensePlans} currency={currency} onEdit={editPlan} />
        </View>
      )}
    </Panel>
  );

  const owedToMe = debts.filter((d) => d.direction === 'owed_to_me');
  const iOwe = debts.filter((d) => d.direction === 'i_owe');
  const debtsPanel = (
    <Panel
      title="Debts"
      subtitle="Not counted in your total or forecast"
      style={{ flex: 1 }}
      right={<SmallAction label="Add" icon="add" onPress={() => setDebtSheet({ open: true, debt: null })} />}
    >
      {debts.length === 0 ? (
        <Text style={[T.body, { color: c.textSecondary }]}>Keep track of money people owe you, or that you owe.</Text>
      ) : (
        <View style={{ gap: space.lg }}>
          {[
            { title: 'Owed to you', list: owedToMe, tint: c.accentSoft, ink: c.primary },
            { title: 'You owe', list: iOwe, tint: c.sunSoft, ink: c.text },
          ]
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <View key={g.title} style={{ gap: 2 }}>
                <View style={[styles.between, { paddingHorizontal: 8, marginBottom: 2 }]}>
                  <Text style={[T.label, { color: c.textMuted }]}>{g.title}</Text>
                  <Text style={[T.label, { color: c.textSecondary, fontVariant: ['tabular-nums'] }]}>
                    {formatMoney(g.list.reduce((s, d) => s + d.amount_cents, 0), currency)}
                  </Text>
                </View>
                {g.list.map((d) => (
                  <HoverRow key={d.id} onPress={() => setDebtSheet({ open: true, debt: d })} label={`${d.person}, ${formatMoney(d.amount_cents, currency)}. Edit`}>
                    <View style={[styles.avatar, { backgroundColor: g.tint }]}>
                      <Text style={{ fontFamily: fonts.display[700], fontSize: 16, color: g.ink }}>{d.person.slice(0, 1).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[T.bodyStrong, { color: c.text }]} numberOfLines={1}>
                        {d.person}
                      </Text>
                      {d.note ? (
                        <Text style={[T.small, { color: c.textMuted }]} numberOfLines={1}>
                          {d.note}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.amount, { color: c.text }]}>{formatMoney(d.amount_cents, currency)}</Text>
                  </HoverRow>
                ))}
              </View>
            ))}
        </View>
      )}
    </Panel>
  );

  return (
    <Page>
      <View style={stagger(0)}>
        <PoolHero
          accounts={accounts}
          total={total}
          current={current}
          savings={savings}
          expectedCents={lastForecast.end_balance_cents}
          expectedMonth={lastForecast.month}
          currency={currency}
          mood={mood}
          intro={first && loaded}
          onOpenAccount={(a) => setAccountSheet({ open: true, account: a })}
          onAddAccount={() => setAccountSheet({ open: true, account: null })}
        />
      </View>

      <View style={stagger(1)}>
        <Columns weights={[7, 5]} breakpoint="wide">
          {forecastPanel}
          {accountsPanel}
        </Columns>
      </View>

      <View style={stagger(2)}>
        <Columns weights={[5, 7]} breakpoint="wide">
          {comingPanel}
          {budgetsPanel}
        </Columns>
      </View>

      <View style={stagger(3)}>
        <Columns weights={[8, 4]} breakpoint="wide">
          {plansPanel}
          {debtsPanel}
        </Columns>
      </View>

      <AccountSheet
        visible={accountSheet.open}
        account={accountSheet.account}
        largestCents={Math.max(0, ...accounts.map((a) => a.balance_cents))}
        onClose={() => setAccountSheet((s) => ({ ...s, open: false }))}
      />
      <PlanSheet
        visible={planSheet.open}
        plan={planSheet.plan}
        defaultKind={planSheet.kind}
        onClose={() => setPlanSheet((s) => ({ ...s, open: false }))}
      />
      <DebtSheet visible={debtSheet.open} debt={debtSheet.debt} onClose={() => setDebtSheet((s) => ({ ...s, open: false }))} />
      <BudgetSheet
        visible={budgetSheet.open}
        category={budgetSheet.budget?.category ?? null}
        limitCents={budgetSheet.budget?.limit_cents ?? null}
        spentCents={budgetSheet.budget ? spentMap.get(budgetSheet.budget.category) ?? 0 : 0}
        spentByCategory={spentMap}
        onClose={() => setBudgetSheet((s) => ({ ...s, open: false }))}
      />
    </Page>
  );
}

// ---------- Pieces ----------

/** The small stone or sea glass an account's otter holds, echoed in the list. */
function Pebble({ kind }: { kind: 'current' | 'savings' }) {
  const c = useColors();
  return (
    <View style={[styles.pebbleTile, { backgroundColor: kind === 'savings' ? 'rgba(63,212,245,0.14)' : c.cardSunk }]}>
      <View
        style={[
          styles.pebble,
          kind === 'savings'
            ? { backgroundColor: '#5FCFD0', boxShadow: 'inset -2px -3px 0 rgba(20,90,110,0.35), inset 2px 2px 0 rgba(255,255,255,0.55)' }
            : { backgroundColor: '#CDB186', boxShadow: 'inset -2px -3px 0 rgba(90,60,30,0.3), inset 2px 2px 0 rgba(255,255,255,0.5)' },
        ]}
      />
    </View>
  );
}

function CategoryIcon({ icon }: { icon: IconName }) {
  const c = useColors();
  return (
    <View style={[styles.catIcon, { backgroundColor: c.track }]}>
      <Icon name={icon} size={17} color={c.primary} weight="duotone" duotoneColor={c.primary} />
    </View>
  );
}

/** Desktop: plans as a table. */
function PlansTable({ plans, currency, onEdit }: { plans: Plan[]; currency: string; onEdit: (p: Plan) => void }) {
  const c = useColors();
  return (
    <View>
      <View style={[styles.tr, styles.th, { borderBottomColor: c.hairline }]}>
        <Text style={[styles.thText, { color: c.textMuted, flex: 2.2 }]}>Description</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 1 }]}>Type</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 2 }]}>Schedule</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 1.3 }]}>Category</Text>
        <Text style={[styles.thText, { color: c.textMuted, flex: 1.1, textAlign: 'right' }]}>Amount</Text>
      </View>
      {plans.map((p) => (
        <Press
          key={p.id}
          feedback="none"
          onPress={() => onEdit(p)}
          accessibilityRole="button"
          accessibilityLabel={`${p.description}, ${frequencyLabel(p)}. Edit plan`}
          style={({ hovered }) => [styles.tr, { borderBottomColor: c.hairline }, hovered && { backgroundColor: c.hover }]}
        >
          <Text style={[styles.td, { color: c.text, flex: 2.2, fontFamily: fonts.ui[500] }]} numberOfLines={1}>
            {p.description}
          </Text>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <View style={[styles.tag, { backgroundColor: p.kind === 'income' ? c.accentSoft : c.cardSunk }]}>
              <Text style={{ fontFamily: fonts.ui[500], fontSize: 12, color: p.kind === 'income' ? c.primary : c.textSecondary }}>{p.kind === 'income' ? 'Income' : 'Expense'}</Text>
            </View>
          </View>
          <Text style={[styles.td, { color: c.textSecondary, flex: 2 }]} numberOfLines={1}>
            {frequencyLabel(p)}
          </Text>
          <Text style={[styles.td, { color: c.textSecondary, flex: 1.3 }]} numberOfLines={1}>
            {p.kind === 'income' ? '-' : getCategory(p.category).label}
          </Text>
          <View style={{ flex: 1.1, alignItems: 'flex-end' }}>
            <PlanAmount plan={p} currency={currency} />
          </View>
        </Press>
      ))}
    </View>
  );
}

/** A list row with a hover tint on the web. */
function HoverRow({
  children,
  onPress,
  onHover,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  onHover?: (on: boolean) => void;
  label?: string;
}) {
  const c = useColors();
  return (
    <Press
      feedback="soft"
      onPress={onPress}
      onHoverIn={onHover ? () => onHover(true) : undefined}
      onHoverOut={onHover ? () => onHover(false) : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ hovered }) => [styles.listRow, hovered && { backgroundColor: c.hover }]}
    >
      {children}
    </Press>
  );
}

function DetailLine({ label, cents, currency, sign }: { label: string; cents: number; currency: string; sign: '+' | '-' }) {
  const c = useColors();
  return (
    <View style={styles.between}>
      <Text style={[T.label, { fontSize: 14, color: c.textSecondary, fontFamily: fonts.ui[400] }]}>{label}</Text>
      <Text style={[T.label, { fontSize: 14, color: c.text, fontVariant: ['tabular-nums'] }]}>
        {cents === 0 ? formatMoney(0, currency) : `${sign}${formatMoney(cents, currency)}`}
      </Text>
    </View>
  );
}

function PlanAmount({ plan, currency }: { plan: Plan; currency: string }) {
  const c = useColors();
  const income = plan.kind === 'income';
  return (
    <Text style={[styles.amount, { color: income ? c.positive : c.text }]}>{formatMoney(income ? plan.amount_cents : -plan.amount_cents, currency, 'always')}</Text>
  );
}

function PlanGroup({ title, plans, currency, onEdit }: { title: string; plans: Plan[]; currency: string; onEdit: (p: Plan) => void }) {
  const c = useColors();
  if (plans.length === 0) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={[T.label, { color: c.textMuted, paddingHorizontal: 8, marginTop: space.xs }]}>{title}</Text>
      {plans.map((p) => (
        <HoverRow key={p.id} onPress={() => onEdit(p)} label={`${p.description}. Edit plan`}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[T.bodyStrong, { color: c.text }]} numberOfLines={1}>
              {p.description}
            </Text>
            <Text style={[T.small, { color: c.textMuted }]} numberOfLines={1}>
              {frequencyLabel(p)}
              {p.kind === 'expense' ? `, ${getCategory(p.category).label}` : ''}
            </Text>
          </View>
          <PlanAmount plan={p} currency={currency} />
        </HoverRow>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  detail: { borderRadius: radius.md, padding: space.lg, gap: 8 },
  hr: { height: 1, marginVertical: 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.sm },
  amount: { fontFamily: fonts.ui[600], fontSize: 15, fontVariant: ['tabular-nums'] },
  dateTile: { width: 46, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  pebbleTile: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  pebble: { width: 20, height: 15, borderRadius: 8 },
  catIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  budgetRow: { gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.pill, marginTop: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: space.lg, paddingHorizontal: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: 24, borderBottomWidth: 1 },
  th: { paddingVertical: 8 },
  thText: { fontFamily: fonts.ui[500], fontSize: 12, letterSpacing: 0.2 },
  td: { fontFamily: fonts.ui[400], fontSize: 14 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
});
