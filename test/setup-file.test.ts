import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSetupFile, parseSetupFile, planSetupImport } from '../src/lib/setupFile.ts';

const file = {
  format: 'finance-overview-setup',
  version: 1,
  plans: [
    { kind: 'income', description: 'Salary', amount: 2775, category: 'income', frequency: 'monthly', start_date: '2026-10-23', end_date: null },
    { kind: 'expense', description: 'House', amount: 776, category: 'housing', frequency: 'monthly', start_date: '2026-10-01', end_date: null },
    { kind: 'expense', description: 'Lock', amount: 400, category: 'nonsense', frequency: 'once', start_date: '2026-09-01' },
  ],
  budgets: [{ category: 'groceries', amount: 350 }],
  debts: [{ person: 'Sam', direction: 'owed_to_me', amount: 71.38, note: '₱5,200' }],
};

test('plans file: parse and convert to cents', () => {
  const text = JSON.stringify(file);
  assert.ok(isSetupFile(text));
  assert.equal(isSetupFile('Date,Amount\n'), false);
  const s = parseSetupFile(text);
  assert.equal(s.plans.length, 3);
  assert.equal(s.plans[0].amount_cents, 277500);
  assert.equal(s.plans[2].category, 'other', 'unknown category falls back to other');
  assert.equal(s.plans[2].end_date, null);
  assert.deepEqual(s.budgets, [{ category: 'groceries', limit_cents: 35000 }]);
  assert.deepEqual(s.debts, [{ person: 'Sam', direction: 'owed_to_me', amount_cents: 7138, note: '₱5,200' }]);
});

test('plans file: readable errors', () => {
  const bad = { ...file, plans: [{ kind: 'expense', description: 'X', amount: -5, frequency: 'weekly', start_date: '1 Oct' }] };
  assert.throws(() => parseSetupFile(JSON.stringify(bad)), /amount must be a positive number[\s\S]*frequency[\s\S]*start_date/);
  assert.throws(() => parseSetupFile('{'), /not valid JSON/);
  assert.throws(() => parseSetupFile('{"format":"other"}'), /not a Finance Overview plans file/);
});

test('plans file: importing twice adds nothing new', () => {
  const s = parseSetupFile(JSON.stringify(file));
  const first = planSetupImport({ plans: [], debts: [] }, s);
  assert.equal(first.plans.length, 3);
  assert.equal(first.skipped, 0);
  const existingPlans = first.plans.map((p, i) => ({ ...p, id: i + 1 }));
  const existingDebts = first.debts.map((d, i) => ({ ...d, id: i + 1, updated_at: '' }));
  const again = planSetupImport({ plans: existingPlans, debts: existingDebts }, s);
  assert.equal(again.plans.length, 0);
  assert.equal(again.debts.length, 0);
  assert.equal(again.skipped, 4);
});
