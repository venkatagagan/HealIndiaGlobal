/**
 * Staff door (PLAN §3.1). In production nginx serves the admin console at /gahi/ before Next.js, so this handler
 * only runs in development (or when nginx is misconfigured): it redirects to NEXT_PUBLIC_STAFF_URL.
 * Never linked from any page, absent from sitemap.xml and robots.txt, and always sent with noindex.
 */
const STAFF_URL = (process.env.NEXT_PUBLIC_STAFF_URL || 'http://localhost:5176/gahi/').trim();
const STAFF_BASE = STAFF_URL.endsWith('/') ? STAFF_URL : `${STAFF_URL}/`;
const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };

export const dynamic = 'force-dynamic';

async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const incoming = new URL(request.url);
  const target = new URL(path.map(encodeURIComponent).join('/'), STAFF_BASE);
  target.search = incoming.search;
  // Same URL as the request (nginx not routing /gahi/ in production): do not loop.
  if (target.origin === incoming.origin && target.pathname.replace(/\/$/, '') === incoming.pathname.replace(/\/$/, '')) {
    return new Response('Not found', { status: 404, headers: { ...NOINDEX, 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return new Response(null, { status: 307, headers: { ...NOINDEX, Location: target.toString() } });
}

export { handle as GET, handle as HEAD, handle as POST };
