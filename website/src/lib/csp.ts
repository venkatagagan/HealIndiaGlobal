/**
 * Content-Security-Policy for every page, built per request by src/proxy.ts (it used to be static in next.config.ts).
 *
 * The static parts come from the environment (API origin, Google sign-in, contact endpoint, Web Vitals collector,
 * remote image hosts). The analytics part is dynamic: the provider can be changed by a super admin in the staff
 * console (System -> Website & contact), so the proxy reads it from GET /site-config (cached in memory for
 * CSP_CONFIG_TTL_SECONDS, default 30 s, and dropped on a `site` revalidation) and allows only that provider's
 * origins, plus the NEXT_PUBLIC_ANALYTICS_* fallback provider when one is set.
 *
 * Kept free of `server-only` / React imports: the proxy bundle loads it.
 */
import { analyticsCspSources, envAnalyticsConfig, resolveAnalytics, type AnalyticsConfig } from '@/config/analytics';
import { CONTACT_ENDPOINT } from '@/config/site';

const isProd = process.env.NODE_ENV === 'production';

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const googleEnabled = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim());
/**
 * Contact form target (src/config/site.ts): NEXT_PUBLIC_CONTACT_ENDPOINT, else {NEXT_PUBLIC_API_BASE}/site/enquiries.
 * A relative URL (e.g. "/api/v1/site/enquiries" behind the edge nginx) is covered by 'self' and gives null here.
 */
const contactEndpointOrigin = originOf(CONTACT_ENDPOINT);
/** Optional Web Vitals beacon target (src/components/web-vitals.tsx); a relative URL needs no CSP entry. */
const webVitalsOrigin = originOf(process.env.NEXT_PUBLIC_WEB_VITALS_URL);
/** Extra hosts allowed for remote images (hospital logos, doctor photos), e.g. "https://cdn.example.com". */
export const remoteImageOrigins = (process.env.IMAGE_REMOTE_ORIGINS || '')
  .split(',')
  .map((s) => originOf(s.trim()))
  .filter((s): s is string => Boolean(s));

const google = 'https://accounts.google.com';

export function buildCsp(analytics: AnalyticsConfig[]): string {
  const sources = analytics.map(analyticsCspSources);
  const uniq = (list: (string | null)[]) => [...new Set(list.filter((s): s is string => Boolean(s)))];
  const list = (items: (string | null)[]) => {
    const u = uniq(items);
    return u.length ? ` ${u.join(' ')}` : '';
  };
  return [
    `default-src 'self'`,
    // Static/ISR pages cannot carry per-request nonces, so inline scripts (RSC payload) need 'unsafe-inline'.
    `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}${list([googleEnabled ? `${google}/gsi/client` : null, ...sources.flatMap((s) => s.script)])}`,
    `style-src 'self' 'unsafe-inline'${googleEnabled ? ` ${google}/gsi/style` : ''}`,
    `img-src 'self' data: blob:${list([...remoteImageOrigins, ...sources.flatMap((s) => s.img)])}`,
    `font-src 'self' data:`,
    `connect-src 'self'${list([
      ...(isProd ? [] : ['ws:', 'wss:']),
      contactEndpointOrigin,
      webVitalsOrigin,
      googleEnabled ? `${google}/gsi/` : null,
      ...sources.flatMap((s) => s.connect),
    ])}`,
    googleEnabled ? `frame-src ${google}/gsi/` : `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

// ------------------------------------------------------------------------------- analytics from the API
const API_BASE = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1')
  .trim()
  .replace(/\/+$/, '');
const TTL_MS = Number(process.env.CSP_CONFIG_TTL_SECONDS || 30) * 1000;
/** Shared through globalThis so POST /api/revalidate (tag `site`) can drop it: see clearCspCache(). */
const KEY = Symbol.for('hig.csp.analytics');

interface Entry {
  value: AnalyticsConfig | null;
  expires: number;
  pending: Promise<AnalyticsConfig | null> | null;
}

function store(): { [KEY]?: Entry } {
  return globalThis as unknown as { [KEY]?: Entry };
}

export function clearCspCache(): void {
  delete store()[KEY];
}

async function fetchAnalytics(): Promise<AnalyticsConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/site-config`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const a = ((await res.json()) as { analytics?: Record<string, unknown> }).analytics ?? {};
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    return resolveAnalytics({
      provider: s(a.provider),
      plausibleDomain: s(a.plausible_domain),
      plausibleScriptUrl: s(a.plausible_script_url),
      ga4MeasurementId: s(a.ga4_measurement_id),
    });
  } catch {
    return null;
  }
}

/** Analytics providers the CSP must allow right now (settings provider + environment fallback). */
export async function cspAnalytics(): Promise<AnalyticsConfig[]> {
  const env = envAnalyticsConfig();
  const g = store();
  let entry = g[KEY];
  const now = Date.now();
  if (!entry || (entry.expires <= now && !entry.pending)) {
    const previous = entry?.value ?? null;
    const pending = fetchAnalytics().then((value) => {
      // Unreachable API: keep the last known provider for another TTL rather than breaking a working script.
      g[KEY] = { value: value ?? previous, expires: Date.now() + TTL_MS, pending: null };
      return value ?? previous;
    });
    entry = { value: previous, expires: entry?.expires ?? 0, pending };
    g[KEY] = entry;
  }
  const value = entry.pending && !entry.value ? await entry.pending : entry.value;
  return [env, ...(value ? [value] : [])];
}
