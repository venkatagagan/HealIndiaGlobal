/**
 * Languages switched on by the admins: GET {API}/i18n/languages (public; only enabled languages). Kept free of
 * `server-only` / React imports because the proxy (src/proxy.ts) loads it too.
 *
 * - Pages and the sitemap use `getEnabledLocales()` (ISR fetch, revalidated every I18N_REVALIDATE_SECONDS).
 * - The proxy uses `enabledLocalesCached()` (in-memory, same TTL).
 * When the API is unreachable (e.g. a CI build) only English is enabled, so builds work without the API.
 */
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';

export const I18N_REVALIDATE_SECONDS = Number(process.env.I18N_REVALIDATE_SECONDS || 300);
export const I18N_TAG = 'i18n';
const API_BASE = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1')
  .trim()
  .replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 4000);

export interface LanguageInfo {
  code: Locale;
  name: string;
  nativeName: string;
  rtl: boolean;
}

/** After a network failure, skip the API for a while instead of waiting for a timeout on every page. */
let unreachableUntil = 0;
let warned = false;

function parse(body: unknown): LanguageInfo[] {
  const list = Array.isArray(body) ? body : Array.isArray((body as { items?: unknown })?.items) ? (body as { items: unknown[] }).items : [];
  const out: LanguageInfo[] = [];
  for (const raw of list) {
    const r = raw as Record<string, unknown>;
    if (!isLocale(r.code) || r.enabled === false) continue;
    out.push({
      code: r.code,
      name: typeof r.name === 'string' ? r.name : r.code,
      nativeName: typeof r.native_name === 'string' ? r.native_name : r.code,
      rtl: r.rtl === true,
    });
  }
  return out;
}

/** English plus the enabled languages, in LOCALES order. */
function normalise(list: LanguageInfo[]): Locale[] {
  const codes = new Set<Locale>([DEFAULT_LOCALE, ...list.map((l) => l.code)]);
  return LOCALES.filter((l) => codes.has(l));
}

async function fetchLanguages(init: RequestInit & { next?: { revalidate?: number; tags?: string[] } }): Promise<LanguageInfo[] | null> {
  if (Date.now() < unreachableUntil) return null;
  try {
    const res = await fetch(`${API_BASE}/i18n/languages`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parse(await res.json());
  } catch (err) {
    unreachableUntil = Date.now() + 15_000;
    if (!warned) console.warn(`[i18n] enabled languages unavailable, using English only (${(err as Error).message})`);
    warned = true;
    return null;
  }
}

/** Enabled languages with their names (English always first). */
export async function getEnabledLanguages(): Promise<LanguageInfo[]> {
  const list = (await fetchLanguages({ next: { revalidate: I18N_REVALIDATE_SECONDS, tags: [I18N_TAG] } })) ?? [];
  const byCode = new Map(list.map((l) => [l.code, l]));
  return normalise(list).map(
    (code) => byCode.get(code) ?? { code, name: 'English', nativeName: 'English', rtl: false },
  );
}

export async function getEnabledLocales(): Promise<Locale[]> {
  return (await getEnabledLanguages()).map((l) => l.code);
}

// ------------------------------------------------------------------------------- proxy (in-memory cache)
const KEY = Symbol.for('hig.i18n.enabled');
interface Entry {
  value: Locale[] | null;
  expires: number;
  pending: Promise<Locale[] | null> | null;
}

function store(): { [KEY]?: Entry } {
  return globalThis as unknown as { [KEY]?: Entry };
}

/** Enabled locales for the proxy: cached in memory, refreshed in the background; English only until known. */
export async function enabledLocalesCached(): Promise<Locale[]> {
  const g = store();
  let entry = g[KEY];
  const now = Date.now();
  if (!entry || (entry.expires <= now && !entry.pending)) {
    const previous = entry?.value ?? null;
    const pending = fetchLanguages({ cache: 'no-store', signal: AbortSignal.timeout(1500) }).then((list) => {
      const value = list ? normalise(list) : previous;
      g[KEY] = { value, expires: Date.now() + (list ? I18N_REVALIDATE_SECONDS * 1000 : 15_000), pending: null };
      return value;
    });
    entry = { value: previous, expires: entry?.expires ?? 0, pending };
    g[KEY] = entry;
  }
  const value = entry.pending && !entry.value ? await entry.pending : entry.value;
  return value ?? [DEFAULT_LOCALE];
}

export function clearEnabledLocalesCache(): void {
  delete store()[KEY];
}
