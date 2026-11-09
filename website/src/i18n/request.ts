/**
 * The language of the page being rendered, for synchronous helpers (Intl formatting in ./format.ts, `href()` in
 * lib/routes.ts) that cannot await `next/root-params`. `getDictionary()` sets it for the current server render;
 * React's `cache` scopes it to one request. Outside a server render (client components) it stays English, so client
 * components receive their locale explicitly (LocaleProvider / props).
 */
import { cache } from 'react';
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from './config';

const store = cache((): { locale: Locale } => ({ locale: DEFAULT_LOCALE }));

export function setRequestLocale(locale: Locale): void {
  store().locale = locale;
}

export function requestLocale(): Locale {
  return store().locale;
}

export function requestIntlLocale(): string {
  return INTL_LOCALES[requestLocale()];
}
