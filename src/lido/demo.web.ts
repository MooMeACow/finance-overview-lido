import { useEffect, useState } from 'react';

/**
 * The public demo build (EXPO_PUBLIC_DEMO=1, see scripts/deploy-pages.mjs): a first-time visitor
 * gets a year of made-up finances so there is something to look at. Local builds stay empty.
 */
export const isDemo = process.env.EXPO_PUBLIC_DEMO === '1';

const DATA_KEY = 'finance-overview:v1';
const SEEDED_KEY = 'finance-overview:demo-seeded';
const MOCK_URL = '/mock/finance-backup-mock-85k.json';

type Dated = { date: string };
type DemoData = {
  transactions?: Dated[];
  imports?: { imported_at: string }[];
  accounts?: { updated_at: string }[];
  plans?: { start_date: string; end_date: string | null }[];
  debts?: { updated_at: string }[];
};

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromDay = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * Moves the whole mock year forward so its last transaction is yesterday, shifting every date by
 * the same number of days (so balances, plans and statements still line up). Keeps the demo
 * looking current long after the file was made.
 */
export function shiftToYesterday<T extends DemoData>(data: T, now = new Date()): T {
  const last = (data.transactions ?? []).reduce((m, t) => Math.max(m, toDay(t.date)), -Infinity);
  const delta = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - DAY - last;
  if (!Number.isFinite(delta) || delta <= 0) return data;
  const move = (s: string) => fromDay(toDay(s) + delta) + s.slice(10);
  return {
    ...data,
    transactions: data.transactions?.map((t) => ({ ...t, date: move(t.date) })),
    imports: data.imports?.map((i) => ({ ...i, imported_at: move(i.imported_at) })),
    accounts: data.accounts?.map((a) => ({ ...a, updated_at: move(a.updated_at) })),
    plans: data.plans?.map((p) => ({ ...p, start_date: move(p.start_date), end_date: p.end_date ? move(p.end_date) : null })),
    debts: data.debts?.map((d) => ({ ...d, updated_at: move(d.updated_at) })),
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // blocked by privacy settings: the app will say so itself
  }
}

function needsSeed(): boolean {
  const s = isDemo ? storage() : null;
  if (!s) return false;
  try {
    return !s.getItem(SEEDED_KEY) && !s.getItem(DATA_KEY);
  } catch {
    return false;
  }
}

/**
 * Fills this browser's storage with the mock year before the app first reads it, once per
 * browser (deleting the demo data to try your own statements sticks). Returns true once the
 * app can start; a missing or slow mock file just means starting empty, like the normal app.
 */
export function useDemoData(): boolean {
  const [ready, setReady] = useState(() => !needsSeed());
  useEffect(() => {
    if (ready) return;
    let alive = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 6000);
    fetch(MOCK_URL, { cache: 'no-store', signal: abort.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((backup: { format?: string; data?: DemoData }) => {
        const s = storage();
        if (!s || backup?.format !== 'finance-overview-backup' || !backup.data) return;
        if (!s.getItem(DATA_KEY)) s.setItem(DATA_KEY, JSON.stringify(shiftToYesterday(backup.data)));
        s.setItem(SEEDED_KEY, '1');
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [ready]);
  return ready;
}
