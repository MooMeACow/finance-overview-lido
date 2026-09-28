/**
 * Turns a bank CSV into normalized transactions.
 * - Revolut exports are detected automatically.
 * - Any other bank goes through a column mapping the user can adjust.
 */

import type { Table } from './csv';
import { detectDateFormat, parseDate } from './dates';
import type { DateFormat } from './dates';
import { parseAmount } from './money';
import { categorize } from './categories';

export type ParsedTxn = {
  date: string; // "YYYY-MM-DD HH:MM:SS"
  description: string;
  amountCents: number; // signed, fees included
  currency: string;
  category: string;
  hash: string; // stable id used to skip duplicates on re-import
};

export type ParseResult = {
  txns: ParsedTxn[];
  skipped: { reason: string; count: number }[];
};

export type Mapping = {
  date: number;
  description: number;
  amount: number;
  /** Optional column that says whether money went in or out (e.g. ING "Af Bij") */
  direction: number | null;
  /** Value in the direction column that means money out, e.g. "Af" or "Debit" */
  outValue: string;
  dateFormat: DateFormat;
  currency: string;
};

type Rules = Map<string, string> | undefined;

function addSkip(skipped: Map<string, number>, reason: string) {
  skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
}

function finish(txns: ParsedTxn[], skipped: Map<string, number>): ParseResult {
  return {
    txns,
    skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

/**
 * Builds a stable hash. Identical rows within one file get an occurrence index
 * so two genuinely identical payments are both kept, while re-importing the
 * same file doesn't create duplicates.
 */
function makeHasher(prefix: string) {
  const seen = new Map<string, number>();
  return (parts: (string | number)[]) => {
    const base = [prefix, ...parts].join('|');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  };
}

// ---------- Revolut ----------

const REVOLUT_REQUIRED = ['Type', 'Started Date', 'Description', 'Amount', 'Fee', 'Currency', 'State'];

export function isRevolut(headers: string[]): boolean {
  return REVOLUT_REQUIRED.every((h) => headers.includes(h));
}

export function parseRevolut(table: Table, rules?: Rules): ParseResult {
  const col = (name: string) => table.headers.indexOf(name);
  const c = {
    type: col('Type'),
    started: col('Started Date'),
    completed: col('Completed Date'),
    description: col('Description'),
    amount: col('Amount'),
    fee: col('Fee'),
    currency: col('Currency'),
    state: col('State'),
    product: col('Product'),
  };
  const hash = makeHasher('revolut');
  const txns: ParsedTxn[] = [];
  const skipped = new Map<string, number>();

  for (const r of table.rows) {
    const state = (r[c.state] ?? '').trim().toUpperCase();
    if (state !== 'COMPLETED') {
      addSkip(skipped, state === 'PENDING' ? 'Pending (import again once completed)' : `Not completed (${state.toLowerCase() || 'unknown'})`);
      continue;
    }
    const date = parseDate(r[c.started] || r[c.completed] || '', 'YMD');
    const amount = parseAmount(r[c.amount]);
    const fee = parseAmount(r[c.fee] || '0') ?? 0;
    if (!date || amount === null) {
      addSkip(skipped, 'Could not read date or amount');
      continue;
    }
    // Revolut lists fees separately as positive numbers; they are money out.
    const total = amount - Math.abs(fee);
    if (total === 0) {
      addSkip(skipped, 'Zero amount');
      continue;
    }
    const description = (r[c.description] ?? '').trim() || '(no description)';
    const kind = (r[c.type] ?? '').trim();
    txns.push({
      date,
      description,
      amountCents: total,
      currency: (r[c.currency] ?? 'EUR').trim() || 'EUR',
      category: categorize(description, total, kind, rules),
      hash: hash([r[c.started], description, amount, fee, r[c.product] ?? '']),
    });
  }
  return finish(txns, skipped);
}

// ---------- Any other bank ----------

const find = (headers: string[], re: RegExp) => headers.findIndex((h) => re.test(h.toLowerCase()));

/** Best guess at which columns hold what. The user can change it. */
export function suggestMapping(table: Table): Mapping {
  const h = table.headers;
  let date = find(h, /(^|\s)(date|datum|boekdatum|transactiedatum|booking)/);
  if (date < 0) date = 0;
  let description = find(h, /(description|omschrijving|naam|name|payee|counterparty|merchant|details)/);
  if (description < 0) description = Math.min(1, h.length - 1);
  let amount = find(h, /(amount|bedrag|value|waarde)/);
  if (amount < 0) amount = Math.max(0, h.length - 1);
  const direction = find(h, /(af bij|af\/bij|debit\/credit|credit\/debit|direction|debet\/credit)/);

  let outValue = '';
  if (direction >= 0) {
    const values = new Set(table.rows.map((r) => (r[direction] ?? '').trim()));
    outValue = [...values].find((v) => /^(af|debit|debet|d|out)$/i.test(v)) ?? [...values][0] ?? '';
  }

  const currencyCol = find(h, /^(currency|valuta|munt)$/);
  const currency = currencyCol >= 0 ? (table.rows[0]?.[currencyCol] ?? 'EUR').trim() || 'EUR' : 'EUR';

  return {
    date,
    description,
    amount,
    direction: direction >= 0 ? direction : null,
    outValue,
    dateFormat: detectDateFormat(table.rows.slice(0, 50).map((r) => r[date] ?? '')) ?? 'YMD',
    currency,
  };
}

export function parseGeneric(table: Table, m: Mapping, rules?: Rules): ParseResult {
  const hash = makeHasher('csv');
  const txns: ParsedTxn[] = [];
  const skipped = new Map<string, number>();

  for (const r of table.rows) {
    const date = parseDate(r[m.date] ?? '', m.dateFormat);
    let amount = parseAmount(r[m.amount] ?? '');
    if (!date || amount === null) {
      addSkip(skipped, 'Could not read date or amount');
      continue;
    }
    if (m.direction !== null) {
      const dir = (r[m.direction] ?? '').trim().toLowerCase();
      const abs = Math.abs(amount);
      amount = dir === m.outValue.trim().toLowerCase() ? -abs : abs;
    }
    if (amount === 0) {
      addSkip(skipped, 'Zero amount');
      continue;
    }
    const description = (r[m.description] ?? '').trim() || '(no description)';
    txns.push({
      date,
      description,
      amountCents: amount,
      currency: m.currency,
      category: categorize(description, amount, undefined, rules),
      hash: hash([date, description, amount]),
    });
  }
  return finish(txns, skipped);
}
