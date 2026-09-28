/**
 * Browser storage for the web version (localStorage).
 * Same functions and behaviour as database.ts (SQLite), which the phone apps use.
 * Data lives only in the browser it was entered in; it is never uploaded.
 */
import type { ParsedTxn } from '../lib/importers';
import { shiftMonth } from '../lib/dates';
import type { Txn, ImportRecord, ImportSummary, MonthTotals, CategoryTotal, Account, Plan, Budget } from './types';

export type { Txn, ImportRecord, ImportSummary, MonthTotals, CategoryTotal, Account, Plan, Budget, PlanFrequency } from './types';

/** Handle passed to every function; unused on web. */
export type Db = unknown;

export const DATABASE_NAME = 'finance.db';
const STORAGE_KEY = 'finance-overview:v1';

type StoredTxn = Txn & { hash: string | null };

type Data = {
  transactions: StoredTxn[];
  imports: ImportRecord[];
  rules: Record<string, string>;
  accounts: Account[];
  plans: Plan[];
  budgets: Budget[];
  nextTxnId: number;
  nextImportId: number;
  nextAccountId: number;
  nextPlanId: number;
};

const empty = (): Data => ({
  transactions: [],
  imports: [],
  rules: {},
  accounts: [],
  plans: [],
  budgets: [],
  nextTxnId: 1,
  nextImportId: 1,
  nextAccountId: 1,
  nextPlanId: 1,
});

let cache: Data | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // e.g. blocked by browser privacy settings
  }
}

function load(): Data {
  if (cache) return cache;
  let data = empty();
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (raw) data = { ...empty(), ...JSON.parse(raw) };
  } catch {
    // Unreadable data: start fresh rather than crash
  }
  cache = data;
  return data;
}

function save(data: Data): void {
  cache = data;
  const s = storage();
  if (!s) throw new Error('This browser does not allow saving data (private mode or blocked storage).');
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    throw new Error('Could not save: the browser storage is full or blocked.');
  }
}

function nowString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const publicTxn = ({ hash: _hash, ...t }: StoredTxn): Txn => t;
const monthOf = (t: { date: string }) => t.date.slice(0, 7);
const counted = (t: Txn) => t.excluded === 0;

export async function migrate(_db?: Db): Promise<void> {
  load();
}

// ---------- Reading ----------

export async function getRules(_db: Db): Promise<Map<string, string>> {
  return new Map(Object.entries(load().rules));
}

export async function getMonthTotals(_db: Db, endMonth: string, count: number): Promise<MonthTotals[]> {
  const start = shiftMonth(endMonth, -(count - 1));
  const months = Array.from({ length: count }, (_, i) => shiftMonth(start, i));
  const totals = new Map(months.map((m) => [m, { month: m, in_cents: 0, out_cents: 0 }]));
  for (const t of load().transactions) {
    const row = totals.get(monthOf(t));
    if (!row || !counted(t)) continue;
    if (t.amount_cents > 0) row.in_cents += t.amount_cents;
    else row.out_cents -= t.amount_cents;
  }
  return months.map((m) => totals.get(m)!);
}

export async function getCategoryTotals(_db: Db, month: string): Promise<CategoryTotal[]> {
  const byCat = new Map<string, CategoryTotal>();
  for (const t of load().transactions) {
    if (monthOf(t) !== month || !counted(t) || t.amount_cents >= 0) continue;
    const row = byCat.get(t.category) ?? { category: t.category, out_cents: 0, count: 0 };
    row.out_cents -= t.amount_cents;
    row.count += 1;
    byCat.set(t.category, row);
  }
  return [...byCat.values()].sort((a, b) => b.out_cents - a.out_cents);
}

export async function getTransactions(
  _db: Db,
  month: string,
  opts: { search?: string; direction?: 'all' | 'in' | 'out'; category?: string } = {},
): Promise<Txn[]> {
  const q = opts.search?.trim().toLowerCase();
  return load()
    .transactions.filter((t) => {
      if (monthOf(t) !== month) return false;
      if (q && !t.description.toLowerCase().includes(q) && !(t.note ?? '').toLowerCase().includes(q)) return false;
      if (opts.direction === 'in' && t.amount_cents <= 0) return false;
      if (opts.direction === 'out' && t.amount_cents >= 0) return false;
      if (opts.category && t.category !== opts.category) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .map(publicTxn);
}

export async function getLatestMonth(_db: Db): Promise<string | null> {
  let max = '';
  for (const t of load().transactions) if (t.date > max) max = t.date;
  return max ? max.slice(0, 7) : null;
}

export async function getMainCurrency(_db: Db): Promise<string> {
  const counts = new Map<string, number>();
  for (const t of load().transactions) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
  let best = 'EUR';
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) [best, bestN] = [c, n];
  return best;
}

/** Every imported statement, newest first, with its period and totals. */
export async function getImports(_db: Db): Promise<ImportSummary[]> {
  const data = load();
  return [...data.imports]
    .sort((a, b) => b.id - a.id)
    .map((imp) => {
      const txns = data.transactions.filter((t) => t.import_id === imp.id);
      const dates = txns.map((t) => t.date).sort();
      const counted = txns.filter((t) => t.excluded === 0);
      return {
        ...imp,
        first_date: dates[0] ?? null,
        last_date: dates[dates.length - 1] ?? null,
        txn_count: txns.length,
        counted_in_cents: counted.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0),
        counted_out_cents: counted.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0),
      };
    });
}

