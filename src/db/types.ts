/** Shared data shapes used by both storage backends (SQLite on phones, browser storage on web). */

export type Txn = {
  id: number;
  date: string;
  description: string;
  amount_cents: number;
  currency: string;
  category: string;
  note: string | null;
  excluded: number; // 1 = left out of totals (e.g. moving money between your own accounts)
  source: string;
  import_id: number | null;
};

export type ImportRecord = {
  id: number;
  file_name: string;
  source: string;
  imported_at: string;
  row_count: number;
};

export type MonthTotals = { month: string; in_cents: number; out_cents: number };
export type CategoryTotal = { category: string; out_cents: number; count: number };
