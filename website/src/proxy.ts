import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, cspAnalytics } from '@/lib/csp';

/** Paths that keep their case (Next internals, the staff door, generated files and assets). */
const KEEP_CASE = /^\/(?:_next\/|api\/|gahi|icons\/|brand\/|content-assets\/)|\.[A-Za-z0-9]+$/;

/**
 * 1. One URL per page: every public path is lowercase, so /Hospitals or /FAQ answer 308 with the lowercase path
 *    (query string kept) instead of a 404 or a duplicate. Trailing slashes are already removed by next.config
 *    (`trailingSlash: false`).
 * 2. Content-Security-Policy (src/lib/csp.ts): built per request because the analytics provider is a site setting
 *    that a super admin can change without a redeploy. The other security headers stay in next.config.ts.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (/[A-Z]/.test(pathname) && !KEEP_CASE.test(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.toLowerCase();
    return NextResponse.redirect(url, 308);
  }
  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', buildCsp(await cspAnalytics()));
  return response;
}

export const config = {
  // Pages and route handlers that return documents; not Next's static chunks, the API proxy or image optimizer.
  matcher: ['/((?!_next/static|_next/image|api/).*)'],
};
