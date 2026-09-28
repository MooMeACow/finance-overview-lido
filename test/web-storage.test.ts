import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Minimal localStorage for Node
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import { toTable } from '../src/lib/csv.ts';
import { parseIng, parseRevolut } from '../src/lib/importers.ts';
import * as db from '../src/db/database.web.ts';

const csv = readFileSync(new URL('./fixtures/revolut-sample.csv', import.meta.url), 'utf8');
const parsed = () => parseRevolut(toTable(csv)).txns;

beforeEach(async () => {
  await db.deleteAllData(null);
});

test('web storage: import, dedupe, totals', async () => {
  assert.equal(await db.importTransactions(null, 'a.csv', 'revolut', parsed()), 25);
  assert.equal(await db.importTransactions(null, 'a.csv', 'revolut', parsed()), 0, 're-import adds nothing');
  assert.equal(await db.countExisting(null, parsed().map((t) => t.hash)), 25);
  assert.equal((await db.getImports(null)).length, 1);

  // Top-ups (€1,050) and Digital Assets transfers (€2.92) move money between own accounts: not counted
  const [aug, sep] = await db.getMonthTotals(null, '2026-09', 2);
  assert.deepEqual(sep, { month: '2026-09', in_cents: 0, out_cents: 65246 - 292 });
  assert.deepEqual(aug, { month: '2026-08', in_cents: 0, out_cents: 1000 });

  const cats = await db.getCategoryTotals(null, '2026-09');
  assert.equal(cats[0].category, 'transfers');
  assert.equal(cats.reduce((s, c) => s + c.out_cents, 0), 65246 - 292);

  assert.equal(await db.getLatestMonth(null), '2026-09');
  assert.equal(await db.getMainCurrency(null), 'EUR');
});

test('web storage: filters, edits, rules, excluded, delete', async () => {
  await db.importTransactions(null, 'a.csv', 'revolut', parsed());

  const outOnly = await db.getTransactions(null, '2026-09', { direction: 'out' });
  assert.ok(outOnly.every((t) => t.amount_cents < 0));
  const all = await db.getTransactions(null, '2026-09');
  assert.ok(all[0].date >= all[all.length - 1].date, 'newest first');

  const tripper = await db.getTransactions(null, '2026-09', { search: 'tripper' });
  assert.equal(tripper.length, 2);

  // Recategorize all Tripper payments and remember the rule
  assert.equal(await db.applyCategoryToSimilar(null, 'To Tripper B.V.', 'transport'), 2);
  assert.equal((await db.getRules(null)).get('to tripper b.v.'), 'transport');
  assert.equal((await db.getTransactions(null, '2026-09', { category: 'transport' })).length, 2);

  // Top-ups start out not counted; count one of them again
  const topup = all.find((t) => t.amount_cents === 83000)!;
  assert.equal(topup.excluded, 1);
  await db.updateTransaction(null, topup.id, { category: 'topup', note: 'from ING', excluded: false });
  const [sep] = await db.getMonthTotals(null, '2026-09', 1);
  assert.equal(sep.in_cents, 83000);
  assert.equal((await db.getTransactions(null, '2026-09', { search: 'from ing' })).length, 1);

  // Manual entry, then delete it
  await db.addManualTransaction(null, { date: '2026-09-28 12:00:00', description: 'Market', amountCents: -1250, currency: 'EUR', category: 'groceries' });
  const market = (await db.getTransactions(null, '2026-09', { search: 'market' }))[0];
  assert.equal(market.source, 'manual');
  await db.deleteTransaction(null, market.id);
  assert.equal((await db.getTransactions(null, '2026-09', { search: 'market' })).length, 0);

  // Undo the import
  const [imp] = await db.getImports(null);
  await db.deleteImport(null, imp.id);
  assert.equal((await db.getTransactions(null, '2026-09')).length, 0);
});

test('web storage: ING and Revolut together', async () => {
  const ing = parseIng(toTable(readFileSync(new URL('./fixtures/ing-sample.csv', import.meta.url), 'utf8'))).txns;
  assert.equal(await db.importTransactions(null, 'ing.csv', 'ing', ing), 64);
  assert.equal(await db.importTransactions(null, 'revolut.csv', 'revolut', parsed()), 25);
  const [sep] = await db.getMonthTotals(null, '2026-09', 1);
  // ING salary + allowances + refund in; ING spending + Revolut spending out; no own transfers
  assert.equal(sep.in_cents, 280716 + 2 + 18600 + 11900);
  assert.equal(sep.out_cents, 250300 + (65246 - 292));
  assert.equal((await db.getImports(null)).length, 2);
});

