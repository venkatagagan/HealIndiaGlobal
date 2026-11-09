import type { MetadataRoute } from 'next';
import { SITE_NOINDEX } from '@/config/site';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/config';
import { absoluteUrl } from '@/lib/seo';

const NOINDEX_PAGES = ['/search', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/accept-invite'];

/** The staff door (/gahi) is deliberately not listed here (it is noindex and never linked). */
export default function robots(): MetadataRoute.Robots {
  if (SITE_NOINDEX) return { rules: [{ userAgent: '*', disallow: '/' }] };
  // The same pages in every language (/ar/search, /fr/login, ...).
  const prefixes = ['', ...LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => `/${l}`)];
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/web-vitals', ...prefixes.flatMap((p) => NOINDEX_PAGES.map((page) => `${p}${page}`))],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
