/** Money helpers shared by server and client components. Amounts are integer minor units (PLAN §3). */
import type { FxTable } from './data/types';

const THREE_DECIMALS = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD']);
const ZERO_DECIMALS = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX']);

export function currencyExponent(ccy: string): number {
  const code = ccy.toUpperCase();
  if (THREE_DECIMALS.has(code)) return 3;
  if (ZERO_DECIMALS.has(code)) return 0;
  return 2;
}

export function minorToMajor(minor: number, ccy: string): number {
  return minor / 10 ** currencyExponent(ccy);
}

export function majorToMinor(major: number, ccy: string): number {
  return Math.round(major * 10 ** currencyExponent(ccy));
}

/** Convert minor units between currencies with an INR-per-unit table. Returns null when a rate is missing. */
export function convertMinor(minor: number, from: string, to: string, fx: FxTable): number | null {
  if (from === to) return minor;
  const rateFrom = from === 'INR' ? 1 : fx[from];
  const rateTo = to === 'INR' ? 1 : fx[to];
  if (!rateFrom || !rateTo) return null;
  const inrMajor = minorToMajor(minor, from) * rateFrom;
  return majorToMinor(inrMajor / rateTo, to);
}

/** Round to `digits` significant figures - used for approximate conversions ("≈ $4,400"). */
export function roundSignificant(value: number, digits = 2): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const step = 10 ** Math.max(0, magnitude - digits + 1);
  return Math.round(value / step) * step;
}

function formatter(intlLocale: string, ccy: string): Intl.NumberFormat {
  // Rupee amounts always use Indian digit grouping (₹3,50,000), whatever the page locale.
  return new Intl.NumberFormat(ccy.toUpperCase() === 'INR' ? 'en-IN' : intlLocale, {
    style: 'currency',
    currency: ccy,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

export function formatMoney(minor: number, ccy: string, intlLocale: string, opts: { approx?: boolean } = {}): string {
  let major = minorToMajor(minor, ccy);
  if (opts.approx) major = roundSignificant(major, 2);
  return formatter(intlLocale, ccy).format(major);
}

export function formatMoneyRange(
  minMinor: number,
  maxMinor: number,
  ccy: string,
  intlLocale: string,
  opts: { approx?: boolean } = {},
): string {
  let a = minorToMajor(minMinor, ccy);
  let b = minorToMajor(maxMinor, ccy);
  if (opts.approx) {
    a = roundSignificant(a, 2);
    b = roundSignificant(b, 2);
  }
  const nf = formatter(intlLocale, ccy);
  if (a === b) return nf.format(a);
  try {
    return nf.formatRange(a, b);
  } catch {
    return `${nf.format(a)} – ${nf.format(b)}`;
  }
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Compact rupee amount for tight spaces: ₹45,000 / ₹3.5 lakh / ₹1.2 crore (other currencies: normal format). */
export function formatMoneyCompact(minor: number, ccy: string, intlLocale = 'en'): string {
  if (ccy.toUpperCase() !== 'INR') return formatMoney(minor, ccy, intlLocale);
  const major = minorToMajor(minor, ccy);
  const trim = (n: number) => String(Math.round(n * 10) / 10).replace(/\.0$/, '');
  if (major >= 1e7) return `₹${trim(major / 1e7)} crore`;
  if (major >= 1e5) return `₹${trim(major / 1e5)} lakh`;
  return formatMoney(minor, ccy, intlLocale);
}
