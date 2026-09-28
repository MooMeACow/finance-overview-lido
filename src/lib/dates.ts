/**
 * Dates are stored as "YYYY-MM-DD HH:MM:SS" strings (local time, no timezone).
 * A month is identified by its key "YYYY-MM".
 */

export type DateFormat = 'YMD' | 'DMY' | 'MDY';

export const DATE_FORMATS: { key: DateFormat; label: string }[] = [
  { key: 'YMD', label: 'Year-Month-Day' },
  { key: 'DMY', label: 'Day-Month-Year' },
  { key: 'MDY', label: 'Month-Day-Year' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}

/** Parses a bank date string. Returns "YYYY-MM-DD HH:MM:SS" or null. */
export function parseDate(input: string, format: DateFormat): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;

  let datePart = s;
  let time = '00:00:00';
  const timeMatch = s.match(/[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    datePart = s.slice(0, timeMatch.index);
    time = `${pad(Number(timeMatch[1]))}:${timeMatch[2]}:${timeMatch[3] ?? '00'}`;
  }
  datePart = datePart.trim();

  let y: number, m: number, d: number;
  const compact = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact && format === 'YMD') {
    [y, m, d] = [Number(compact[1]), Number(compact[2]), Number(compact[3])];
  } else {
    const parts = datePart.split(/[-/.]/).map((p) => p.trim());
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const n = parts.map(Number);
    if (format === 'YMD') [y, m, d] = n;
    else if (format === 'DMY') [d, m, y] = n;
    else [m, d, y] = n;
    if (y < 100) y += 2000;
  }
  if (!valid(y, m, d)) return null;
  return `${y}-${pad(m)}-${pad(d)} ${time}`;
}

/** Picks the first format that parses every sample, or null. */
export function detectDateFormat(samples: string[]): DateFormat | null {
  const filled = samples.filter((s) => s && s.trim());
  if (filled.length === 0) return null;
  for (const f of ['YMD', 'DMY', 'MDY'] as DateFormat[]) {
    if (filled.every((s) => parseDate(s, f) !== null)) return f;
  }
  return null;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthLabel(key: string, short = false): string {
  const [y, m] = key.split('-').map(Number);
  const name = MONTHS[m - 1] ?? '';
  return short ? name.slice(0, 3) : `${name} ${y}`;
}

/** "Wed 24 Sep" */
export function dayLabel(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${names[wd]} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

export function todayString(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
