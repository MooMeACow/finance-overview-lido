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

/** An import with what's still in it: date range and current number of transactions. */
export type ImportSummary = ImportRecord & {
  first_date: string | null;
  last_date: string | null;
  txn_count: number;
  counted_in_cents: number;
  counted_out_cents: number;
};

export type MonthTotals = { month: string; in_cents: number; out_cents: number };
export type CategoryTotal = { category: string; out_cents: number; count: number };

export type AccountType = 'current' | 'savings';

/** Which imported statements keep this account's balance up to date */
export type AccountLink = 'ing_current' | 'ing_savings' | 'ing_investment' | 'revolut_current' | 'revolut_crypto';

/** A bank account, savings account, cash, etc. The balance is entered by you. */
export type Account = {
  id: number;
  name: string;
  /** 'current' = everyday money; 'savings' = savings and investments */
  type: AccountType;
  /** Optional: imported statements that update the balance automatically */
  link: AccountLink | null;
  /** The balance you typed in, valid on the day of `updated_at` */
  balance_cents: number;
  currency: string;
  updated_at: string;
};

export type PlanFrequency = 'monthly' | 'yearly' | 'once';

/** A planned future expense or income: recurring (rent, salary) or one-off (a trip). */
export type Plan = {
  id: number;
  kind: 'expense' | 'income';
  description: string;
  amount_cents: number; // always positive; `kind` says the direction
  category: string;
  frequency: PlanFrequency;
  start_date: string; // "YYYY-MM-DD": the (first) date it happens
  end_date: string | null; // last possible date for recurring plans, or null
};

/** Monthly spending limit for a category */
export type Budget = { category: string; limit_cents: number };

export type DebtDirection = 'owed_to_me' | 'i_owe';

/** Money someone owes you, or you owe someone. Kept separate from your account total. */
export type Debt = {
  id: number;
  person: string;
  direction: DebtDirection;
  amount_cents: number; // what's still open, in your main currency
  note: string | null; // e.g. the original amount in another currency: "₱30,000"
  updated_at: string;
};
