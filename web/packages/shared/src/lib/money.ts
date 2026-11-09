/**
 * Money helpers. Amounts are integer minor units + ISO-4217 currency (PLAN section 3).
 * Exponents are identical to the backend (`app.core.money.CURRENCY_EXPONENTS`):
 * 0 for JPY/KRW, 3 for KWD/BHD/OMR, otherwise 2.
 */
export const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = {
  JPY: 0,
  KRW: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

/** Supported patient currencies (platform setting default `supported_currencies`). */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SAR',
  'INR',
  'NGN',
  'KES',
  'BDT',
  'AUD',
  'CAD',
  'OMR',
  'QAR',
  'KWD',
] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

/** 123456 minor USD -> 1234.56 (number; for charts/inputs only - never for arithmetic you send back). */
export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

/**
 * Parse a user-entered major amount ("1,234.5") into integer minor units without float rounding errors.
 * Returns null when the input is not a valid non-negative amount.
 */
export function toMinor(major: string | number, currency: string): number | null {
  const exp = currencyExponent(currency);
  const text = (typeof major === 'number' ? major.toFixed(exp) : major).replace(/[\s,_]/g, '').trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) return null;
  const sign = match[1] ? -1 : 1;
  const whole = match[2] || '0';
  const frac = (match[3] ?? '').padEnd(exp, '0');
  if (frac.length > exp && /[1-9]/.test(frac.slice(exp))) {
    // too many decimals: round half-up on the first extra digit
    const base = Number(whole) * 10 ** exp + Number(frac.slice(0, exp) || '0');
    const roundUp = Number(frac[exp]) >= 5 ? 1 : 0;
    return sign * (base + roundUp);
  }
  return sign * (Number(whole) * 10 ** exp + Number(frac.slice(0, exp) || '0'));
}

export interface FormatMoneyOptions {
  /** e.g. "$12K" (charts, KPI tiles) */
  compact?: boolean;
  /** drop ".00" when the amount is whole */
  trimZeros?: boolean;
  /** show "+" for positive values */
  signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never';
  /** "symbol" (default), "code" (USD 1,200.00), "narrowSymbol" */
  currencyDisplay?: 'symbol' | 'code' | 'narrowSymbol' | 'name';
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string | undefined, currency: string, digits: number, opts: FormatMoneyOptions) {
  const key = [locale ?? '', currency, digits, opts.compact ? 1 : 0, opts.signDisplay ?? '', opts.currencyDisplay ?? ''].join('|');
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: opts.currencyDisplay ?? 'symbol',
      minimumFractionDigits: opts.compact ? 0 : digits,
      maximumFractionDigits: opts.compact ? 1 : digits,
      notation: opts.compact ? 'compact' : 'standard',
      signDisplay: opts.signDisplay ?? 'auto',
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

/**
 * formatMoney(250000, 'USD') -> "$2,500.00"; formatMoney(1500, 'KWD') -> "KWD 1.500"; null -> "—".
 * @param locale BCP-47 locale, defaults to the browser locale
 */
export function formatMoney(
  minor: number | null | undefined,
  currency: string | null | undefined,
  locale?: string,
  options: FormatMoneyOptions = {},
): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return '—';
  const ccy = (currency || 'INR').toUpperCase();
  const exp = currencyExponent(ccy);
  const major = minor / 10 ** exp;
  const digits = options.trimZeros && Number.isInteger(major) ? 0 : exp;
  try {
    return getFormatter(locale, ccy, digits, options).format(major);
  } catch {
    // unknown currency code for Intl
    return `${ccy} ${major.toFixed(digits)}`;
  }
}

/** "$2,500 – $4,000" */
export function formatMoneyRange(
  minMinor: number | null | undefined,
  maxMinor: number | null | undefined,
  currency: string | null | undefined,
  locale?: string,
): string {
  const opts: FormatMoneyOptions = { trimZeros: true };
  if (minMinor == null && maxMinor == null) return '—';
  if (minMinor == null || maxMinor == null || minMinor === maxMinor) {
    return formatMoney(minMinor ?? maxMinor, currency, locale, opts);
  }
  return `${formatMoney(minMinor, currency, locale, opts)} – ${formatMoney(maxMinor, currency, locale, opts)}`;
}

/** Basis points -> "15%" / "1.5%" */
export function formatBps(bps: number | null | undefined, fractionDigits = 2): string {
  if (bps === null || bps === undefined) return '—';
  const pct = bps / 100;
  return `${Number(pct.toFixed(fractionDigits))}%`;
}

/** 15 (percent) -> 1500 bps */
export function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

/** 0.4567 -> "45.7%" */
export function formatPercent(ratio: number | null | undefined, fractionDigits = 1): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${Number((ratio * 100).toFixed(fractionDigits))}%`;
}

/** Currency symbol for a code in the given locale ("USD" -> "$"). */
export function currencySymbol(currency: string, locale?: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}
