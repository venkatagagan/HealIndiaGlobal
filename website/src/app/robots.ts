import type { MetadataRoute } from 'next';
import { SITE_NOINDEX } from '@/config/site';
import { absoluteUrl } from '@/lib/seo';

/** The staff door (/gahi) is deliberately not listed here (it is noindex and never linked). */
export default function robots(): MetadataRoute.Robots {
  if (SITE_NOINDEX) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/web-vitals', '/search', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/accept-invite'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
