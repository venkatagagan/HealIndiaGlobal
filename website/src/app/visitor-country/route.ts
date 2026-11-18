/**
 * GET /visitor-country -> {"country": "NG" | null, "source": "header" | "accept_language" | "none"}
 *
 * Called once by the browser (components/visitor-provider.tsx) to default the "Prices for <country>" control and the
 * display currency. Personal, so it is never cached (no-store) and pages themselves stay identical for everyone.
 *
 * A CDN country header is used only when SITE_TRUST_COUNTRY_HEADER lists it (comma-separated header names, e.g.
 * "cloudfront-viewer-country" or "cf-ipcountry"); set it only when the CDN overwrites that header on every request,
 * otherwise anyone could choose their "country" by sending it. Without it the region of Accept-Language is used.
 */
import { acceptLanguageCountry, normalizeCountry, type CountrySource } from '@/lib/visitor';

export const dynamic = 'force-dynamic';

function trustedHeaders(): string[] {
  return (process.env.SITE_TRUST_COUNTRY_HEADER || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9-]{1,64}$/.test(h));
}

export function GET(request: Request) {
  let country: string | null = null;
  let source: CountrySource = 'none';
  const names = trustedHeaders();
  for (const name of names) {
    country = normalizeCountry(request.headers.get(name));
    if (country) {
      source = 'header';
      break;
    }
  }
  if (!country) {
    country = acceptLanguageCountry(request.headers.get('accept-language'));
    if (country) source = 'accept_language';
  }
  return Response.json(
    { country, source },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: ['Accept-Language', ...names].join(', '),
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}