test('web storage: survives a reload', async () => {
  await db.importTransactions(null, 'a.csv', 'revolut', parsed());
  const saved = JSON.parse(store.get('finance-overview:v1')!);
  assert.equal(saved.transactions.length, 25);
});

test('web storage: accounts, plans, budgets', async () => {
  await db.saveAccount(null, { name: 'Revolut', balanceCents: 40952, currency: 'EUR' });
  await db.saveAccount(null, { name: 'Savings', balanceCents: 100000, currency: 'EUR' });
  let accounts = await db.getAccounts(null);
  assert.deepEqual(accounts.map((a) => [a.name, a.balance_cents]), [['Revolut', 40952], ['Savings', 100000]]);
  await db.saveAccount(null, { id: accounts[0].id, name: 'Revolut', balanceCents: 50000, currency: 'EUR' });
  await db.deleteAccount(null, accounts[1].id);
  accounts = await db.getAccounts(null);
  assert.deepEqual(accounts.map((a) => a.balance_cents), [50000]);

  const base = { category: 'housing', frequency: 'monthly' as const, start_date: '2026-10-01', end_date: null };
  await db.savePlan(null, { ...base, kind: 'expense', description: 'Rent', amount_cents: 80000 });
  await db.savePlan(null, { ...base, kind: 'income', description: 'Salary', amount_cents: 250000, category: 'income' });
  let plans = await db.getPlans(null);
  assert.deepEqual(plans.map((p) => p.description), ['Salary', 'Rent']);
  await db.savePlan(null, { ...plans[1], amount_cents: 85000 });
  await db.deletePlan(null, plans[0].id);
  plans = await db.getPlans(null);
  assert.deepEqual(plans.map((p) => [p.description, p.amount_cents]), [['Rent', 85000]]);

  await db.setBudget(null, 'groceries', 30000);
  await db.setBudget(null, 'groceries', 35000);
  await db.setBudget(null, 'eating_out', 10000);
  assert.deepEqual(await db.getBudgets(null), [{ category: 'groceries', limit_cents: 35000 }, { category: 'eating_out', limit_cents: 10000 }]);
  await db.setBudget(null, 'eating_out', null);
  assert.equal((await db.getBudgets(null)).length, 1);

  await db.deleteAllData(null);
  assert.equal((await db.getAccounts(null)).length, 0);
});

test('web storage: data saved by the previous version still loads', async () => {
  store.set('finance-overview:v1', JSON.stringify({ transactions: [], imports: [], rules: {}, nextTxnId: 1, nextImportId: 1 }));
  // Force a fresh load from storage by re-importing the module under a new URL
  const fresh = await import('../src/db/database.web.ts?reload=' + Date.now());
  assert.deepEqual(await fresh.getAccounts(null), []);
  await fresh.saveAccount(null, { name: 'Cash', balanceCents: 2000, currency: 'EUR' });
  assert.equal((await fresh.getAccounts(null))[0].id, 1);
});

test('web storage: imported statements list with period, counts, delete', async () => {
  const ing = parseIng(toTable(readFileSync(new URL('./fixtures/ing-sample.csv', import.meta.url), 'utf8'))).txns;
  await db.importTransactions(null, 'ing.csv', 'ing', ing);
  await db.importTransactions(null, 'revolut.csv', 'revolut', parsed());
  const list = await db.getImports(null);
  assert.deepEqual(
    list.map((i) => [i.file_name, i.source, i.txn_count, i.first_date?.slice(0, 10), i.last_date?.slice(0, 10)]),
    [
      ['revolut.csv', 'revolut', 25, '2026-08-30', '2026-09-24'],
      ['ing.csv', 'ing', 64, '2026-09-01', '2026-09-23'],
    ],
  );
  assert.equal(list[0].counted_in_cents, 0);
  await db.deleteImport(null, list[0].id);
  const after = await db.getImports(null);
  assert.deepEqual(after.map((i) => i.file_name), ['ing.csv']);
  assert.equal((await db.getTransactions(null, '2026-09', { search: 'tripper' })).length, 0);
});
