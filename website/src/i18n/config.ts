/**
 * Website languages (client-safe: no server imports). English is the default and lives at the root without a prefix
 * (/hospitals); every other language lives under its code (/ar/hospitals). Which of these languages are actually
 * routed and linked is decided at runtime by the admins (GET /api/v1/i18n/languages, see ./languages.ts).
 *
 * Adding a language: add the code here (and to RTL_LOCALES when it is right-to-left), add
 * dictionaries/<code>.ts and the maps below. See docs/i18n/README.md.
 */

export const LOCALES = ['en', 'ar', 'fr', 'bn', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

/** Cookie that remembers the visitor's language choice (set by the language switcher and the first-visit redirect). */
export const LOCALE_COOKIE = 'hig_lang';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** BCP-47 tag used for Intl formatting (numbers, dates, lists, country names). */
export const INTL_LOCALES: Record<Locale, string> = { en: 'en', ar: 'ar', fr: 'fr', bn: 'bn', ru: 'ru' };

/** OpenGraph `og:locale` values. */
export const OG_LOCALES: Record<Locale, string> = { en: 'en_US', ar: 'ar_AR', fr: 'fr_FR', bn: 'bn_BD', ru: 'ru_RU' };

/** Names shown in the language switcher when the API does not send them (each in its own language). */
export const NATIVE_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  bn: 'বাংলা',
  ru: 'Русский',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/**
 * Pages that exist in English only (content-growth pages built from English sentences: cost guides, patient stories
 * and procedure x city pages). Links to them from a translated page go to the English URL.
 */
const ENGLISH_ONLY = [/^\/costs(\/|$)/, /^\/stories(\/|$)/, /^\/treatments\/[^/]+\/[^/]+\/[^/]+\/?$/];

export function isEnglishOnlyPath(path: string): boolean {
  return ENGLISH_ONLY.some((re) => re.test(path));
}

/**
 * Split "/ar/hospitals" into { locale: 'ar', path: '/hospitals' }; unprefixed paths are English. The internal English
 * route "/en/hospitals" (what `usePathname()` reports while the proxy's rewrite is rendered on the server) also maps
 * to { locale: 'en', path: '/hospitals' }.
 */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const m = /^\/([a-z]{2})(?=\/|$)(.*)$/.exec(pathname);
  if (m && isLocale(m[1])) return { locale: m[1], path: m[2] || '/' };
  return { locale: DEFAULT_LOCALE, path: pathname || '/' };
}

/**
 * Site path for a language: '/hospitals' -> '/ar/hospitals' (English: unchanged). Accepts '' for home, keeps query
 * strings and fragments, and leaves absolute URLs, non-page paths and already-prefixed paths alone.
 */
export function localizePath(path: string, locale: Locale): string {
  const target = path || '/';
  if (locale === DEFAULT_LOCALE || !target.startsWith('/') || target.startsWith('//')) return target;
  const pathname = target.split(/[?#]/, 1)[0]!;
  const rest = target.slice(pathname.length);
  if (/^\/(api|gahi|icons|brand|content-assets|sitemap|_next)(\/|$)/.test(pathname)) return target;
  if (/\.[A-Za-z0-9]+$/.test(pathname)) return target;
  if (/^\/[a-z]{2}(\/|$)/.test(pathname) && isLocale(pathname.slice(1, 3))) return target;
  if (isEnglishOnlyPath(pathname)) return target;
  return `${pathname === '/' ? `/${locale}` : `/${locale}${pathname}`}${rest}`;
}
