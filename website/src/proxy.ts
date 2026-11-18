import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, cspAnalytics } from '@/lib/csp';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isEnglishOnlyPath,
  isLocale,
  localizePath,
  type Locale,
} from '@/i18n/config';
import { enabledLocalesCached } from '@/i18n/languages';

/** Paths that keep their case (Next internals, the staff door, generated files and assets). */
const KEEP_CASE = /^\/(?:_next\/|api\/|gahi|icons\/|brand\/|content-assets\/)|\.[A-Za-z0-9]+$/;

/** Not pages: Next internals, the API and staff door, generated files, public assets, route handlers at the root. */
const NOT_A_PAGE = /^\/(?:_next|api|gahi|icons|brand|content-assets|sitemap|web-vitals|visitor-country)(?:\/|$)|\.[A-Za-z0-9]+$/;

/** Generated share images live below the language segment (/en/hospitals/x/opengraph-image-…); served as they are. */
const SHARE_IMAGE = /\/(?:opengraph|twitter)-image(?:-[\w-]+)?$/;

/** Crawlers, link previews and tools never get a language redirect: they must see the URL they asked for. */
const BOT =
  /bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|whatsapp|telegram|skype|slack|discord|vkshare|pinterest|lighthouse|pagespeed|headless|inspectiontool|mediapartners|apis-google|feedfetcher|validator|yandex|baidu|petal|semrush|ahrefs|mj12|applebot|amazonbot|gptbot|claude|perplexity|curl|wget|python|node-fetch|undici|axios|go-http|okhttp|java\//i;

/** Best enabled language for an Accept-Language header (q-values respected), or null. */
function preferredLocale(header: string | null, enabled: readonly Locale[]): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { base: (tag ?? '').trim().toLowerCase().split('-')[0] ?? '', q: q === undefined ? 1 : Number(q), i };
    })
    .filter((x) => x.base && x.base !== '*' && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const { base } of ranked) if (isLocale(base) && enabled.includes(base)) return base;
  return null;
}

/** A person opening a page (not a crawler, a prefetch or a client-side navigation request). */
function isFirstDocumentVisit(request: NextRequest): boolean {
  if (request.method !== 'GET') return false;
  if (request.cookies.has(LOCALE_COOKIE)) return false;
  const h = request.headers;
  const ua = h.get('user-agent') ?? '';
  if (!ua || BOT.test(ua)) return false;
  if (h.get('rsc') || h.get('next-router-prefetch') || h.get('purpose') === 'prefetch' || h.get('sec-purpose')?.includes('prefetch')) {
    return false;
  }
  const dest = h.get('sec-fetch-dest');
  return !dest || dest === 'document';
}

async function withCsp(response: NextResponse): Promise<NextResponse> {
  response.headers.set('Content-Security-Policy', buildCsp(await cspAnalytics()));
  return response;
}

/**
 * 1. One URL per page: every public path is lowercase, so /Hospitals or /FAQ answer 308 with the lowercase path
 *    (query string kept) instead of a 404 or a duplicate. Trailing slashes are already removed by next.config
 *    (`trailingSlash: false`).
 * 2. Languages (src/i18n/config.ts): English has no prefix and is rewritten internally to the `[lang]` segment
 *    (/hospitals -> /en/hospitals); /en/... redirects (308) to the unprefixed URL. /ar, /fr, /bn, /ru are served
 *    only while an admin has the language switched on, otherwise they answer 404. English-only pages requested with
 *    a language prefix redirect to the English URL.
 * 3. First visit only (no language cookie, a person rather than a crawler): an English URL redirects once (307) to
 *    the visitor's browser language when it is enabled, and the choice is stored in the cookie. Crawlers always get
 *    the URL they asked for.
 * 4. Content-Security-Policy (src/lib/csp.ts): built per request because the analytics provider is a site setting
 *    that a super admin can change without a redeploy. The other security headers stay in next.config.ts.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (/[A-Z]/.test(pathname) && !KEEP_CASE.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }
  if (NOT_A_PAGE.test(pathname)) return withCsp(NextResponse.next());

  const first = /^\/([a-z]{2})(?=\/|$)/.exec(pathname)?.[1];

  // /en/... : canonical English URLs have no prefix (generated share images excepted).
  if (first === DEFAULT_LOCALE) {
    if (SHARE_IMAGE.test(pathname)) return withCsp(NextResponse.next());
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || '/';
    return NextResponse.redirect(url, 308);
  }

  // /ar/..., /fr/... : served while the language is enabled.
  if (first && isLocale(first)) {
    const rest = pathname.slice(3) || '/';
    if (isEnglishOnlyPath(rest)) {
      const url = request.nextUrl.clone();
      url.pathname = rest;
      return NextResponse.redirect(url, 308);
    }
    const enabled = await enabledLocalesCached();
    if (!enabled.includes(first)) {
      // Rendered by app/[lang]/[...missing] -> the English 404 page with a 404 status.
      const url = request.nextUrl.clone();
      url.pathname = `/${DEFAULT_LOCALE}/language-unavailable`;
      return withCsp(NextResponse.rewrite(url));
    }
    return withCsp(NextResponse.next());
  }

  // English URL. First visit of a person: redirect once to their browser language when it is enabled.
  if (isFirstDocumentVisit(request) && !isEnglishOnlyPath(pathname)) {
    const enabled = await enabledLocalesCached();
    const preferred = enabled.length > 1 ? preferredLocale(request.headers.get('accept-language'), enabled) : null;
    if (preferred && preferred !== DEFAULT_LOCALE) {
      const url = request.nextUrl.clone();
      url.pathname = localizePath(pathname, preferred);
      const response = NextResponse.redirect(url, 307);
      response.headers.set('Cache-Control', 'private, no-store');
      response.headers.set('Vary', 'Accept-Language, Cookie');
      response.cookies.set(LOCALE_COOKIE, preferred, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
      return response;
    }
  }
  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  return withCsp(NextResponse.rewrite(url));
}

export const config = {
  // Pages and route handlers that return documents; not Next's static chunks, the API proxy or image optimizer.
  matcher: ['/((?!_next/static|_next/image|api/).*)'],
};
