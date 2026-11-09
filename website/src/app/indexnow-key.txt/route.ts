import { indexNowKey } from '@/lib/indexnow';

/** IndexNow key verification file (see src/lib/indexnow.ts). 404 unless a key is configured (setting or env). */
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = await indexNowKey();
  if (!key) return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
  return new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=3600' } });
}
