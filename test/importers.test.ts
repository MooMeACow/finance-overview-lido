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

import { isIng, parseIng, cleanIngName } from '../src/lib/importers.ts';

const ingCsv = readFileSync(new URL('./fixtures/ing-sample.csv', import.meta.url), 'utf8');

test('ING (English export): detection, signs, cleaned names, categories', () => {
  const table = toTable(ingCsv);
  assert.ok(isIng(table.headers));
  assert.equal(isRevolut(table.headers), false);
  const { txns, skipped } = parseIng(table);
  assert.equal(txns.length, 64);
  assert.deepEqual(skipped, []);

  const salary = txns.find((t) => t.description === 'ITRANSACT BV')!;
  assert.equal(salary.amountCents, 280716);
  assert.equal(salary.category, 'income');
  assert.equal(salary.date, '2026-09-23 00:00:00');

  const by = (d: string) => txns.find((t) => t.description === d)!;
  assert.equal(by('AH Oudorp Alkmaar').category, 'groceries');
  assert.equal(by('AH Oudorp Alkmaar').amountCents, -413);
  assert.equal(by('GELDMAAT OUDORPERPLEIN 27').category, 'cash');
  assert.equal(by('Kosten ING Go').category, 'fees');
  assert.equal(by('NETFLIX INTERNATIONAL B.V.').category, 'subscriptions');
  assert.equal(by('Vue Cinemas B.V.').category, 'entertainment');
  assert.equal(by('Pinedo Makelaardij B.V. inz. derdengelden').category, 'housing');
  assert.equal(by('To investment account').excluded, true);
  assert.equal(new Set(txns.map((t) => t.hash)).size, txns.length);
});

test('ING: transfers between own accounts are not counted', () => {
  const { txns } = parseIng(toTable(ingCsv));
  const own = txns.filter((t) => t.excluded);
  assert.ok(own.every((t) => ['savings', 'transfers'].includes(t.category)));
  assert.equal(own.filter((t) => t.description === 'Top-up to Revolut').length, 6);
  assert.ok(own.some((t) => t.description === 'Round-up to savings'));
  assert.ok(own.some((t) => t.description === 'To savings (Oranje Spaarrekening)' && t.amountCents === -100000));
  const fromSavings = own.filter((t) => t.description === 'From savings (Oranje Spaarrekening)');
  assert.equal(fromSavings.length, 8);
  assert.ok(fromSavings.every((t) => t.amountCents > 0));
  assert.equal(fromSavings.reduce((s, t) => s + t.amountCents, 0), 170009);

  const counted = txns.filter((t) => !t.excluded);
  const inSum = counted.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0);
  const outSum = counted.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0);
  assert.equal(inSum, 280716 + 2 + 18600 + 11900); // salary, refund, two allowances
  assert.equal(outSum, 250300);
});

test('ING (Dutch export) with semicolons and Af/Bij', () => {
  const csv = [
    '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"',
    '"20260903";"BCK*Albert Heijn 1234 ALKMAAR NLD";"NL00INGB0000000000";"";"BA";"Af";"23,45";"Betaalautomaat";"Pasvolgnr: 001"',
    '"20260925";"Werkgever BV";"NL00INGB0000000000";"NL11BANK0000000001";"OV";"Bij";"2.500,00";"Overschrijving";"Omschrijving: SALARIS SEPTEMBER"',
    '"20260926";"NOTPROVIDED";"NL00INGB0000000000";"";"OV";"Af";"0,55";"Overschrijving";"Naar Oranje spaarrekening X1 Afronding Valutadatum: 26-09-2026"',
  ].join('\n');
  const table = toTable(csv);
  assert.ok(isIng(table.headers));
  const { txns } = parseIng(table);
  assert.deepEqual(
    txns.map((t) => [t.description, t.amountCents, t.category, !!t.excluded]),
    [
      ['Albert Heijn 1234 ALKMAAR', -2345, 'groceries', false],
      ['Werkgever BV', 250000, 'income', false],
      ['Round-up to savings', -55, 'savings', true],
    ],
  );
});

test('ING name cleanup', () => {
  assert.equal(cleanIngName('BCK*AH to go Alkmaar 5 ALKMAAR', ''), 'AH to go Alkmaar 5 ALKMAAR');
  assert.equal(cleanIngName('CCV*PRENATAL ALKMAAR P ALKMAAR', ''), 'PRENATAL ALKMAAR P ALKMAAR');
  assert.equal(cleanIngName('Revolut**1234* Dublin IRL', ''), 'Top-up to Revolut');
  assert.equal(cleanIngName('NOTPROVIDED', 'To Oranje spaarrekening X Afronding Value date: 23/09/2026'), 'Round-up to savings');
  assert.equal(cleanIngName('NOTPROVIDED', 'Some payment note Value date: 23/09/2026'), 'Some payment note');
});

test('Revolut: top-ups and Digital Assets transfers are not counted', () => {
  const { txns } = parseRevolut(toTable(revolutCsv));
  assert.ok(txns.filter((t) => t.category === 'topup').every((t) => t.excluded));
  assert.ok(txns.filter((t) => t.description.includes('Digital Assets')).every((t) => t.excluded));
  assert.equal(txns.find((t) => t.description === 'Albert Heijn')?.excluded, false);
});
