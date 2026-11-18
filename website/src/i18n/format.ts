/**
 * Formatting helpers for UI copy. Numbers, plurals, lists, dates and country names follow the language of the page
 * being rendered (./request.ts); pass `intlLocale` explicitly where there is no server render (client components).
 */
import { requestIntlLocale } from './request';

/** Plural forms (CLDR categories). English uses one/other; an explicit zero form is supported. */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type Vars = Record<string, string | number>;

/** BCP-47 tag of the current page language (server render), e.g. "ar". */
export function intlLocale(): string {
  return requestIntlLocale();
}

/** Replace `{name}` placeholders. Unknown placeholders are left as-is so missing values are visible. */
export function fmt(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export function plural(forms: Plural, count: number, vars: Vars = {}, locale = intlLocale()): string {
  const category = count === 0 && forms.zero ? 'zero' : new Intl.PluralRules(locale).select(count);
  const template = forms[category as keyof Plural] ?? forms.other;
  return fmt(template, { count: formatNumber(count, undefined, locale), ...vars });
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions, locale = intlLocale()): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatList(items: string[], type: 'conjunction' | 'disjunction' = 'conjunction', locale = intlLocale()) {
  return new Intl.ListFormat(locale, { style: 'long', type }).format(items);
}

/** Calendar date ("12 March 2026" / "12 mars 2026"); ISO strings without a time are read as UTC dates. */
export function formatDate(value: string | Date, locale = intlLocale()): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Country name in the page language for an ISO 3166-1 alpha-2 code. */
export function countryName(code: string, locale = intlLocale()): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
