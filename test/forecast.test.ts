import { test } from 'node:test';
import assert from 'node:assert/strict';

import { occurrences, upcoming, buildForecast, monthlyEquivalent } from '../src/lib/forecast.ts';
import type { Plan } from '../src/db/types.ts';

const plan = (p: Partial<Plan>): Plan => ({
  id: 1,
  kind: 'expense',
  description: 'Rent',
  amount_cents: 80000,
  category: 'housing',
  frequency: 'monthly',
  start_date: '2026-01-01',
  end_date: null,
  ...p,
});

test('monthly plans repeat on the same day, clamped to short months', () => {
  const p = plan({ start_date: '2026-01-31' });
  assert.deepEqual(occurrences(p, '2026-01-15', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('plans respect start and end dates', () => {
  const p = plan({ start_date: '2026-03-10', end_date: '2026-05-10' });
  assert.deepEqual(occurrences(p, '2026-01-01', '2026-12-31'), ['2026-03-10', '2026-04-10', '2026-05-10']);
  assert.deepEqual(occurrences(p, '2026-05-11', '2026-12-31'), []);
});

test('yearly and one-off plans', () => {
  assert.deepEqual(occurrences(plan({ frequency: 'yearly', start_date: '2025-11-05' }), '2026-01-01', '2027-12-31'), ['2026-11-05', '2027-11-05']);
  assert.deepEqual(occurrences(plan({ frequency: 'once', start_date: '2026-12-20' }), '2026-09-28', '2026-12-31'), ['2026-12-20']);
  assert.deepEqual(occurrences(plan({ frequency: 'once', start_date: '2026-08-01' }), '2026-09-28', '2026-12-31'), []);
  assert.equal(monthlyEquivalent(plan({ frequency: 'yearly', amount_cents: 12000 })), 1000);
});

test('upcoming: next 30 days including today, sorted', () => {
  const list = upcoming(
    [plan({ id: 1, description: 'Rent', start_date: '2026-01-01' }), plan({ id: 2, kind: 'income', description: 'Salary', start_date: '2026-01-25' })],
    '2026-09-28',
  );
  assert.deepEqual(list.map((o) => [o.date, o.plan.description]), [
    ['2026-10-01', 'Rent'],
    ['2026-10-25', 'Salary'],
  ]);
});

test('forecast: balance develops with plans and budgets', () => {
  const rows = buildForecast({
    startBalanceCents: 100000, // €1,000 today
    plans: [
      plan({ description: 'Rent', amount_cents: 80000, start_date: '2026-01-01' }),
      plan({ id: 2, kind: 'income', description: 'Salary', amount_cents: 250000, start_date: '2026-01-25' }),
      plan({ id: 3, description: 'Trip', amount_cents: 60000, frequency: 'once', start_date: '2026-12-20', category: 'other' }),
    ],
    budgets: [{ category: 'groceries', limit_cents: 30000 }],
    spentThisMonth: new Map([['groceries', 25000]]),
    today: '2026-09-28',
    months: 4,
  });
  // September: rent and salary already happened (before today); €50 of groceries budget left
  assert.deepEqual(rows[0], { month: '2026-09', income_cents: 0, expense_cents: 0, budget_cents: 5000, net_cents: -5000, end_balance_cents: 95000 });
  // October: +2500 −800 −300 = +1400
  assert.equal(rows[1].end_balance_cents, 95000 + 140000);
  // December includes the trip
  assert.equal(rows[3].expense_cents, 140000);
  assert.equal(rows[3].end_balance_cents, 95000 + 140000 * 2 + 80000);
});

test('labels', async () => {
  const { frequencyLabel } = await import('../src/lib/forecast.ts');
  assert.equal(frequencyLabel(plan({ start_date: '2026-01-01' })), 'Every month on the 1st');
  assert.equal(frequencyLabel(plan({ start_date: '2026-01-22', end_date: '2027-06-22' })), 'Every month on the 22nd until 22 Jun 2027');
  assert.equal(frequencyLabel(plan({ frequency: 'yearly', start_date: '2026-11-05' })), 'Every year on 5 Nov');
  assert.equal(frequencyLabel(plan({ frequency: 'once', start_date: '2026-12-20' })), 'Once on 20 Dec 2026');
});