export async function countExisting(_db: Db, hashes: string[]): Promise<number> {
  const known = new Set(load().transactions.map((t) => t.hash));
  return hashes.filter((h) => known.has(h)).length;
}

// ---------- Writing ----------

export async function importTransactions(_db: Db, fileName: string, source: string, txns: ParsedTxn[]): Promise<number> {
  const data = load();
  const known = new Set(data.transactions.map((t) => t.hash));
  const importId = data.nextImportId;
  let nextId = data.nextTxnId;
  const added: StoredTxn[] = [];
  for (const t of txns) {
    if (known.has(t.hash)) continue;
    known.add(t.hash);
    added.push({
      id: nextId++,
      date: t.date,
      description: t.description,
      amount_cents: t.amountCents,
      currency: t.currency,
      category: t.category,
      note: null,
      excluded: t.excluded ? 1 : 0,
      source,
      import_id: importId,
      hash: t.hash,
    });
  }
  if (added.length === 0) return 0;
  save({
    ...data,
    transactions: [...data.transactions, ...added],
    imports: [...data.imports, { id: importId, file_name: fileName, source, imported_at: nowString(), row_count: added.length }],
    nextTxnId: nextId,
    nextImportId: importId + 1,
  });
  return added.length;
}

export async function addManualTransaction(
  _db: Db,
  t: { date: string; description: string; amountCents: number; currency: string; category: string; note?: string },
): Promise<void> {
  const data = load();
  const txn: StoredTxn = {
    id: data.nextTxnId,
    date: t.date,
    description: t.description,
    amount_cents: t.amountCents,
    currency: t.currency,
    category: t.category,
    note: t.note ?? null,
    excluded: 0,
    source: 'manual',
    import_id: null,
    hash: null,
  };
  save({ ...data, transactions: [...data.transactions, txn], nextTxnId: data.nextTxnId + 1 });
}

export async function updateTransaction(
  _db: Db,
  id: number,
  patch: { category: string; note: string | null; excluded: boolean },
): Promise<void> {
  const data = load();
  save({
    ...data,
    transactions: data.transactions.map((t) =>
      t.id === id ? { ...t, category: patch.category, note: patch.note, excluded: patch.excluded ? 1 : 0 } : t,
    ),
  });
}

export async function applyCategoryToSimilar(_db: Db, description: string, category: string): Promise<number> {
  const data = load();
  const key = description.trim().toLowerCase();
  let changed = 0;
  const transactions = data.transactions.map((t) => {
    if (t.description.trim().toLowerCase() !== key) return t;
    changed++;
    return { ...t, category };
  });
  save({ ...data, transactions, rules: { ...data.rules, [key]: category } });
  return changed;
}

export async function deleteTransaction(_db: Db, id: number): Promise<void> {
  const data = load();
  save({ ...data, transactions: data.transactions.filter((t) => t.id !== id) });
}

export async function deleteImport(_db: Db, importId: number): Promise<void> {
  const data = load();
  save({
    ...data,
    transactions: data.transactions.filter((t) => t.import_id !== importId),
    imports: data.imports.filter((i) => i.id !== importId),
  });
}

export async function deleteAllData(_db: Db): Promise<void> {
  save(empty());
}

// ---------- Accounts, plans, budgets ----------

export async function getAccounts(_db: Db): Promise<Account[]> {
  return [...load().accounts].sort((a, b) => a.id - b.id);
}

export async function saveAccount(
  _db: Db,
  a: { id?: number; name: string; balanceCents: number; currency: string },
): Promise<void> {
  const data = load();
  const fields = { name: a.name, balance_cents: a.balanceCents, currency: a.currency, updated_at: nowString() };
  if (a.id) {
    save({ ...data, accounts: data.accounts.map((x) => (x.id === a.id ? { ...x, ...fields } : x)) });
  } else {
    save({ ...data, accounts: [...data.accounts, { id: data.nextAccountId, ...fields }], nextAccountId: data.nextAccountId + 1 });
  }
}

export async function deleteAccount(_db: Db, id: number): Promise<void> {
  const data = load();
  save({ ...data, accounts: data.accounts.filter((a) => a.id !== id) });
}

export async function getPlans(_db: Db): Promise<Plan[]> {
  // Same order as SQLite: income first, then by amount (largest first)
  return [...load().plans].sort((a, b) =>
    a.kind === b.kind ? b.amount_cents - a.amount_cents : a.kind === 'income' ? -1 : 1,
  );
}

export async function savePlan(_db: Db, p: Omit<Plan, 'id'> & { id?: number }): Promise<void> {
  const data = load();
  const { id, ...fields } = p;
  if (id) {
    save({ ...data, plans: data.plans.map((x) => (x.id === id ? { ...x, ...fields } : x)) });
  } else {
    save({ ...data, plans: [...data.plans, { id: data.nextPlanId, ...fields }], nextPlanId: data.nextPlanId + 1 });
  }
}

export async function deletePlan(_db: Db, id: number): Promise<void> {
  const data = load();
  save({ ...data, plans: data.plans.filter((p) => p.id !== id) });
}

export async function getBudgets(_db: Db): Promise<Budget[]> {
  return [...load().budgets].sort((a, b) => b.limit_cents - a.limit_cents);
}

export async function setBudget(_db: Db, category: string, limitCents: number | null): Promise<void> {
  const data = load();
  const others = data.budgets.filter((b) => b.category !== category);
  save({ ...data, budgets: limitCents === null ? others : [...others, { category, limit_cents: limitCents }] });
}
