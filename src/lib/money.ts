/** Money is stored as integer cents everywhere to avoid floating point errors. */

const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

function groupThousands(n: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats cents as e.g. "€1,234.56".
 * sign: 'auto' shows "-" for negatives, 'always' also shows "+", 'never' shows the absolute value.
 */
export function formatMoney(
  cents: number,
  currency = 'EUR',
  sign: 'auto' | 'always' | 'never' = 'auto',
): string {
  const abs = Math.abs(Math.round(cents));
  const whole = groupThousands(String(Math.floor(abs / 100)));
  const frac = String(abs % 100).padStart(2, '0');
  const body = `${currencySymbol(currency)}${whole}.${frac}`;
  if (sign === 'never' || cents === 0) return body;
  if (cents < 0) return `−${body}`;
  return sign === 'always' ? `+${body}` : body;
}

/** Compact form for chart labels: €1.2k, €830 */
export function formatMoneyShort(cents: number, currency = 'EUR'): string {
  const euros = Math.abs(cents) / 100;
  const sym = currencySymbol(currency);
  if (euros >= 1000) return `${sym}${(euros / 1000).toFixed(euros >= 10000 ? 0 : 1)}k`;
  return `${sym}${Math.round(euros)}`;
}

/**
 * Parses an amount string from a bank export into cents.
 * Handles "1,234.56", "1.234,56", "-10.00", "10,00", "+5", "(12.50)", "€ 3,20".
 * Returns null if it can't be parsed.
 */
export function parseAmount(input: string): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d,.\-+]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal separator
    normalized =
      lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = (s.match(/,/g) ?? []).length;
    // "10,50" -> decimal; "1,234" or "1,234,567" -> thousands
    normalized = commas === 1 && /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) ?? []).length;
    normalized = dots > 1 ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}
