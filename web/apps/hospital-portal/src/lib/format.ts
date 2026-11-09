/**
 * Formatting helpers (money in integer minor units, dates). Mirrors the contract of @hig/shared's
 * lib/money.ts + lib/dates.ts, which the shared package does not export yet (no `src/lib/index.ts`).
 */
import { addDays, format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------------------------------------ money
const CURRENCY_EXPONENTS: Readonly<Record<string, number>> = { JPY: 0, KRW: 0, KWD: 3, BHD: 3, OMR: 3 };

export const SUPPORTED_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SAR',
  'NGN',
  'KES',
  'BDT',
  'AUD',
  'CAD',
  'OMR',
  'QAR',
  'KWD',
] as const;

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

/** minor -> major number (charts and form defaults only, never for arithmetic sent back). */
export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

/** "1,234.50" -> 123450 (integer minor units) without float rounding; null when invalid/negative. */
export function toMinor(major: string | number, currency: string): number | null {
  const exp = currencyExponent(currency);
  const text = (typeof major === 'number' ? major.toFixed(exp) : major).replace(/[\s,_]/g, '').trim();
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  const whole = match[1] || '0';
  const fracRaw = match[2] ?? '';
  if (fracRaw.length > exp && /[1-9]/.test(fracRaw.slice(exp))) return null;
  const frac = fracRaw.slice(0, exp).padEnd(exp, '0');
  const value = Number(whole) * 10 ** exp + Number(frac || '0');
  return Number.isSafeInteger(value) ? value : null;
}

/** minor -> editable major string ("1234.5" -> "1234.50"). */
export function minorToInput(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return '';
  return fromMinor(minor, currency).toFixed(currencyExponent(currency));
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  minor: number | null | undefined,
  currency: string | null | undefined,
  options: { compact?: boolean; trimZeros?: boolean } = {},
): string {
  if (minor === null || minor === undefined || Number.isNaN(minor)) return '—';
  const ccy = (currency || 'INR').toUpperCase();
  const exp = currencyExponent(ccy);
  const major = minor / 10 ** exp;
  const digits = options.compact ? 0 : options.trimZeros && Number.isInteger(major) ? 0 : exp;
  const key = `${ccy}|${digits}|${options.compact ? 1 : 0}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(ccy === 'INR' ? 'en-IN' : undefined, {
        style: 'currency',
        currency: ccy,
        minimumFractionDigits: digits,
        maximumFractionDigits: options.compact ? 1 : digits,
        notation: options.compact ? 'compact' : 'standard',
      });
    } catch {
      return `${ccy} ${major.toFixed(digits)}`;
    }
    formatters.set(key, fmt);
  }
  return fmt.format(major);
}

export function formatMoneyRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (min == null && max == null) return '—';
  if (min == null || max == null || min === max) return formatMoney(min ?? max, currency, { trimZeros: true });
  return `${formatMoney(min, currency, { trimZeros: true })} – ${formatMoney(max, currency, { trimZeros: true })}`;
}

// ------------------------------------------------------------------------------------------------ dates
type DateInput = string | number | Date | null | undefined;

export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const d = typeof value === 'number' ? new Date(value) : parseISO(value);
  return isValid(d) ? d : null;
}

export function formatDate(value: DateInput, pattern = 'd MMM yyyy', fallback = '—'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : fallback;
}

export function formatDateTime(value: DateInput, fallback = '—'): string {
  return formatDate(value, 'd MMM yyyy, HH:mm', fallback);
}

export function formatRelative(value: DateInput, fallback = '—'): string {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : fallback;
}

/** Date -> "YYYY-MM-DD" (local calendar date). */
export function toIsoDate(value: DateInput): string {
  const d = toDate(value);
  return d ? format(d, 'yyyy-MM-dd') : '';
}

export function isoDateFromToday(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd');
}

/** ISO timestamp -> value for <input type="datetime-local"> (local time). */
export function toDateTimeLocal(value: DateInput): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : '';
}

/** <input type="datetime-local"> value -> ISO-8601 UTC string. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : null;
}

/** "2026-10" -> "Oct 26" */
export function formatMonth(month: string): string {
  const d = toDate(/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month);
  return d ? format(d, 'MMM yy') : month;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ISO-3166 alpha-2 -> country name ("NG" -> "Nigeria"). */
export function countryName(code: string | null | undefined): string {
  if (!code) return '—';
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Split "a, b\nc" into trimmed non-empty unique values. */
export function splitList(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[\n,]/)) {
    const v = part.trim();
    if (v) seen.add(v);
  }
  return [...seen];
}

/** Split multi-line text into trimmed non-empty unique lines (commas are kept). */
export function splitLines(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
}

/** Parse an optional integer/decimal input; '' -> null, invalid -> undefined. */
export function parseOptionalNumber(text: string, opts: { integer?: boolean; min?: number; max?: number } = {}):
  | number
  | null
  | undefined {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  if (opts.integer && !Number.isInteger(n)) return undefined;
  if (opts.min !== undefined && n < opts.min) return undefined;
  if (opts.max !== undefined && n > opts.max) return undefined;
  return n;
}
