/**
 * Keeping account balances up to date from imported statements.
 *
 * You type in an account's balance on a certain day. Transactions imported
 * later that are dated AFTER that day are added on top, so the balance follows
 * your statements without typing it in again. Transactions on or before that
 * day are assumed to be included in the balance you typed.
 *
 * Money moving between your own accounts is applied to both sides: a €100
 * transfer to your investment account lowers ING current by €100 (it's in the
 * ING statement) and raises ING investment by €100, so the overall total
 * doesn't change.
 */
import type { Account, AccountLink, Txn } from '../db/types';

export const ACCOUNT_LINKS: { key: AccountLink; label: string; hint: string }[] = [
  { key: 'ing_current', label: 'ING current account', hint: 'All transactions in your ING statements' },
  { key: 'ing_savings', label: 'ING savings (Oranje Spaarrekening)', hint: 'Transfers to/from savings and round-ups in your ING statements' },
  { key: 'ing_investment', label: 'ING investment account', hint: 'Transfers to/from your investment account in your ING statements' },
  { key: 'revolut_current', label: 'Revolut current account', hint: 'All transactions in your Revolut statements' },
  { key: 'revolut_crypto', label: 'Revolut crypto', hint: 'Transfers to Revolut Digital Assets (not price changes)' },
];

export function linkLabel(link: AccountLink | null): string | null {
  return ACCOUNT_LINKS.find((l) => l.key === link)?.label ?? null;
}

type TxnLike = Pick<Txn, 'date' | 'description' | 'amount_cents' | 'source'>;

const SAVINGS = /spaarrekening|round-up to savings|^to savings|^from savings/i;
const INVESTMENT = /^(to|from) investment account/i;
const CRYPTO = /revolut digital assets/i;

/** How much a transaction changes an account with this link (0 if it doesn't touch it). */
export function accountDelta(link: AccountLink, t: TxnLike): number {
  switch (link) {
    case 'ing_current':
      return t.source === 'ing' ? t.amount_cents : 0;
    case 'ing_savings':
      // Money leaving ING current into savings is a negative amount there: savings goes up
      return t.source === 'ing' && SAVINGS.test(t.description) ? -t.amount_cents : 0;
    case 'ing_investment':
      return t.source === 'ing' && INVESTMENT.test(t.description) ? -t.amount_cents : 0;
    case 'revolut_current':
      return t.source === 'revolut' ? t.amount_cents : 0;
    case 'revolut_crypto':
      return t.source === 'revolut' && CRYPTO.test(t.description) ? -t.amount_cents : 0;
  }
}

/** The day the typed-in balance was valid ("YYYY-MM-DD"). */
export const balanceDay = (a: Pick<Account, 'updated_at'>) => a.updated_at.slice(0, 10);

export type LiveAccount = Account & {
  /** Balance you typed in */
  entered_cents: number;
  /** Change from transactions imported after that day */
  change_cents: number;
  /** Number of transactions that changed it */
  change_count: number;
};

/** Current balance of each account: what you typed in plus linked transactions after that day. */
export function liveBalances(accounts: Account[], txns: TxnLike[]): LiveAccount[] {
  return accounts.map((a) => {
    let change = 0;
    let count = 0;
    if (a.link) {
      const since = balanceDay(a);
      for (const t of txns) {
        if (t.date.slice(0, 10) <= since) continue;
        const d = accountDelta(a.link, t);
        if (d !== 0) {
          change += d;
          count++;
        }
      }
    }
    return { ...a, entered_cents: a.balance_cents, change_cents: change, change_count: count, balance_cents: a.balance_cents + change };
  });
}

/** Earliest balance day among linked accounts, to know which transactions to load. */
export function earliestLinkedDay(accounts: Account[]): string | null {
  const days = accounts.filter((a) => a.link).map(balanceDay).sort();
  return days[0] ?? null;
}
