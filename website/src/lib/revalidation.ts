import 'server-only';

/**
 * On-demand revalidation contract (POST /api/revalidate, see README "On-demand revalidation").
 *
 *   POST /api/revalidate
 *   Authorization: Bearer <REVALIDATE_SECRET>
 *   Content-Type: application/json
 *   {"tags": ["hospital:<slug>", "doctor:<slug>", "procedure:<slug>", "specialty:<slug>", "destination:<slug>", "catalog", "site"],
 *    "paths": ["/optional/site/path"]}
 *
 * Entity tags also revalidate their collection (a changed hospital changes the hospital directory too) and the
 * entity's page path. Revalidation is stale-while-revalidate: the next visit gets the old page while the new one
 * renders, so a failed render (API down + SITE_REQUIRE_LIVE_DATA) never replaces a good page.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { routes } from '@/lib/routes';

export const MAX_TAGS = 100;
export const MAX_PATHS = 50;
export const MAX_BODY_BYTES = 16 * 1024;
/** Shorter secrets are treated as "not configured" (the endpoint then answers 503). */
export const MIN_SECRET_LENGTH = 32;

/** `site` = website & contact settings (src/lib/site-config.ts): expired immediately, see the route handler. */
const COLLECTIONS = ['catalog', 'specialties', 'procedures', 'hospitals', 'doctors', 'destinations', 'fx', 'content', 'site'] as const;
const ENTITY_KINDS = ['hospital', 'doctor', 'procedure', 'specialty', 'destination'] as const;
type EntityKind = (typeof ENTITY_KINDS)[number];

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/;
const ENTITY_COLLECTION: Record<EntityKind, string | null> = {
  hospital: 'hospitals',
  doctor: 'doctors',
  procedure: 'procedures',
  specialty: 'specialties',
  // Destinations are derived from the hospital list plus city guides; there is no destination fetch tag.
  destination: null,
};

export interface RevalidationPlan {
  tags: string[];
  paths: string[];
}

export type ParseResult = { ok: true; plan: RevalidationPlan } | { ok: false; error: string };

function entityPath(kind: EntityKind, slug: string): string | null {
  switch (kind) {
    case 'hospital':
      return routes.hospital(slug);
    case 'doctor':
      return routes.doctor(slug);
    case 'specialty':
      return routes.specialty(slug);
    case 'destination':
      return routes.city(slug);
    default:
      // Procedure URLs include the specialty slug; the `procedure:<slug>` fetch tag covers those pages.
      return null;
  }
}

function isSafeSitePath(value: string): boolean {
  return (
    value.length <= 300 &&
    /^\/[A-Za-z0-9\-._~/%]*$/.test(value) &&
    !value.includes('..') &&
    !value.includes('//') &&
    !/^\/(api|_next)(\/|$)/.test(value)
  );
}

/** Validate the JSON body and expand it into the tags and paths to revalidate. */
export function parseRevalidationBody(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body must be a JSON object' };
  const { tags: rawTags, paths: rawPaths } = body as { tags?: unknown; paths?: unknown };
  if (rawTags !== undefined && !Array.isArray(rawTags)) return { ok: false, error: '"tags" must be an array of strings' };
  if (rawPaths !== undefined && !Array.isArray(rawPaths)) return { ok: false, error: '"paths" must be an array of strings' };
  const tagList = (rawTags ?? []) as unknown[];
  const pathList = (rawPaths ?? []) as unknown[];
  if (!tagList.length && !pathList.length) return { ok: false, error: 'nothing to revalidate: send "tags" and/or "paths"' };
  if (tagList.length > MAX_TAGS) return { ok: false, error: `at most ${MAX_TAGS} tags per request` };
  if (pathList.length > MAX_PATHS) return { ok: false, error: `at most ${MAX_PATHS} paths per request` };

  const tags = new Set<string>();
  const paths = new Set<string>();
  for (const raw of tagList) {
    if (typeof raw !== 'string') return { ok: false, error: 'tags must be strings' };
    const tag = raw.trim();
    if ((COLLECTIONS as readonly string[]).includes(tag)) {
      tags.add(tag);
      if (tag === 'destinations') paths.add(routes.destinations);
      continue;
    }
    const i = tag.indexOf(':');
    const kind = tag.slice(0, i) as EntityKind;
    const slug = tag.slice(i + 1);
    if (i <= 0 || !(ENTITY_KINDS as readonly string[]).includes(kind) || !SLUG.test(slug)) {
      return { ok: false, error: `unknown tag "${tag.slice(0, 80)}"` };
    }
    tags.add(`${kind}:${slug}`);
    const collection = ENTITY_COLLECTION[kind];
    if (collection) tags.add(collection);
    const path = entityPath(kind, slug);
    if (path) paths.add(path);
    if (kind === 'destination') paths.add(routes.destinations);
  }
  for (const raw of pathList) {
    if (typeof raw !== 'string' || !isSafeSitePath(raw.trim())) return { ok: false, error: 'paths must be site paths like "/hospitals/apollo"' };
    paths.add(raw.trim().replace(/(.)\/+$/, '$1'));
  }
  return { ok: true, plan: { tags: [...tags], paths: [...paths] } };
}

// ------------------------------------------------------------------------------------------- secret
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** The configured secret, or null when it is missing or too short to be safe. */
export function configuredSecret(): string | null {
  const secret = process.env.REVALIDATE_SECRET?.trim() ?? '';
  return secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

/** Constant-time comparison (both sides are hashed first, so lengths never leak). */
export function secretMatches(provided: string | null | undefined, secret: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(secret));
}

/** `Authorization: Bearer <secret>` (preferred) or `X-Revalidate-Secret: <secret>`. Never from the query string. */
export function secretFromHeaders(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    return m?.[1]?.trim() || null;
  }
  return headers.get('x-revalidate-secret')?.trim() || null;
}

// --------------------------------------------------------------------------------------- rate limit
/**
 * Small in-memory fixed-window limiter (per server process). Requests: 30/min per client; failed secrets:
 * 10 per 15 min per client and 30 per 15 min overall (stops guessing even when the client address is spoofed).
 */
interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

function hit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfter: number } {
  if (buckets.size > 5000) {
    for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
  }
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  w.count += 1;
  return { allowed: w.count <= limit, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
}

function peek(key: string, limit: number, now = Date.now()): { blocked: boolean; retryAfter: number } {
  const w = buckets.get(key);
  if (!w || w.resetAt <= now) return { blocked: false, retryAfter: 0 };
  return { blocked: w.count >= limit, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
}

const FAIL_WINDOW = 15 * 60_000;
const FAIL_LIMIT_CLIENT = 10;
const FAIL_LIMIT_GLOBAL = 30;

export function clientKey(headers: Headers): string {
  return (headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);
}

/** Checked before the secret: request budget plus any lock-out from earlier failed secrets. */
export function rateLimit(client: string): { allowed: boolean; retryAfter: number } {
  const failedClient = peek(`fail:${client}`, FAIL_LIMIT_CLIENT);
  const failedGlobal = peek('fail:*', FAIL_LIMIT_GLOBAL);
  if (failedClient.blocked || failedGlobal.blocked) {
    return { allowed: false, retryAfter: Math.max(failedClient.retryAfter, failedGlobal.retryAfter) };
  }
  return hit(`req:${client}`, 30, 60_000);
}

export function recordFailedSecret(client: string): void {
  hit(`fail:${client}`, FAIL_LIMIT_CLIENT, FAIL_WINDOW);
  hit('fail:*', FAIL_LIMIT_GLOBAL, FAIL_WINDOW);
}
