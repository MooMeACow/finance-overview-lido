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
  /** Money moved between your own accounts: stored but left out of totals */
  excluded?: boolean;
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
    // Top-ups come from your own bank account; Digital Assets is your own savings/crypto
    const ownTransfer = kind.toLowerCase() === 'topup' || /revolut digital assets/i.test(description);
    txns.push({
      date,
      description,
      amountCents: total,
      currency: (r[c.currency] ?? 'EUR').trim() || 'EUR',
      category: categorize(description, total, kind, rules),
      hash: hash([r[c.started], description, amount, fee, r[c.product] ?? '']),
      excluded: ownTransfer,
    });
  }
  return finish(txns, skipped);
}

// ---------- ING ----------

/** ING exports come in English or Dutch; these are the column names for each. */
const ING_COLUMNS = {
  en: { date: 'Date', name: 'Name / Description', direction: 'Debit/credit', amount: 'Amount (EUR)', type: 'Transaction type', notes: 'Notifications', out: 'debit' },
  nl: { date: 'Datum', name: 'Naam / Omschrijving', direction: 'Af Bij', amount: 'Bedrag (EUR)', type: 'Mutatiesoort', notes: 'Mededelingen', out: 'af' },
};

function ingLanguage(headers: string[]): keyof typeof ING_COLUMNS | null {
  for (const lang of ['en', 'nl'] as const) {
    const cols = ING_COLUMNS[lang];
    if ([cols.date, cols.name, cols.direction, cols.amount].every((h) => headers.includes(h))) return lang;
  }
  return null;
}

export function isIng(headers: string[]): boolean {
  return ingLanguage(headers) !== null;
}

/** Makes ING's card-payment names readable: "BCK*AH Oudorp Alkmaar NLD" → "AH Oudorp Alkmaar". */
export function cleanIngName(name: string, notes: string): string {
  let n = name.replace(/\s+/g, ' ').trim();
  if (!n || n.toUpperCase() === 'NOTPROVIDED') {
    if (/afronding/i.test(notes)) return 'Round-up to savings';
    const first = notes.split(/\s(?:Value date|Valutadatum):/i)[0].trim();
    return first.slice(0, 60) || '(no description)';
  }
  if (/^revolut\*/i.test(n)) return 'Top-up to Revolut';
  if (/beleggingsrek/i.test(notes)) return 'To investment account';
  n = n.replace(/^(BCK|CCV|SumUp|ZTL|SEPAY)\s*\*\s*/i, '');
  n = n.replace(/\s(NLD|NL|BEL|DEU|IRL|FRA|ESP|LUX)$/i, '');
  return n.trim();
}

/** Savings and investment transfers get a name that says which way the money went. */
function directionalName(name: string, rawName: string, notes: string, out: boolean): string {
  if (/oranje spaarrekening/i.test(rawName)) return out ? 'To savings (Oranje Spaarrekening)' : 'From savings (Oranje Spaarrekening)';
  if (/beleggingsrek/i.test(notes)) return out ? 'To investment account' : 'From investment account';
  return name;
}

export function parseIng(table: Table, rules?: Rules): ParseResult {
  const cols = ING_COLUMNS[ingLanguage(table.headers) ?? 'en'];
  const col = (name: string) => table.headers.indexOf(name);
  const c = {
    date: col(cols.date),
    name: col(cols.name),
    direction: col(cols.direction),
    amount: col(cols.amount),
    type: col(cols.type),
    notes: col(cols.notes),
  };
  const hash = makeHasher('ing');
  const txns: ParsedTxn[] = [];
  const skipped = new Map<string, number>();

  for (const r of table.rows) {
    const date = parseDate(r[c.date] ?? '', 'YMD');
    const abs = parseAmount(r[c.amount] ?? '');
    if (!date || abs === null) {
      addSkip(skipped, 'Could not read date or amount');
      continue;
    }
    if (abs === 0) {
      addSkip(skipped, 'Zero amount');
      continue;
    }
    const out = (r[c.direction] ?? '').trim().toLowerCase() === cols.out;
    const amount = out ? -Math.abs(abs) : Math.abs(abs);
    const rawName = (r[c.name] ?? '').trim();
    const notes = c.notes >= 0 ? (r[c.notes] ?? '').trim() : '';
    const type = c.type >= 0 ? (r[c.type] ?? '').trim().toLowerCase() : '';
    const description = directionalName(cleanIngName(rawName, notes), rawName, notes, out);

    // Money moved between your own accounts: savings, round-ups, investments, top-ups to Revolut
    const text = `${rawName} ${notes}`.toLowerCase();
    const toSavings = /spaarrekening|beleggingsrek|afronding/.test(text);
    const toRevolut = /^revolut\*/i.test(rawName);
    const ownTransfer = toSavings || toRevolut;

    const kind = type === 'cash machine' || type === 'geldautomaat' ? 'cash' : type === 'transfer' || type === 'overschrijving' ? 'transfer' : '';
    // A category you picked yourself for this description always wins
    const learned = rules?.has(description.trim().toLowerCase());
    const category = learned
      ? categorize(description, amount, kind, rules)
      : toSavings
        ? 'savings'
        : toRevolut
          ? 'transfers'
          : categorize(description, amount, kind, rules);

    txns.push({
      date,
      description,
      amountCents: amount,
      currency: 'EUR',
      category,
      hash: hash([r[c.date], rawName, r[c.direction], r[c.amount], notes]),
      excluded: ownTransfer,
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
