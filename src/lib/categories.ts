/**
 * Categories and automatic categorization rules.
 * Rules are simple, case-insensitive keyword matches on the description.
 * Anything unmatched goes to "Other" so you can recategorize it in the app;
 * when you do, the app remembers your choice for future imports.
 */

export type CategoryKey =
  | 'income'
  | 'topup'
  | 'transfers'
  | 'savings'
  | 'groceries'
  | 'eating_out'
  | 'transport'
  | 'shopping'
  | 'subscriptions'
  | 'entertainment'
  | 'health'
  | 'cash'
  | 'bills'
  | 'housing'
  | 'fees'
  | 'other';

export type Category = { key: CategoryKey; label: string; icon: string };

export const CATEGORIES: Category[] = [
  { key: 'income', label: 'Income', icon: 'cash-outline' },
  { key: 'topup', label: 'Top-ups', icon: 'add-circle-outline' },
  { key: 'transfers', label: 'Transfers', icon: 'swap-horizontal-outline' },
  { key: 'savings', label: 'Savings & investing', icon: 'trending-up-outline' },
  { key: 'groceries', label: 'Groceries', icon: 'cart-outline' },
  { key: 'eating_out', label: 'Eating out', icon: 'restaurant-outline' },
  { key: 'transport', label: 'Transport', icon: 'bus-outline' },
  { key: 'shopping', label: 'Shopping', icon: 'bag-handle-outline' },
  { key: 'subscriptions', label: 'Subscriptions', icon: 'repeat-outline' },
  { key: 'entertainment', label: 'Going out & fun', icon: 'film-outline' },
  { key: 'health', label: 'Health & care', icon: 'medkit-outline' },
  { key: 'bills', label: 'Bills & utilities', icon: 'flash-outline' },
  { key: 'housing', label: 'Housing', icon: 'home-outline' },
  { key: 'fees', label: 'Fees', icon: 'receipt-outline' },
  { key: 'cash', label: 'Cash withdrawals', icon: 'cash-outline' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function getCategory(key: string): Category {
  return BY_KEY.get(key as CategoryKey) ?? BY_KEY.get('other')!;
}

const KEYWORDS: [CategoryKey, string[]][] = [
  ['savings', ['revolut digital assets', 'savings', 'vault', 'spaarrekening', 'beleggingsrek', 'round-up to savings']],
  ['cash', ['geldmaat', 'cash withdrawal']],
  ['groceries', ['albert heijn', ' ah ', 'jumbo', 'lidl', 'aldi', 'dirk van den broek', 'ekoplaza', 'plus supermarkt', 'amazing oriental']],
  ['eating_out', ['thuisbezorgd', 'uber eats', 'deliveroo', 'restaurant', 'cafe', 'café', 'mcdonald', 'starbucks', 'broodje']],
  ['entertainment', ['vue cinemas', 'pathe', 'pathé', 'cinema', 'bioscoop', 'ticketmaster']],
  ['health', ['chiropra', 'apotheek', 'pharmacy', 'huisarts', 'tandarts', 'fysio']],
  ['shopping', ['etos', 'kruidvat', 'tk maxx', 'prenatal', 'hema', ' action ', 'bol.com', 'zalando', 'primark']],
  ['transport', ['ns groep', 'ov-chipkaart', 'uber', 'bolt', 'shell', ' bp ', 'esso', 'parkeren', 'parking']],
  ['subscriptions', ['netflix', 'spotify', 'anthropic', 'openai', 'disney', 'youtube', 'icloud', 'apple.com', 'apple']],
  ['bills', ['vattenfall', 'eneco', 'essent', 'ziggo', 'kpn', 'odido', 'vodafone', 'waternet', 'verzekering', 'insurance']],
  ['housing', [' huur', ' rent ', 'hypotheek', 'mortgage', 'makelaardij']],
  ['fees', ['plan fee', 'service fee', 'bank fee', 'kosten betaal', 'kosten ing']],
  ['income', ['salary', 'salaris', ' loon', 'payroll']],
];

/**
 * @param description transaction description
 * @param amountCents signed amount
 * @param kind optional bank-specific type (e.g. Revolut "Topup", "Transfer", "Charge")
 * @param userRules exact-description overrides the user has taught the app (lowercased keys)
 */
export function categorize(
  description: string,
  amountCents: number,
  kind?: string,
  userRules?: Map<string, string>,
): CategoryKey {
  const desc = description.trim().toLowerCase();
  const learned = userRules?.get(desc);
  if (learned && BY_KEY.has(learned as CategoryKey)) return learned as CategoryKey;

  const k = (kind ?? '').toLowerCase();
  if (k === 'topup') return 'topup';
  if (k === 'charge' || k === 'fee') return 'fees';
  if (k === 'cash') return 'cash';

  const padded = ` ${desc} `;
  for (const [cat, words] of KEYWORDS) {
    if (words.some((w) => padded.includes(w))) return cat;
  }

  if (k === 'transfer' || desc.startsWith('to ') || desc.includes('transfer to')) {
    return amountCents < 0 ? 'transfers' : 'income';
  }
  if (amountCents > 0) return 'income';
  return 'other';
}
