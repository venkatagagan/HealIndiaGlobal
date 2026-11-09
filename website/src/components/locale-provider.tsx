'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, INTL_LOCALES, type Locale } from '@/i18n/config';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Makes the page language available to client components (links, Intl formatting). Set by the root layout. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useIntlLocale(): string {
  return INTL_LOCALES[useContext(LocaleContext)];
}
