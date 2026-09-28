/**
 * Planning maths: when planned items happen, and how your balance is expected
 * to develop over the coming months.
 *
 * Forecast = total of your accounts today
 *          + planned income
 *          − planned expenses
 *          − what's left of your monthly budgets (expected day-to-day spending)
 *
 * It only knows what you tell it, so it is an estimate, not a prediction.
 */
import type { Budget, Plan } from '../db/types';
import { ordinal, shiftMonth, shortDate } from './dates';

export type Occurrence = { date: string; plan: Plan };

export type ForecastMonth = {
  month: string; // "YYYY-MM"
  income_cents: number;
  expense_cents: number; // planned expenses (positive number)
  budget_cents: number; // expected budgeted spending still to come (positive number)
  net_cents: number;
  end_balance_cents: number;
};

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Date for day `day` in month y/m, clamped to the month's length (e.g. the 31st → Feb 28). */
function dateIn(y: number, m: number, day: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** All dates between `from` and `to` (inclusive, "YYYY-MM-DD") on which a plan happens. */
export function occurrences(plan: Plan, from: string, to: string): string[] {
  const start = plan.start_date.slice(0, 10);
  const last = plan.end_date && plan.end_date < to ? plan.end_date.slice(0, 10) : to;
  const lower = start > from ? start : from;
  if (lower > last) return [];

  if (plan.frequency === 'once') return start >= from && start <= to ? [start] : [];

  const [sy, sm, sd] = start.split('-').map(Number);
  const dates: string[] = [];
  let key = lower.slice(0, 7);
  const endKey = last.slice(0, 7);
  while (key <= endKey) {
    const [y, m] = key.split('-').map(Number);
    if (plan.frequency === 'monthly' || m === sm) {
      const d = dateIn(y, m, sd);
      if (d >= lower && d <= last && d >= start) dates.push(d);
    }
    key = shiftMonth(key, 1);
    if (y > sy + 200) break; // safety
  }
  return dates;
}

/** Planned items in the next `days` days, including today, sorted by date. */
export function upcoming(plans: Plan[], today: string, days = 30): Occurrence[] {
  const [y, m, d] = today.split('-').map(Number);
  const endDate = new Date(Date.UTC(y, m - 1, d + days - 1));
  const to = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}`;
  return plans
    .flatMap((plan) => occurrences(plan, today, to).map((date) => ({ date, plan })))
    .sort((a, b) => (a.date === b.date ? a.plan.description.localeCompare(b.plan.description) : a.date < b.date ? -1 : 1));
}

/** Monthly amount of a plan, averaged (yearly ÷ 12, one-off = 0). */
export function monthlyEquivalent(plan: Plan): number {
  if (plan.frequency === 'monthly') return plan.amount_cents;
  if (plan.frequency === 'yearly') return Math.round(plan.amount_cents / 12);
  return 0;
}

export function buildForecast(input: {
  startBalanceCents: number;
  plans: Plan[];
  budgets: Budget[];
  /** Spending so far this month per category (positive cents), to know what's left of each budget */
  spentThisMonth: Map<string, number>;
  today: string; // "YYYY-MM-DD"
  months?: number;
}): ForecastMonth[] {
  const count = input.months ?? 6;
  const thisMonth = input.today.slice(0, 7);
  const monthlyBudget = input.budgets.reduce((s, b) => s + b.limit_cents, 0);
  const budgetLeftThisMonth = input.budgets.reduce(
    (s, b) => s + Math.max(0, b.limit_cents - (input.spentThisMonth.get(b.category) ?? 0)),
    0,
  );

  let balance = input.startBalanceCents;
  const rows: ForecastMonth[] = [];
  for (let i = 0; i < count; i++) {
    const month = shiftMonth(thisMonth, i);
    const [y, m] = month.split('-').map(Number);
    const from = i === 0 ? input.today : `${month}-01`;
    const to = `${month}-${pad(daysInMonth(y, m))}`;

    let income = 0;
    let expense = 0;
    for (const plan of input.plans) {
      const n = occurrences(plan, from, to).length;
      if (plan.kind === 'income') income += n * plan.amount_cents;
      else expense += n * plan.amount_cents;
    }
    const budget = i === 0 ? budgetLeftThisMonth : monthlyBudget;
    const net = income - expense - budget;
    balance += net;
    rows.push({ month, income_cents: income, expense_cents: expense, budget_cents: budget, net_cents: net, end_balance_cents: balance });
  }
  return rows;
}

/** "Every month on the 1st", "Every year on 5 Nov", "Once on 20 Dec 2026" */
export function frequencyLabel(plan: Plan): string {
  const day = Number(plan.start_date.slice(8, 10));
  const until = plan.end_date ? ` until ${shortDate(plan.end_date)}` : '';
  if (plan.frequency === 'monthly') return `Every month on the ${ordinal(day)}${until}`;
  if (plan.frequency === 'yearly') return `Every year on ${shortDate(plan.start_date, false)}${until}`;
  return `Once on ${shortDate(plan.start_date)}`;
}
