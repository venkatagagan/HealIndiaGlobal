import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/config';

/**
 * Layout body for sections that exist in English only (cost guides, patient stories, procedure x city pages: their
 * text is built from English sentences). Other languages 404 here; src/proxy.ts already redirects /ar/costs etc. to
 * the English URL, and links from translated pages point to English (isEnglishOnlyPath in src/i18n/config.ts).
 */
export async function EnglishOnly({ children }: { children: ReactNode }) {
  if ((await getLocale()) !== DEFAULT_LOCALE) notFound();
  return children;
}

/** generateStaticParams helper: prerender English-only routes for English alone. */
export function englishOnlyParams<T>(lang: string | undefined, params: () => T[] | Promise<T[]>): T[] | Promise<T[]> {
  return lang && lang !== DEFAULT_LOCALE ? [] : params();
}
