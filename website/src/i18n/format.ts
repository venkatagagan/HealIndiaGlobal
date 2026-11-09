/** Formatting helpers for UI copy (English only). */

/** BCP-47 tag used for all Intl formatting on the site. */
export const INTL_LOCALE = 'en';

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

/** Replace `{name}` placeholders. Unknown placeholders are left as-is so missing values are visible. */
export function fmt(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

const pluralRules = new Intl.PluralRules(INTL_LOCALE);

export function plural(forms: Plural, count: number, vars: Vars = {}): string {
  const category = count === 0 && forms.zero ? 'zero' : pluralRules.select(count);
  const template = forms[category as keyof Plural] ?? forms.other;
  return fmt(template, { count: formatNumber(count), ...vars });
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALE, options).format(value);
}

export function formatList(items: string[], type: 'conjunction' | 'disjunction' = 'conjunction') {
  return new Intl.ListFormat(INTL_LOCALE, { style: 'long', type }).format(items);
}

const regionNames = new Intl.DisplayNames([INTL_LOCALE], { type: 'region' });

/** English country name for an ISO 3166-1 alpha-2 code. */
export function countryName(code: string): string {
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
