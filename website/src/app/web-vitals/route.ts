/**
 * Optional built-in receiver for the Web Vitals reporter (src/components/web-vitals.tsx): set
 * NEXT_PUBLIC_WEB_VITALS_URL=/web-vitals (build time) and WEB_VITALS_LOG=true (runtime). Each valid beacon is
 * written as one JSON log line ("[web-vitals] {...}") for your log pipeline; nothing is stored and no IP address or
 * user agent is logged. Answers 404 when WEB_VITALS_LOG is not "true".
 */
export const dynamic = 'force-dynamic';

const NAMES = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'FID']);
const RATINGS = new Set(['good', 'needs-improvement', 'poor']);
const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function POST(request: Request) {
  if (process.env.WEB_VITALS_LOG !== 'true') return new Response(null, { status: 404, headers: HEADERS });
  if (Number(request.headers.get('content-length') || 0) > 2048) return new Response(null, { status: 413, headers: HEADERS });
  let data: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 2048) return new Response(null, { status: 413, headers: HEADERS });
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400, headers: HEADERS });
  }
  const { name, value, rating, path, navigationType } = data;
  if (typeof name !== 'string' || !NAMES.has(name) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return new Response(null, { status: 400, headers: HEADERS });
  }
  const safePath = typeof path === 'string' && /^\/[A-Za-z0-9\-._~/%]{0,300}$/.test(path) ? path : null;
  console.info(
    `[web-vitals] ${JSON.stringify({
      name,
      value,
      rating: typeof rating === 'string' && RATINGS.has(rating) ? rating : null,
      path: safePath,
      navigationType: typeof navigationType === 'string' ? navigationType.slice(0, 20) : null,
    })}`,
  );
  return new Response(null, { status: 204, headers: HEADERS });
}

export function GET() {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
}
