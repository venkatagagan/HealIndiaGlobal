import { revalidatePath, revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { submitIndexNow } from '@/lib/indexnow';
import { clearCspCache } from '@/lib/csp';
import { SITE_TAG } from '@/lib/site-config';
import {
  MAX_BODY_BYTES,
  clientKey,
  configuredSecret,
  parseRevalidationBody,
  rateLimit,
  recordFailedSecret,
  secretFromHeaders,
  secretMatches,
} from '@/lib/revalidation';

/**
 * On-demand ISR revalidation for catalogue changes (called by the backend; contract in src/lib/revalidation.ts and
 * README). Not reachable through the public edge in production (nginx sends /api/ to the backend), so the backend
 * calls the website service directly, e.g. http://website:3000/api/revalidate. The secret is never logged.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export async function POST(request: Request) {
  const client = clientKey(request.headers);
  const limit = rateLimit(client);
  if (!limit.allowed) return json(429, { error: 'too many requests' }, { 'Retry-After': String(limit.retryAfter || 60) });

  const secret = configuredSecret();
  if (!secret) return json(503, { error: 'revalidation is not configured' });
  if (!secretMatches(secretFromHeaders(request.headers), secret)) {
    recordFailedSecret(client);
    return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
  }

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'body too large' });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json(413, { error: 'body too large' });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'body must be JSON' });
  }

  const parsed = parseRevalidationBody(body);
  if (!parsed.ok) return json(400, { error: parsed.error });

  // Stale-while-revalidate: visitors keep getting the last good page while the new one renders. The `site` tag
  // (website & contact settings edited in the staff console) expires at once, so the next visit shows the change.
  for (const tag of parsed.plan.tags) revalidateTag(tag, tag === SITE_TAG ? { expire: 0 } : 'max');
  if (parsed.plan.tags.includes(SITE_TAG)) clearCspCache();
  for (const path of parsed.plan.paths) revalidatePath(path);
  console.info(`[revalidate] ${parsed.plan.tags.length} tag(s), ${parsed.plan.paths.length} path(s) marked stale`);
  // Tell IndexNow engines (Bing, Yandex, ...) about the changed pages, after the response is sent (no-op unless
  // INDEXNOW_KEY is set; see src/lib/indexnow.ts).
  if (parsed.plan.paths.length) after(async () => console.info(`[revalidate] ${await submitIndexNow(parsed.plan.paths)}`));
  return json(200, { revalidated: true, tags: parsed.plan.tags, paths: parsed.plan.paths, now: Date.now() });
}

export function GET() {
  return json(405, { error: 'use POST' }, { Allow: 'POST' });
}
