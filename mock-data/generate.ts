/**
 * Mock data for a local demo: one year of finances for someone in Amsterdam
 * earning €85,000 gross a year (incl. 8% holiday allowance).
 *
 * Net pay is an estimate for 2026 Dutch tax rates with ~5% pension premium:
 * €4,283.12 a month plus €3,184.50 holiday allowance in May, ≈ €54.6k net a year.
 *
 * It writes realistic ING and Revolut CSV statements, runs them through the
 * app's own importers (so categories, own-account transfers and duplicate
 * hashes behave exactly like a real import), then adds accounts, plans,
 * budgets and debts and saves everything as a Finance Overview backup file.
 *
 * Run: node --experimental-strip-types --import ./test/register.mjs mock-data/generate.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTable } from '../src/lib/csv.ts';
import { cleanIngName, parseIng, parseRevolut, type ParsedTxn } from '../src/lib/importers.ts';
import { liveBalances } from '../src/lib/balances.ts';
import type { Account, Budget, Debt, ImportRecord, Plan } from '../src/db/types.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIRST_DAY = '2025-10-01';
const LAST_DAY = '2026-09-28'; // statements exported the evening before "today" (2026-09-29)
const BALANCE_DAY = '2026-07-01'; // day the balances were typed into the app

// ---------- Deterministic randomness ----------

let seed = Number(process.env.MOCK_SEED ?? 8);
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = (p: number) => rand() < p;
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const cents = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100);
const pad = (n: number) => String(n).padStart(2, '0');
const time = (fromHour: number, toHour: number) =>
  `${pad(fromHour + Math.floor(rand() * (toHour - fromHour)))}:${pad(Math.floor(rand() * 60))}:${pad(Math.floor(rand() * 60))}`;

// ---------- Calendar ----------

function days(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  while (d.toISOString().slice(0, 10) <= to) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
/** Salary lands on the 24th, or the Friday before when that's a weekend. */
function salaryDay(month: string): string {
  const d = new Date(`${month}-24T12:00:00Z`);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const dmy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

// ---------- Statement rows ----------

type IngRow = { day: string; name: string; counterparty: string; code: string; out: boolean; cents: number; type: string; notes: string };
type RevRow = { type: string; started: string; completed: string; description: string; cents: number; fee: number };

const ingRows: IngRow[] = [];
const revRows: RevRow[] = [];
const ING_START = 360_000; // €3,600 on 1 Oct 2025
let ingBalance = ING_START;
let revBalance = 8_000;
let cardSeq = 3000;
const ingLow = { cents: Infinity, day: '' };

const euro = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const ref = () => String(Math.floor(rand() * 1e16)).padStart(16, '0');

function ing(day: string, name: string, out: boolean, amount: number, kind: 'card' | 'dd' | 'ideal' | 'transfer' | 'online' | 'atm' | 'fee', extra = '') {
  // Check digits "00" never pass the IBAN checksum, so no generated number can be a real account.
  // The discarded draw keeps the random stream (and so the rest of the mock year) unchanged.
  rand();
  const iban = `NL00${pick(['ABNA', 'RABO', 'INGB', 'DEUT'])}0${String(Math.floor(rand() * 1e9)).padStart(9, '0')}`;
  const value = `Value date: ${dmy(day)}`;
  const card = () => `Card sequence no.: 901 ${dmy(day)} ${time(8, 21).slice(0, 5)} Transaction: ${pick(['W', 'C', 'P'])}${cardSeq++} Term: CT${Math.floor(rand() * 900000 + 100000)} Apple Pay ${value}`;
  const rows: Record<typeof kind, Omit<IngRow, 'day' | 'name' | 'out' | 'cents'>> = {
    card: { counterparty: '', code: 'BA', type: 'Payment terminal', notes: card() },
    atm: { counterparty: '', code: 'GM', type: 'Cash machine', notes: card() },
    dd: { counterparty: iban, code: 'IC', type: 'SEPA direct debit', notes: `Name: ${name} Description: ${extra} IBAN: ${iban} Reference: ${ref()} Recurrent SEPA direct debit ${value}` },
    ideal: { counterparty: iban, code: 'IW', type: 'iDEAL | Wero', notes: `Name: ${name} Description: ${extra || ref()} IBAN: ${iban} Reference: ${dmy(day)} ${time(9, 22).slice(0, 5)} ${ref()} ${value}` },
    transfer: { counterparty: iban, code: 'OV', type: 'Transfer', notes: `Name: ${name} Description: ${extra} IBAN: ${iban} ${value}` },
    online: { counterparty: '', code: 'GT', type: 'Online Banking', notes: `${extra} ${value}` },
    fee: { counterparty: '', code: 'DV', type: 'Various', notes: `${extra} ING BANK N.V. ${value}` },
  };
  ingRows.push({ day, name, out, cents: amount, ...rows[kind] });
  ingBalance += out ? -amount : amount;
  if (ingBalance < ingLow.cents) Object.assign(ingLow, { cents: ingBalance, day });
}

function revolut(started: string, type: string, description: string, amount: number) {
  revRows.push({ type, started, completed: started, description, cents: amount, fee: 0 });
  revBalance += amount;
}

/** Revolut payments of the day; settled in time order by settleRevolut(). */
const revQueue: { day: string; started: string; description: string; amount: number; type: string }[] = [];
function revSpend(day: string, description: string, amount: number, hours: [number, number] = [9, 23], type = 'Card Payment') {
  revQueue.push({ day, started: `${day} ${time(...hours)}`, description, amount, type });
}

/** Pays the day's Revolut payments, topping up from ING a few minutes before when the balance runs low (like most people do). */
function settleRevolut() {
  revQueue.sort((a, b) => (a.started < b.started ? -1 : 1));
  for (const { day, started, description, amount, type } of revQueue.splice(0)) {
    if (revBalance - amount < 1500) {
      const topUp = Math.max(10_000, Math.ceil((amount + 6_000 - revBalance) / 5_000) * 5_000);
      const before = new Date(Date.parse(`${started.replace(' ', 'T')}Z`) - (1 + Math.floor(rand() * 5)) * 60_000).toISOString();
      const topUpAt = before.slice(0, 10) === day ? `${day} ${before.slice(11, 19)}` : `${day} 00:00:00`;
      ing(day, 'Revolut**6412* Dublin IRL', true, topUp, 'online', `Card sequence no.: 901 ${dmy(day)} ${topUpAt.slice(11, 16)} Transaction: P${cardSeq++} Term: --- Apple Pay`);
      revolut(topUpAt, 'Topup', 'Apple Pay top-up by *6412', topUp);
    }
    revolut(started, type, description, -amount);
  }
}

// ---------- One year of life ----------

const GROCERY = [
  { name: 'BCK*AH Jacob van Lennepstr AMSTERDAM NLD', min: 6, max: 38 },
  { name: 'Albert Heijn 1419 AMSTERDAM NLD', min: 12, max: 58 },
  { name: 'Jumbo Kinkerstraat AMSTERDAM NLD', min: 18, max: 64 },
  { name: 'Lidl Amsterdam De Clercqstr AMSTERDAM NLD', min: 22, max: 56 },
  { name: 'Dirk van den Broek AMSTERDAM NLD', min: 15, max: 48 },
  { name: 'Ekoplaza Ten Katestraat AMSTERDAM NLD', min: 9, max: 34 },
];
const LUNCH = ['Starbucks Centraal Station', 'Broodje Bert', 'Cafe De Jaren', 'Bagels & Beans Oud-West', 'Cafe Thijssen'];
const DINNER = ['Restaurant Floreyn', 'Restaurant De Italiaan', 'Cafe De Klepel', 'Foodhallen Amsterdam', 'Restaurant Wilde Zwijnen', 'Cafe Loetje Oost'];
const DRINKS = ['Bar Botanique', 'Brouwerij t IJ', 'Cafe Brecht', 'Hannekes Boom'];
const SHOPS_CARD = [
  { name: 'HEMA Kinkerstraat AMSTERDAM NLD', min: 5, max: 32 },
  { name: 'Etos 7123 AMSTERDAM NLD', min: 6, max: 28 },
  { name: 'Kruidvat 4012 AMSTERDAM NLD', min: 5, max: 24 },
  { name: 'Action Bos en Lommerweg AMSTERDAM NLD', min: 8, max: 30 },
];

/** Things that happen on a specific day, beyond the usual rhythm. */
const EVENTS: Record<string, (day: string) => void> = {
  '2025-10-18': (d) => ing(d, 'IKEA Amsterdam', true, 21_495, 'card'),
  '2025-11-08': (d) => revSpend(d, 'Pathé Tuschinski', 3_100, [19, 21]),
  '2025-11-28': (d) => ing(d, 'Coolblue B.V.', true, 34_900, 'ideal', 'Bestelling 91827364 Coolblue Black Friday'),
  '2025-12-04': (d) => ing(d, 'bol.com b.v.', true, 8_647, 'ideal', 'Bestelling bol.com'),
  '2025-12-11': (d) => ing(d, 'bol.com b.v.', true, 5_498, 'ideal', 'Bestelling bol.com'),
  '2025-12-13': (d) => revSpend(d, 'Zalando SE', 11_990),
  '2025-12-19': (d) => ing(d, 'NS GROEP IZ NS REIZIGERS', true, 4_260, 'ideal', 'Enkele reis Amsterdam Centraal - Groningen v.v.'),
  '2025-12-24': (d) => revSpend(d, 'Restaurant Het Kleine Paleis Groningen', 9_450, [18, 21]),
  '2025-12-31': (d) => revSpend(d, 'Hannekes Boom', 6_850, [21, 23]),
  '2026-01-10': (d) => ing(d, 'Centraal Beheer', true, 6_800, 'dd', 'Doorlopende reisverzekering 2026'),
  '2026-01-24': (d) => revSpend(d, 'Uniqlo Kalverstraat', 8_990),
  '2026-02-14': (d) => revSpend(d, 'Restaurant Floreyn', 14_200, [19, 22]),
  '2026-03-13': (d) => {
    revSpend(d, 'TESO Texel ferry', 3_850, [16, 17]);
    ing(d, 'Albert Heijn Den Burg TEXEL NLD', true, 6_724, 'card');
  },
  '2026-03-14': (d) => revSpend(d, 'Restaurant De Worsteltent Texel', 7_640, [19, 21]),
  '2026-04-11': (d) => revSpend(d, 'Ticketmaster', 8_450),
  '2026-04-22': (d) => ing(d, 'Tandartspraktijk Oud-West', true, 7_815, 'ideal', 'Factuur controle en gebitsreiniging'),
  '2026-05-14': (d) => ing(d, 'Belastingdienst', false, 41_200, 'transfer', 'TERUGGAAF INKOMSTENBELASTING 2025'),
  '2026-05-22': (d) => ing(d, 'Kanaalzicht Software B.V.', false, 318_450, 'transfer', 'VAKANTIEGELD 2026'),
  '2026-05-23': (d) => {
    // Most of the holiday allowance goes straight to savings and investments
    ing(d, 'Oranje Spaarrekening', true, 150_000, 'online', 'To Oranje spaarrekening V12345678');
    ing(d, 'L. Visser', true, 100_000, 'online', 'To Beleggingsrek. 00458812');
  },
  '2026-05-26': (d) => revSpend(d, 'Transavia', 28_640),
  '2026-06-09': (d) => revSpend(d, 'Booking.com', 64_412),
  '2026-06-20': (d) => ing(d, 'Coolblue B.V.', true, 12_900, 'ideal', 'Bestelling 91992044 Coolblue'),
  '2026-07-20': (d) => ing(d, 'Oranje Spaarrekening', false, 100_000, 'online', 'From Oranje spaarrekening V12345678'),
  '2026-08-08': (d) => {
    revSpend(d, 'Uber', 3_180, [11, 13]);
    revSpend(d, 'Time Out Market Lisboa', 4_260, [19, 21]);
  },
  '2026-08-09': (d) => {
    revSpend(d, 'Pasteis de Belem', 1_140, [10, 12]);
    revSpend(d, 'Museu Nacional do Azulejo', 1_600, [13, 15]);
    revSpend(d, 'Cervejaria Ramiro', 7_890, [20, 22]);
  },
  '2026-08-10': (d) => {
    revSpend(d, 'Pingo Doce Principe Real', 2_318, [10, 12]);
    revSpend(d, 'Bolt', 1_240, [14, 16]);
    revSpend(d, 'Restaurante Taberna da Rua das Flores', 6_450, [20, 22]);
  },
  '2026-08-11': (d) => {
    revSpend(d, 'CP Comboios de Portugal', 1_120, [9, 10]);
    revSpend(d, 'Parques de Sintra', 2_600, [11, 13]);
    revSpend(d, 'Restaurante Tascantiga Sintra', 3_870, [14, 16]);
  },
  '2026-08-12': (d) => {
    revSpend(d, 'LX Factory Ler Devagar', 3_450, [15, 17]);
    revSpend(d, 'Pink Flamingo Bar', 2_800, [22, 23]);
  },
  '2026-08-13': (d) => {
    revSpend(d, 'Pingo Doce Principe Real', 1_687, [10, 12]);
    revSpend(d, 'Restaurante Prado', 9_120, [20, 22]);
  },
  '2026-08-14': (d) => revSpend(d, 'Uber', 2_940, [8, 10]),
  '2026-09-06': (d) => ing(d, 'Coolblue B.V.', true, 8_999, 'ideal', 'Bestelling 92311870 Coolblue'),
  '2026-09-11': (d) => revSpend(d, 'Ticketmaster', 29_000),
  '2026-09-17': (d) => ing(d, 'Tandartspraktijk Oud-West', true, 9_250, 'ideal', 'Factuur controle en foto'),
};
const AWAY = new Set(days('2026-08-08', '2026-08-14')); // in Lisbon: no Amsterdam groceries or drinks

let nextAtm = '2025-10-04';
for (const day of days(FIRST_DAY, LAST_DAY)) {
  const dom = Number(day.slice(8, 10));
  const month = day.slice(0, 7);
  const mm = Number(day.slice(5, 7));
  const wd = weekday(day);
  const weekend = wd === 0 || wd === 6;

  // Fixed monthly rhythm
  if (dom === 1) {
    ing(day, 'Van Dijk & Partners Makelaardij B.V.', true, 169_500, 'dd', 'Huur Jacob van Lennepkade 212-2 Amsterdam');
    ing(day, 'Centraal Beheer', true, 1_785, 'dd', 'Inboedel- en aansprakelijkheidsverzekering');
  }
  if (dom === 2) revSpend(day, 'Anthropic', 2_178, [6, 8]);
  if (dom === 3) ing(day, 'Swapfiets', true, 2_190, 'dd', 'Swapfiets Deluxe 7 abonnement');
  if (dom === 5) ing(day, 'Basic-Fit Nederland B.V.', true, 3_499, 'dd', 'Lidmaatschap Basic-Fit Comfort');
  if (dom === 7) ing(day, 'NS GROEP IZ NS REIZIGERS', true, cents(18, 64), 'dd', 'NS Flex factuur');
  if (dom === 9) ing(day, 'NETFLIX INTERNATIONAL B.V.', true, 1_399, 'dd', 'Netflix Monthly Subscription');
  if (dom === 11) ing(day, 'Kosten ING Betaalpakket', true, 395, 'fee', `Kosten betaalpakket ${month}`);
  if (dom === 12) revSpend(day, 'Spotify', 1_299, [3, 5]);
  if (dom === 15) ing(day, 'Vattenfall Klantenservice N.V.', true, 13_400, 'dd', 'Termijnbedrag stroom en gas');
  if (dom === 17) revSpend(day, 'Apple.com/bill', 299, [2, 4]);
  if (dom === 19) revSpend(day, 'Disney Plus', 999, [2, 4]);
  if (dom === 20) ing(day, 'Ziggo B.V.', true, 5_475, 'dd', 'Ziggo Internet 1000 Mbit');
  if (dom === 21) ing(day, 'Odido Netherlands B.V.', true, 2_500, 'dd', 'Odido Unlimited');
  if (dom === 26) revSpend(day, 'Transfer to Revolut Digital Assets Europe Ltd', 5_000, [8, 9], 'Exchange');
  if (dom === 27) ing(day, 'Zilveren Kruis Zorgverzekeringen N.V.', true, 15_195, 'dd', 'Premie zorgverzekering Basis + Aanvullend 1');
  if (dom === 28) {
    ing(day, 'Waternet', true, 3_120, 'dd', 'Voorschot drinkwater');
    if (mm >= 3) ing(day, 'Gemeente Amsterdam Belastingen', true, day < '2026-01-01' ? 7_140 : 7_310, 'dd', `Aanslag gemeentelijke belastingen termijn ${mm - 2}/10`);
  }
  if (day === salaryDay(month)) {
    ing(day, 'Kanaalzicht Software B.V.', false, 428_312, 'transfer', `SALARISBETALING PERIODE ${mm}`);
    // Pay yourself first, the evening the salary comes in
    ing(day, 'Oranje Spaarrekening', true, 40_000, 'online', 'To Oranje spaarrekening V12345678');
    ing(day, 'L. Visser', true, 30_000, 'online', 'To Beleggingsrek. 00458812');
  }

  // Day-to-day spending
  if (!AWAY.has(day)) {
    if (chance(weekend ? 0.55 : 0.33)) {
      const g = pick(GROCERY);
      ing(day, g.name, true, cents(g.min, g.max), 'card');
    }
    if (!weekend && chance(0.18)) revSpend(day, pick(LUNCH), cents(3.8, 13.5), [8, 14]);
    if ((wd === 5 || wd === 6) && chance(0.32)) revSpend(day, pick(DINNER), cents(28, 72), [18, 22]);
    if (chance(0.07)) revSpend(day, pick(['Thuisbezorgd.nl', 'Thuisbezorgd.nl', 'Uber Eats']), cents(22, 39), [18, 22]);
    if ((wd === 4 || wd === 5 || wd === 6) && chance(0.24)) revSpend(day, pick(DRINKS), cents(14, 52), [20, 23]);
    if (chance(0.045)) revSpend(day, pick(['Uber', 'Bolt', 'Bolt']), cents(4.5, 23), [0, 3]);
    if (chance(0.06)) {
      const s = pick(SHOPS_CARD);
      ing(day, s.name, true, cents(s.min, s.max), 'card');
    }
    if (chance(0.035)) ing(day, 'bol.com b.v.', true, cents(12, 69), 'ideal', 'Bestelling bol.com');
    if (chance(0.02)) revSpend(day, pick(['Zalando SE', 'Uniqlo Kalverstraat', 'Amazon.nl']), cents(24, 95));
    if (chance(0.02)) revSpend(day, pick(['Pathé Tuschinski', 'Pathé De Munt']), cents(13, 28), [19, 21]);
    if (chance(0.014)) ing(day, 'Apotheek Overtoom AMSTERDAM NLD', true, cents(6, 26), 'card');
    if (day >= nextAtm) {
      ing(day, 'GELDMAAT Overtoom 186 AMSTERDAM NLD', true, 5_000, 'atm');
      nextAtm = new Date(Date.parse(`${day}T12:00:00Z`) + (32 + Math.floor(rand() * 20)) * 864e5).toISOString().slice(0, 10);
    }
    // Friends settling up
    if (chance(0.03)) ing(day, 'AAB INZ TIKKIE', false, cents(8, 32), 'transfer', `Tikkie ID ${ref().slice(0, 12)}, ${pick(['Pizza', 'Borrel', 'Cadeau Mila', 'Uber'])}, Van ${pick(['S de Boer', 'D Mulder', 'M Jansen'])}`);
    if (chance(0.02)) ing(day, 'D. Mulder via ING Betaalverzoek', true, cents(9, 35), 'ideal', 'Betaalverzoek Daan');
  }

  EVENTS[day]?.(day);
  settleRevolut();
}

// ---------- Write the statements ----------

function ingCsv(rows: IngRow[]): string {
  const header = 'Date,Name / Description,Counterparty,Code,Debit/credit,Amount (EUR),Transaction type,Notifications';
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // ING lists the newest first
  const lines = [...rows].reverse().map((r) =>
    [r.day.replace(/-/g, ''), r.name, r.counterparty, r.code, r.out ? 'Debit' : 'Credit', euro(r.cents), r.type, r.notes].map(q).join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}

function revolutCsv(rows: RevRow[]): string {
  let balance = 8_000;
  // Revolut lists the oldest first
  const lines = [...rows].sort((x, y) => (x.started < y.started ? -1 : x.started > y.started ? 1 : 0)).map((r) => {
    if (balance + r.cents - r.fee < 0) throw new Error(`Revolut balance below zero at ${r.started}`);
    balance += r.cents - r.fee;
    return [r.type, 'Current', r.started, r.completed, r.description, (r.cents / 100).toFixed(2), (r.fee / 100).toFixed(2), 'EUR', 'COMPLETED', (balance / 100).toFixed(2)].join(',');
  });
  return ['Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance', ...lines].join('\n') + '\n';
}

// Categories this person taught the app (the app learns them when you recategorize)
const RULES: Record<string, string> = {};
function teach(ingName: string, category: string) {
  RULES[cleanIngName(ingName, '').trim().toLowerCase()] = category;
}
teach('Zilveren Kruis Zorgverzekeringen N.V.', 'health');
teach('Basic-Fit Nederland B.V.', 'health');
teach('Centraal Beheer', 'bills');
teach('Gemeente Amsterdam Belastingen', 'bills');
teach('Swapfiets', 'transport');
teach('Coolblue B.V.', 'shopping');
teach('IKEA Amsterdam', 'shopping');
teach('D. Mulder via ING Betaalverzoek', 'entertainment');
for (const [desc, cat] of Object.entries({
  'Foodhallen Amsterdam': 'eating_out',
  'Bagels & Beans Oud-West': 'eating_out',
  'Pasteis de Belem': 'eating_out',
  'Time Out Market Lisboa': 'eating_out',
  'Cervejaria Ramiro': 'eating_out',
  'Bar Botanique': 'entertainment',
  'Cafe Brecht': 'entertainment',
  'Brouwerij t IJ': 'entertainment',
  'Hannekes Boom': 'entertainment',
  'Pink Flamingo Bar': 'entertainment',
  'Museu Nacional do Azulejo': 'entertainment',
  'Parques de Sintra': 'entertainment',
  'Transavia': 'entertainment',
  'Booking.com': 'entertainment',
  'Uniqlo Kalverstraat': 'shopping',
  'Amazon.nl': 'shopping',
  'LX Factory Ler Devagar': 'shopping',
  'Pingo Doce Principe Real': 'groceries',
  'TESO Texel ferry': 'transport',
  'CP Comboios de Portugal': 'transport',
})) RULES[desc.toLowerCase()] = cat;
const rules = new Map(Object.entries(RULES));

const ingSplit = '2026-07-01';
const ingFiles = [
  { file: 'NL00INGB0001234567_01-10-2025_30-06-2026.csv', rows: ingRows.filter((r) => r.day < ingSplit), importedAt: '2026-07-01 20:14:03' },
  { file: 'NL00INGB0001234567_01-07-2026_28-09-2026.csv', rows: ingRows.filter((r) => r.day >= ingSplit), importedAt: '2026-09-28 21:02:44' },
];
const revFile = { file: 'account-statement_2025-10-01_2026-09-28_en-nl_7f3a21.csv', importedAt: '2026-09-28 21:05:10' };

mkdirSync(join(ROOT, 'statements'), { recursive: true });
const parsed: { file: string; source: 'ing' | 'revolut'; importedAt: string; txns: ParsedTxn[] }[] = [];
for (const f of ingFiles) {
  const csv = ingCsv(f.rows);
  writeFileSync(join(ROOT, 'statements', f.file), csv);
  parsed.push({ file: f.file, source: 'ing', importedAt: f.importedAt, txns: parseIng(toTable(csv), rules).txns });
}
{
  const csv = revolutCsv(revRows);
  writeFileSync(join(ROOT, 'statements', revFile.file), csv);
  parsed.push({ file: revFile.file, source: 'revolut', importedAt: revFile.importedAt, txns: parseRevolut(toTable(csv), rules).txns });
}

// ---------- Build the app's data ----------

let idCounter = 0;
const idAt = (stamp: string) => Date.parse(stamp.replace(' ', 'T')) * 1000 + (idCounter++ % 1000);

const imports: ImportRecord[] = [];
const transactions = parsed.flatMap((p) => {
  const importId = idAt(p.importedAt);
  imports.push({ id: importId, file_name: p.file, source: p.source, imported_at: p.importedAt, row_count: p.txns.length });
  return p.txns.map((t) => ({
    id: idAt(p.importedAt),
    date: t.date,
    description: t.description,
    amount_cents: t.amountCents,
    currency: t.currency,
    category: t.category,
    note: null as string | null,
    excluded: t.excluded ? 1 : 0,
    source: p.source,
    import_id: importId,
    hash: t.hash as string | null,
  }));
});

// A few notes, like someone who uses the app would add
const noteOn = (match: (t: (typeof transactions)[number]) => boolean, note: string) => {
  const t = transactions.find(match);
  if (t) t.note = note;
};
noteOn((t) => t.description === 'Ticketmaster' && t.date.startsWith('2026-09-11'), 'Ziggo Dome, 2 tickets (Sanne pays me back)');
noteOn((t) => t.description === 'Booking.com', 'Lisbon apartment, one week');
noteOn((t) => t.description === 'Transavia', 'AMS-LIS return');
noteOn((t) => t.description.startsWith('Coolblue') && t.date.startsWith('2025-11-28'), 'Sony WH-1000XM6');

// Balances as they were typed in on BALANCE_DAY; later imports keep them current
const typedAt = `${BALANCE_DAY} 09:12:00`;
const through = (pred: (t: (typeof transactions)[number]) => boolean, start: number) =>
  transactions.filter((t) => t.date.slice(0, 10) <= BALANCE_DAY && pred(t)).reduce((s, t) => s + t.amount_cents, start);
const accounts: Account[] = [
  { id: idAt(typedAt), name: 'ING Betaalrekening', type: 'current', link: 'ing_current', balance_cents: through((t) => t.source === 'ing', ING_START), currency: 'EUR', updated_at: typedAt },
  { id: idAt(typedAt), name: 'Revolut', type: 'current', link: 'revolut_current', balance_cents: through((t) => t.source === 'revolut', 8_000), currency: 'EUR', updated_at: typedAt },
  { id: idAt(typedAt), name: 'ING Oranje Spaarrekening', type: 'savings', link: 'ing_savings', balance_cents: 1_618_400, currency: 'EUR', updated_at: typedAt },
  { id: idAt(typedAt), name: 'ING Zelf Beleggen (ETFs)', type: 'savings', link: 'ing_investment', balance_cents: 2_137_655, currency: 'EUR', updated_at: typedAt },
  { id: idAt(typedAt), name: 'Revolut crypto', type: 'savings', link: 'revolut_crypto', balance_cents: 118_230, currency: 'EUR', updated_at: typedAt },
];

const plan = (kind: Plan['kind'], description: string, euros: number, category: string, frequency: Plan['frequency'], start_date: string, end_date: string | null = null): Plan => ({
  id: idAt('2026-07-01 09:30:00'),
  kind,
  description,
  amount_cents: Math.round(euros * 100),
  category,
  frequency,
  start_date,
  end_date,
});
const plans: Plan[] = [
  plan('income', 'Salary (Kanaalzicht Software)', 4283.12, 'income', 'monthly', '2025-10-24'),
  plan('income', 'Holiday allowance (vakantiegeld)', 3184.5, 'income', 'yearly', '2026-05-22'),
  plan('expense', 'Rent', 1695, 'housing', 'monthly', '2025-10-01'),
  plan('expense', 'Health insurance (Zilveren Kruis)', 151.95, 'health', 'monthly', '2025-10-27'),
  plan('expense', 'Energy (Vattenfall)', 134, 'bills', 'monthly', '2025-10-15'),
  plan('expense', 'Municipal taxes', 73.1, 'bills', 'monthly', '2026-03-28', '2026-12-28'),
  plan('expense', 'Municipal taxes', 74.8, 'bills', 'monthly', '2027-03-28', '2027-12-28'),
  plan('expense', 'Internet (Ziggo)', 54.75, 'bills', 'monthly', '2025-10-20'),
  plan('expense', 'Gym (Basic-Fit)', 34.99, 'health', 'monthly', '2025-10-05'),
  plan('expense', 'Water (Waternet)', 31.2, 'bills', 'monthly', '2025-10-28'),
  plan('expense', 'Phone (Odido)', 25, 'bills', 'monthly', '2025-10-21'),
  plan('expense', 'Home & liability insurance', 17.85, 'bills', 'monthly', '2025-10-01'),
  plan('expense', 'Travel insurance', 68, 'bills', 'yearly', '2026-01-10'),
  plan('expense', 'Christmas presents', 450, 'shopping', 'once', '2026-12-12'),
  plan('expense', 'Ski trip Saalbach', 1350, 'entertainment', 'once', '2027-02-06'),
];

// Day-to-day spending only; fixed costs are plans above (so nothing counts twice)
const budgets: Budget[] = [
  { category: 'groceries', limit_cents: 42_500 },
  { category: 'eating_out', limit_cents: 30_000 },
  { category: 'shopping', limit_cents: 22_500 },
  { category: 'entertainment', limit_cents: 17_500 },
  { category: 'transport', limit_cents: 10_000 },
  { category: 'subscriptions', limit_cents: 7_000 },
];

const debts: Debt[] = [
  { id: idAt('2026-09-11 22:40:00'), person: 'Sanne', direction: 'owed_to_me', amount_cents: 14_500, note: 'Ziggo Dome ticket', updated_at: '2026-09-11 22:40:00' },
  { id: idAt('2026-03-16 10:05:00'), person: 'Daan', direction: 'i_owe', amount_cents: 23_850, note: 'My share of the Texel weekend house', updated_at: '2026-03-16 10:05:00' },
];

const data = {
  transactions,
  imports,
  rules: RULES,
  accounts,
  plans,
  budgets,
  debts,
  nextTxnId: 1,
  nextImportId: 1,
  nextAccountId: 1,
  nextPlanId: 1,
  nextDebtId: 1,
};
const backup = { format: 'finance-overview-backup', version: 1, exported_at: '2026-09-28T21:10:00.000Z', data };

const out = join(ROOT, '..', 'public', 'mock', 'finance-backup-mock-85k.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(backup));

// ---------- Report ----------

const live = liveBalances(accounts, transactions);
const fmt = (c: number) => `€${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
console.log(`Transactions: ${transactions.length} (${transactions.filter((t) => t.excluded).length} own-account transfers)`);
console.log(`Imports: ${imports.map((i) => `${i.file_name} (${i.row_count})`).join(', ')}`);
for (const a of live) console.log(`  ${a.name.padEnd(28)} ${fmt(a.balance_cents).padStart(12)}  (typed ${fmt(a.entered_cents)}, ${a.change_count} changes)`);
console.log(`  ${'Overall total'.padEnd(28)} ${fmt(live.reduce((s, a) => s + a.balance_cents, 0)).padStart(12)}`);
console.log(`ING balance now ${fmt(ingBalance)} (lowest ${fmt(ingLow.cents)} on ${ingLow.day}), Revolut ${fmt(revBalance)}`);

const byMonth = new Map<string, { in: number; out: number; cats: Map<string, number> }>();
for (const t of transactions) {
  if (t.excluded) continue;
  const m = byMonth.get(t.date.slice(0, 7)) ?? { in: 0, out: 0, cats: new Map() };
  if (t.amount_cents > 0) m.in += t.amount_cents;
  else {
    m.out -= t.amount_cents;
    m.cats.set(t.category, (m.cats.get(t.category) ?? 0) - t.amount_cents);
  }
  byMonth.set(t.date.slice(0, 7), m);
}
for (const [m, v] of [...byMonth].sort()) {
  const cats = [...v.cats].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${Math.round(n / 100)}`).join(', ');
  console.log(`${m}  in ${fmt(v.in).padStart(10)}  out ${fmt(v.out).padStart(10)}  | ${cats}`);
}
const other = transactions.filter((t) => t.category === 'other' && !t.excluded);
if (other.length) console.log(`Uncategorized: ${[...new Set(other.map((t) => t.description))].join(' | ')}`);
console.log(`Wrote ${out}`);
