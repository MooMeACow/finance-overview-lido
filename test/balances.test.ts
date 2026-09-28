import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toTable } from '../src/lib/csv.ts';
import { parseIng, parseRevolut } from '../src/lib/importers.ts';
import { liveBalances, earliestLinkedDay } from '../src/lib/balances.ts';
import type { Account } from '../src/db/types.ts';

const asTxns = (source: string, parsed: { date: string; description: string; amountCents: number }[]) =>
  parsed.map((t) => ({ date: t.date, description: t.description, amount_cents: t.amountCents, source }));

const ing = asTxns('ing', parseIng(toTable(readFileSync(new URL('./fixtures/ing-sample.csv', import.meta.url), 'utf8'))).txns);
const revolut = asTxns('revolut', parseRevolut(toTable(readFileSync(new URL('./fixtures/revolut-sample.csv', import.meta.url), 'utf8'))).txns);
const all = [...ing, ...revolut];

const account = (p: Partial<Account>): Account => ({
  id: 1, name: 'x', type: 'current', link: null, balance_cents: 0, currency: 'EUR', updated_at: '2026-09-10 12:00:00', ...p,
});

test('unlinked accounts keep the balance you typed', () => {
  const [a] = liveBalances([account({ balance_cents: 9500 })], all);
  assert.equal(a.balance_cents, 9500);
  assert.equal(a.change_count, 0);
});

test('only transactions after the balance day are added', () => {
  // Balance typed on 23 Sep, the last day in the ING sample: nothing changes
  const [a] = liveBalances([account({ link: 'ing_current', balance_cents: 9500, updated_at: '2026-09-23 21:00:00' })], all);
  assert.equal(a.balance_cents, 9500);
  // Balance typed on 22 Sep: the 23 Sep transactions are added
  const [b] = liveBalances([account({ link: 'ing_current', balance_cents: 9500, updated_at: '2026-09-22 21:00:00' })], all);
  // 23 Sep: +200 from savings, −1000 to savings, +2807.16 salary, −1.50 AH, −2.33 round-up
  assert.equal(b.change_cents, 20000 - 100000 + 280716 - 150 - 233);
  assert.equal(b.balance_cents, 9500 + b.change_cents);
  assert.equal(b.change_count, 5);
});

test('savings and investment transfers move money between ING accounts, total unchanged by them', () => {
  const since = '2026-08-31 12:00:00';
  const accounts = [
    account({ id: 1, link: 'ing_current', balance_cents: 0, updated_at: since }),
    account({ id: 2, type: 'savings', link: 'ing_savings', balance_cents: 0, updated_at: since }),
    account({ id: 3, type: 'savings', link: 'ing_investment', balance_cents: 0, updated_at: since }),
  ];
  const [cur, sav, inv] = liveBalances(accounts, all);
  // Investment: one €100 transfer on 1 Sep
  assert.equal(inv.change_cents, 10000);
  assert.equal(inv.change_count, 1);
  // Savings: €1,010.38 in (transfer + round-ups), €1,700.09 out
  assert.equal(sav.change_cents, 101038 - 170009);
  // Moving between own accounts doesn't change the total: the total change equals
  // everything else in the ING statement (income, spending, top-ups to Revolut)
  const ownIng = ing.filter((t) => /spaarrekening|round-up to savings|^to savings|^from savings|investment account/i.test(t.description));
  const otherIng = ing.filter((t) => !ownIng.includes(t));
  assert.equal(cur.change_cents + sav.change_cents + inv.change_cents, otherIng.reduce((s, t) => s + t.amount_cents, 0));
});

test('Revolut current and crypto', () => {
  const accounts = [
    account({ id: 1, link: 'revolut_current', balance_cents: 0, updated_at: '2026-08-31 12:00:00' }),
    account({ id: 2, type: 'savings', link: 'revolut_crypto', balance_cents: 0, updated_at: '2026-08-31 12:00:00' }),
  ];
  const [cur, crypto] = liveBalances(accounts, all);
  assert.equal(crypto.change_cents, 292); // €2.92 of Digital Assets transfers
  // Revolut's own balance column: €11.98 after 30 Aug → €409.52 on 24 Sep
  assert.equal(cur.change_cents, 40952 - 1198);
  assert.equal(earliestLinkedDay(accounts), '2026-08-31');
  assert.equal(earliestLinkedDay([account({})]), null);
});
