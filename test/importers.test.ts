import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toTable, parseCSV } from '../src/lib/csv.ts';
import { parseAmount, formatMoney } from '../src/lib/money.ts';
import { parseDate, detectDateFormat, shiftMonth } from '../src/lib/dates.ts';
import { isRevolut, parseRevolut, suggestMapping, parseGeneric } from '../src/lib/importers.ts';

const revolutCsv = readFileSync(new URL('./fixtures/revolut-sample.csv', import.meta.url), 'utf8');

test('csv: quoted fields, semicolons, CRLF', () => {
  const rows = parseCSV('a;b;c\r\n"x; y";"he said ""hi""";3\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x; y', 'he said "hi"', '3']]);
});

test('amounts in different formats', () => {
  assert.equal(parseAmount('-10.00'), -1000);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('10,5'), 1050);
  assert.equal(parseAmount('+830'), 83000);
  assert.equal(parseAmount('(12.50)'), -1250);
  assert.equal(parseAmount('€ 3,20'), 320);
  assert.equal(parseAmount('abc'), null);
  assert.equal(formatMoney(-123456), '−€1,234.56');
  assert.equal(formatMoney(500, 'EUR', 'always'), '+€5.00');
});

test('dates', () => {
  assert.equal(parseDate('2026-09-01 10:08:35', 'YMD'), '2026-09-01 10:08:35');
  assert.equal(parseDate('20260901', 'YMD'), '2026-09-01 00:00:00');
  assert.equal(parseDate('24-09-2026', 'DMY'), '2026-09-24 00:00:00');
  assert.equal(parseDate('31-02-2026', 'DMY'), null);
  assert.equal(detectDateFormat(['24-09-2026', '01-10-2026']), 'DMY');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('revolut sample: detection, totals, skipped rows, categories', () => {
  const table = toTable(revolutCsv);
  assert.ok(isRevolut(table.headers));
  const { txns, skipped } = parseRevolut(table);

  assert.equal(txns.length, 25);
  assert.deepEqual(skipped, [{ reason: 'Not completed (reverted)', count: 1 }]);

  // Fee-only row (Premium plan fee) becomes a -10.99 fee
  const fee = txns.find((t) => t.description === 'Premium plan fee');
  assert.equal(fee?.amountCents, -1099);
  assert.equal(fee?.category, 'fees');

  // Transfer with a 0.88 fee counts as 29.88 out
  const tr = txns.find((t) => t.amountCents === -2988);
  assert.equal(tr?.category, 'transfers');

  assert.equal(txns.find((t) => t.description === 'Albert Heijn')?.category, 'groceries');
  assert.equal(txns.find((t) => t.description.startsWith('Apple Pay top-up'))?.category, 'topup');
  assert.equal(txns.find((t) => t.description.includes('Digital Assets'))?.category, 'savings');

  // Two identical "To Tripper B.V." payments are both kept
  assert.equal(txns.filter((t) => t.description === 'To Tripper B.V.').length, 2);
  assert.equal(new Set(txns.map((t) => t.hash)).size, txns.length);

  // Re-parsing produces identical hashes (so re-imports are skipped)
  const again = parseRevolut(toTable(revolutCsv));
  assert.deepEqual(again.txns.map((t) => t.hash), txns.map((t) => t.hash));

  // Money in/out for September 2026
  const sep = txns.filter((t) => t.date.startsWith('2026-09'));
  const inSum = sep.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0);
  const outSum = sep.filter((t) => t.amountCents < 0).reduce((s, t) => s + t.amountCents, 0);
  assert.equal(inSum, 105000);
  // Aug 30 card payment belongs to August (started date)
  assert.equal(txns.find((t) => t.description === 'Spill')?.date.slice(0, 7), '2026-08');
  console.log('September in', inSum / 100, 'out', outSum / 100);
});

test('generic bank CSV (ING-style) with direction column', () => {
  const csv = [
    '"Datum";"Naam / Omschrijving";"Rekening";"Af Bij";"Bedrag (EUR)"',
    '"20260903";"Albert Heijn 1234";"NL00";"Af";"23,45"',
    '"20260925";"Salaris september";"NL00";"Bij";"2.500,00"',
  ].join('\n');
  const table = toTable(csv);
  assert.equal(isRevolut(table.headers), false);
  const m = suggestMapping(table);
  assert.equal(m.date, 0);
  assert.equal(m.description, 1);
  assert.equal(m.amount, 4);
  assert.equal(m.direction, 3);
  assert.equal(m.outValue, 'Af');
  assert.equal(m.dateFormat, 'YMD');
  const { txns } = parseGeneric(table, m);
  assert.deepEqual(
    txns.map((t) => [t.date.slice(0, 10), t.amountCents, t.category]),
    [
      ['2026-09-03', -2345, 'groceries'],
      ['2026-09-25', 250000, 'income'],
    ],
  );
});
