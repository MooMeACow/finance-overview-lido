/**
 * "Plans file": a small JSON file with plans, budgets and debts, used to move
 * your setup into the app in one go (for example from an old spreadsheet).
 *
 * {
 *   "format": "finance-overview-setup",
 *   "version": 1,
 *   "plans":   [{ "kind": "expense", "description": "Rent", "amount": 776, "category": "housing",
 *                 "frequency": "monthly", "start_date": "2026-10-01", "end_date": null }],
 *   "budgets": [{ "category": "groceries", "amount": 350 }],
 *   "debts":   [{ "person": "Sam", "direction": "owed_to_me", "amount": 430, "note": "₱30,000" }]
 * }
 *
 * Amounts are in euros (or your main currency), not cents.
 */
import type { Budget, Debt, Plan } from '../db/types';
import { CATEGORIES } from './categories';
import { isValidDay } from './dates';

export const SETUP_FORMAT = 'finance-overview-setup';

export type SetupPlan = Omit<Plan, 'id'>;
export type SetupDebt = Pick<Debt, 'person' | 'direction' | 'amount_cents' | 'note'>;
export type Setup = { plans: SetupPlan[]; budgets: Budget[]; debts: SetupDebt[] };

const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));
const toCents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : NaN);

/** True if the text looks like a plans file (cheap check before full validation). */
export function isSetupFile(text: string): boolean {
  try {
    return JSON.parse(text)?.format === SETUP_FORMAT;
  } catch {
    return false;
  }
}

/** Parses and validates a plans file. Throws an Error with a readable message if something is wrong. */
export function parseSetupFile(text: string): Setup {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (raw?.format !== SETUP_FORMAT) throw new Error('This is not a Finance Overview plans file.');
  if (raw.version !== 1) throw new Error(`Unsupported plans file version: ${raw.version}`);

  const problems: string[] = [];

  const plans: SetupPlan[] = (raw.plans ?? []).map((p: any, i: number) => {
    const where = `Plan ${i + 1} (${p?.description ?? 'no description'})`;
    const amount = toCents(p?.amount);
    if (p?.kind !== 'expense' && p?.kind !== 'income') problems.push(`${where}: kind must be "expense" or "income"`);
    if (!p?.description) problems.push(`${where}: description is missing`);
    if (!(amount > 0)) problems.push(`${where}: amount must be a positive number`);
    if (!['monthly', 'yearly', 'once'].includes(p?.frequency)) problems.push(`${where}: frequency must be monthly, yearly or once`);
    if (!isValidDay(String(p?.start_date ?? ''))) problems.push(`${where}: start_date must be YYYY-MM-DD`);
    if (p?.end_date != null && !isValidDay(String(p.end_date))) problems.push(`${where}: end_date must be YYYY-MM-DD or null`);
    return {
      kind: p?.kind,
      description: String(p?.description ?? '').trim(),
      amount_cents: amount,
      category: CATEGORY_KEYS.has(p?.category) ? p.category : p?.kind === 'income' ? 'income' : 'other',
      frequency: p?.frequency,
      start_date: String(p?.start_date ?? ''),
      end_date: p?.end_date ?? null,
    };
  });

  const budgets: Budget[] = (raw.budgets ?? []).map((b: any, i: number) => {
    const amount = toCents(b?.amount);
    if (!CATEGORY_KEYS.has(b?.category)) problems.push(`Budget ${i + 1}: unknown category "${b?.category}"`);
    if (!(amount > 0)) problems.push(`Budget ${i + 1}: amount must be a positive number`);
    return { category: b?.category, limit_cents: amount };
  });

  const debts: SetupDebt[] = (raw.debts ?? []).map((d: any, i: number) => {
    const amount = toCents(d?.amount);
    if (!d?.person) problems.push(`Debt ${i + 1}: person is missing`);
    if (d?.direction !== 'owed_to_me' && d?.direction !== 'i_owe') problems.push(`Debt ${i + 1}: direction must be "owed_to_me" or "i_owe"`);
    if (!(amount > 0)) problems.push(`Debt ${i + 1}: amount must be a positive number`);
    return { person: String(d?.person ?? '').trim(), direction: d?.direction, amount_cents: amount, note: d?.note ? String(d.note) : null };
  });

  if (problems.length) throw new Error(problems.slice(0, 5).join('\n') + (problems.length > 5 ? `\n…and ${problems.length - 5} more` : ''));
  return { plans, budgets, debts };
}

const planKey = (p: SetupPlan | Plan) =>
  [p.kind, p.description.trim().toLowerCase(), p.amount_cents, p.frequency, p.start_date, p.end_date ?? ''].join('|');
const debtKey = (d: SetupDebt | Debt) => [d.person.trim().toLowerCase(), d.direction].join('|');

/**
 * Works out what importing would add, so importing the same file twice
 * doesn't create duplicates. Budgets are simply set (replacing the old limit);
 * a debt for the same person and direction is left as it is.
 */
export function planSetupImport(existing: { plans: Plan[]; debts: Debt[] }, setup: Setup) {
  const havePlans = new Set(existing.plans.map(planKey));
  const haveDebts = new Set(existing.debts.map(debtKey));
  const plans = setup.plans.filter((p) => !havePlans.has(planKey(p)));
  const debts = setup.debts.filter((d) => !haveDebts.has(debtKey(d)));
  return {
    plans,
    budgets: setup.budgets,
    debts,
    skipped: setup.plans.length - plans.length + (setup.debts.length - debts.length),
  };
}
