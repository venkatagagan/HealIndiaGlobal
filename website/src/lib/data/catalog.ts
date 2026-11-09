import 'server-only';

/**
 * Public catalogue data for pages: API first (ISR-cached fetch, revalidate ~1h), offline fallback second.
 *
 * DATA_FALLBACK controls when fallback data may be used:
 *   auto  (default) - whenever the API is unreachable or errors (build and runtime)
 *   build           - only during `next build`; at runtime errors propagate so ISR keeps serving the last good page
 *   off             - never (the build fails if the API is down)
 * Pages show a visible "sample data" notice and are marked noindex whenever fallback data was used.
 *
 * SITE_REQUIRE_LIVE_DATA=true (production): fallback data is never used in a production build or ISR render. The
 * error is logged and rethrown, so `next build` fails and ISR keeps serving the last good page instead of
 * publishing noindex sample-data pages. Development (`next dev`) is not affected.
 *
 * Cache tags (on-demand revalidation via POST /api/revalidate, see README): every catalogue fetch carries `catalog`,
 * list fetches carry their collection tag (`specialties`, `procedures`, `hospitals`, `doctors`, `fx`, `content`) and
 * detail fetches their entity tag (`hospital:<slug>`, `doctor:<slug>`, `procedure:<slug>`, `specialty:<slug>`).
 */
import { cache } from 'react';
import { slugify } from '@/lib/slug';
import { fallbackCatalog, fallbackFeaturedSlugs, toDoctorCard, toHospitalCard } from './fallback';
import type {
  CostComparison,
  CulturalTip,
  DoctorCard,
  DoctorDetail,
  FxTable,
  Helplines,
  HospitalCard,
  HospitalDetail,
  Loaded,
  Procedure,
  Specialty,
} from './types';

export const REVALIDATE_SECONDS = Number(process.env.REVALIDATE_SECONDS || 3600);
const API_BASE = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1')
  .trim()
  .replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 4000);
const POLICY = (process.env.DATA_FALLBACK || 'auto').trim() as 'auto' | 'build' | 'off';

const isBuildPhase = () => process.env.NEXT_PHASE === 'phase-production-build';

/** True when production builds/renders must use live catalogue data (SITE_REQUIRE_LIVE_DATA=true). */
export function requireLiveData(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.SITE_REQUIRE_LIVE_DATA?.trim().toLowerCase() === 'true';
}

function refuseFallback(label: string, err: unknown): void {
  const phase = isBuildPhase() ? 'build' : 'ISR render';
  console.error(
    `[catalog] SITE_REQUIRE_LIVE_DATA=true: ${label} could not be loaded from the API during ${phase}; refusing to ` +
      `publish fallback data (${(err as Error)?.message ?? String(err)}). ` +
      (isBuildPhase() ? 'The build fails.' : 'The last good page keeps being served.'),
  );
}

function fallbackAllowed(): boolean {
  if (requireLiveData()) return false;
  if (POLICY === 'off') return false;
  if (POLICY === 'build') return isBuildPhase();
  return true;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** After a network failure, skip the API for a while instead of waiting for a timeout on every page. */
let unreachableUntil = 0;
const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[catalog] ${message}`);
}

async function apiGet<T>(path: string, tags: string[] = [], revalidate = REVALIDATE_SECONDS): Promise<T> {
  if (Date.now() < unreachableUntil) throw new ApiError(0, 'API recently unreachable');
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate, tags: ['catalog', ...tags] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    unreachableUntil = Date.now() + (isBuildPhase() ? 300_000 : 15_000);
    throw new ApiError(0, `API unreachable at ${API_BASE}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(res.status, `GET ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function load<T>(label: string, fromApi: () => Promise<T>, fromFallback: () => T): Promise<Loaded<T>> {
  try {
    return { data: await fromApi(), source: 'api' };
  } catch (err) {
    if (requireLiveData()) refuseFallback(label, err);
    if (!fallbackAllowed()) throw err;
    warnOnce(label, `${label}: using fallback data (${(err as Error).message})`);
    return { data: fromFallback(), source: 'fallback' };
  }
}

type PageLike<T> = T[] | { items?: T[]; pages?: number; total?: number };

function itemsOf<T>(resp: PageLike<T>): T[] {
  if (Array.isArray(resp)) return resp;
  return Array.isArray(resp?.items) ? resp.items : [];
}

/** Fetch every page of a paginated list endpoint (page_size 100, capped). */
async function apiGetAll<T>(path: string, tags: string[] = [], maxPages = 30): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const first = await apiGet<PageLike<T>>(`${path}${sep}page=1&page_size=100`, tags);
  const items = itemsOf(first);
  const pages = Array.isArray(first) ? 1 : Math.min(first.pages ?? 1, maxPages);
  for (let page = 2; page <= pages; page += 1) {
    items.push(...itemsOf(await apiGet<PageLike<T>>(`${path}${sep}page=${page}&page_size=100`, tags)));
  }
  return items;
}

const enc = encodeURIComponent;

// ------------------------------------------------------------------------------------------- specialties
export const getSpecialties = cache(
  (): Promise<Loaded<Specialty[]>> =>
    load(
      'specialties',
      async () => itemsOf(await apiGet<PageLike<Specialty>>('/specialties', ['specialties'])),
      () => fallbackCatalog().specialties,
    ),
);

export const getSpecialty = cache(async (slug: string): Promise<Loaded<Specialty | null>> => {
  const all = await getSpecialties();
  return { data: all.data.find((s) => s.slug === slug) ?? null, source: all.source };
});

// -------------------------------------------------------------------------------------------- procedures
export const getProcedures = cache(
  (): Promise<Loaded<Procedure[]>> =>
    load(
      'procedures',
      () => apiGetAll<Procedure>('/procedures', ['procedures']),
      () => fallbackCatalog().procedures,
    ),
);

export const getProcedure = cache(async (slug: string): Promise<Loaded<Procedure | null>> => {
  const list = await getProcedures();
  if (list.source === 'fallback') {
    return { data: fallbackCatalog().procedures.find((p) => p.slug === slug) ?? null, source: 'fallback' };
  }
  try {
    const detail = await apiGet<Procedure>(`/procedures/${enc(slug)}`, [`procedure:${slug}`]);
    return { data: { ...detail, benchmarks: detail.benchmarks ?? [] }, source: 'api' };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { data: null, source: 'api' };
    const fromList = list.data.find((p) => p.slug === slug);
    if (fromList) return { data: { ...fromList, benchmarks: fromList.benchmarks ?? [] }, source: 'api' };
    if (requireLiveData()) refuseFallback(`procedure ${slug}`, err);
    if (!fallbackAllowed()) throw err;
    return { data: fallbackCatalog().procedures.find((p) => p.slug === slug) ?? null, source: 'fallback' };
  }
});

// --------------------------------------------------------------------------------------------- hospitals
export const getHospitals = cache(
  (): Promise<Loaded<HospitalCard[]>> =>
    load(
      'hospitals',
      () => apiGetAll<HospitalCard>('/hospitals?sort=rating', ['hospitals']),
      () => fallbackCatalog().hospitals.map(toHospitalCard),
    ),
);

export const getHospital = cache(async (slug: string): Promise<Loaded<HospitalDetail | null>> => {
  const list = await getHospitals();
  if (list.source === 'fallback') {
    return { data: fallbackCatalog().hospitals.find((h) => h.slug === slug) ?? null, source: 'fallback' };
  }
  try {
    const h = await apiGet<HospitalDetail>(`/hospitals/${enc(slug)}`, [`hospital:${slug}`]);
    return {
      data: { ...h, doctors: h.doctors ?? [], procedures: h.procedures ?? [], reviews: h.reviews ?? [] },
      source: 'api',
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { data: null, source: 'api' };
    if (requireLiveData()) refuseFallback(`hospital ${slug}`, err);
    if (!fallbackAllowed()) throw err;
    return { data: fallbackCatalog().hospitals.find((h) => h.slug === slug) ?? null, source: 'fallback' };
  }
});

export const getHospitalsForProcedure = cache(async (procedureSlug: string): Promise<Loaded<HospitalCard[]>> => {
  const list = await getHospitals();
  if (list.source === 'api') {
    try {
      return { data: await apiGetAll<HospitalCard>(`/hospitals?procedure=${enc(procedureSlug)}&sort=rating`, ['hospitals', `procedure:${procedureSlug}`]), source: 'api' };
    } catch (err) {
      if (requireLiveData()) refuseFallback('hospital list', err);
      if (!fallbackAllowed()) throw err;
    }
  }
  const data = fallbackCatalog()
    .hospitals.filter((h) => h.procedures.some((p) => p.procedure.slug === procedureSlug))
    .map(toHospitalCard);
  return { data, source: 'fallback' };
});

export const getHospitalsForSpecialty = cache(async (specialtySlug: string): Promise<Loaded<HospitalCard[]>> => {
  const list = await getHospitals();
  if (list.source === 'api') {
    try {
      return { data: await apiGetAll<HospitalCard>(`/hospitals?specialty=${enc(specialtySlug)}&sort=rating`, ['hospitals', `specialty:${specialtySlug}`]), source: 'api' };
    } catch (err) {
      if (requireLiveData()) refuseFallback('hospital list', err);
      if (!fallbackAllowed()) throw err;
    }
  }
  const fb = fallbackCatalog();
  const name = fb.specialties.find((s) => s.slug === specialtySlug)?.name;
  const data = fb.hospitals.filter((h) => !!name && h.specialties.includes(name)).map(toHospitalCard);
  return { data, source: 'fallback' };
});

/** Hospital procedure prices for one procedure across hospitals (from hospital details). */
export const getProcedurePricesByHospital = cache(async (procedureSlug: string) => {
  const hospitals = await getHospitalsForProcedure(procedureSlug);
  const details = await Promise.all(hospitals.data.slice(0, 12).map((h) => getHospital(h.slug)));
  const prices = new Map<string, { min: number | null; max: number | null; currency: string; success: number | string | null }>();
  for (const d of details) {
    const hp = d.data?.procedures.find((p) => p.procedure.slug === procedureSlug);
    if (d.data && hp) {
      prices.set(d.data.slug, {
        min: hp.price_min_minor,
        max: hp.price_max_minor,
        currency: hp.currency,
        success: hp.success_rate_pct,
      });
    }
  }
  return prices;
});

export function featuredOrder(hospitals: HospitalCard[], source: Loaded<unknown>['source']): HospitalCard[] {
  if (source === 'fallback') {
    const featured = new Set(fallbackFeaturedSlugs());
    return [...hospitals].sort((a, b) => Number(featured.has(b.slug)) - Number(featured.has(a.slug)));
  }
  return hospitals;
}

// ----------------------------------------------------------------------------------------------- doctors
export const getDoctors = cache(
  (): Promise<Loaded<DoctorCard[]>> =>
    load(
      'doctors',
      () => apiGetAll<DoctorCard>('/doctors', ['doctors']),
      () => fallbackCatalog().doctors.map(toDoctorCard),
    ),
);

export const getDoctor = cache(async (slug: string): Promise<Loaded<DoctorDetail | null>> => {
  const list = await getDoctors();
  if (list.source === 'fallback') {
    return { data: fallbackCatalog().doctors.find((d) => d.slug === slug) ?? null, source: 'fallback' };
  }
  const card = list.data.find((d) => d.slug === slug || d.id === slug);
  if (!card) return { data: null, source: 'api' };
  try {
    const d = await apiGet<DoctorDetail>(`/doctors/${enc(card.id)}`, [`doctor:${card.slug}`]);
    return {
      data: { ...d, procedures: d.procedures ?? [], sub_specialties: d.sub_specialties ?? [] },
      source: 'api',
    };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { data: null, source: 'api' };
    if (requireLiveData()) refuseFallback(`doctor ${slug}`, err);
    if (!fallbackAllowed()) throw err;
    return { data: fallbackCatalog().doctors.find((d) => d.slug === slug) ?? null, source: 'fallback' };
  }
});

// ------------------------------------------------------------------------------------- cost & content
export const getCostComparison = cache(
  async (procedure: string, country: string, currency: string): Promise<CostComparison | null> => {
    const list = await getProcedures();
    if (list.source !== 'api') return null;
    try {
      return await apiGet<CostComparison>(
        `/cost-comparison?procedure=${enc(procedure)}&country=${enc(country)}&currency=${enc(currency)}`,
        [`procedure:${procedure}`],
      );
    } catch {
      return null;
    }
  },
);

type FxResponse =
  | { quote_currency?: string; currency?: string; code?: string; rate: number | string }[]
  | { items?: { quote_currency?: string; currency?: string; rate: number | string }[]; rates?: Record<string, number | string> }
  | Record<string, number | string>;

function parseFx(resp: FxResponse): FxTable {
  const out: FxTable = { INR: 1 };
  const rows = Array.isArray(resp) ? resp : Array.isArray((resp as { items?: unknown }).items) ? (resp as { items: [] }).items : null;
  if (rows) {
    for (const r of rows as { quote_currency?: string; currency?: string; code?: string; rate: number | string }[]) {
      const ccy = (r.quote_currency ?? r.currency ?? r.code ?? '').toUpperCase();
      const rate = Number(r.rate);
      if (ccy && rate > 0) out[ccy] = rate;
    }
    return out;
  }
  const map = ((resp as { rates?: Record<string, number | string> }).rates ?? resp) as Record<string, unknown>;
  for (const [ccy, rate] of Object.entries(map)) {
    const value = Number(rate);
    if (/^[A-Z]{3}$/.test(ccy) && value > 0) out[ccy] = value;
  }
  return out;
}

export const getFxRates = cache(
  (): Promise<Loaded<FxTable>> =>
    load(
      'fx',
      async () => {
        const fx = parseFx(await apiGet<FxResponse>('/content/fx-rates', ['fx']));
        if (Object.keys(fx).length < 2) throw new ApiError(0, 'empty fx table');
        return fx;
      },
      () => fallbackCatalog().fx,
    ),
);

/** Source and newest as-of timestamp of the live FX table (null when the API is unavailable). Same cached fetch. */
export const getFxMeta = cache(async (): Promise<{ source: string | null; asOf: string | null } | null> => {
  try {
    const rows = await apiGet<{ source?: string | null; as_of?: string | null }[]>('/content/fx-rates');
    if (!Array.isArray(rows) || !rows.length) return null;
    const asOf = rows.map((r) => r.as_of ?? '').filter(Boolean).sort().pop() ?? null;
    const sources = [...new Set(rows.map((r) => r.source?.trim() ?? '').filter(Boolean))];
    return { source: sources.join(', ') || null, asOf };
  } catch {
    return null;
  }
});

export const getCulturalTips = cache(
  (): Promise<Loaded<CulturalTip[]>> =>
    load(
      'tips',
      async () => itemsOf(await apiGet<PageLike<CulturalTip>>('/content/cultural-tips', ['content'])),
      () => fallbackCatalog().tips,
    ),
);

/** Helplines only come from the live API (never shown from placeholder data). */
export const getHelplines = cache(async (): Promise<Helplines | null> => {
  try {
    const h = await apiGet<Helplines | { helplines: Helplines }>('/content/helplines', ['content']);
    const table = 'helplines' in h && typeof h.helplines === 'object' ? h.helplines : (h as Helplines);
    return Object.fromEntries(Object.entries(table).filter(([, v]) => typeof v === 'string' && v.trim())) as Helplines;
  } catch {
    return null;
  }
});

// ------------------------------------------------------------------------------------------------ cities
export interface City {
  slug: string;
  name: string;
  state: string | null;
  hospitals: HospitalCard[];
}

export const getCities = cache(async (): Promise<Loaded<City[]>> => {
  const hospitals = await getHospitals();
  const bySlug = new Map<string, City>();
  for (const h of hospitals.data) {
    if (!h.city) continue;
    const slug = slugify(h.city);
    const city = bySlug.get(slug) ?? { slug, name: h.city, state: h.state, hospitals: [] };
    city.hospitals.push(h);
    bySlug.set(slug, city);
  }
  const data = [...bySlug.values()].sort((a, b) => b.hospitals.length - a.hospitals.length || a.name.localeCompare(b.name));
  return { data, source: hospitals.source };
});

// ------------------------------------------------------------------------------------------------ search
export interface SearchResults {
  specialties: Specialty[];
  procedures: Procedure[];
  hospitals: HospitalCard[];
  doctors: DoctorCard[];
}

function matches(q: string, ...fields: (string | null | undefined)[]) {
  return fields.some((f) => f?.toLowerCase().includes(q));
}

export async function searchCatalog(query: string): Promise<SearchResults> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { specialties: [], procedures: [], hospitals: [], doctors: [] };
  const [specialties, procedures, hospitals, doctors] = await Promise.all([
    getSpecialties(),
    getProcedures(),
    getHospitals(),
    getDoctors(),
  ]);
  return {
    specialties: specialties.data.filter((s) => matches(q, s.name, s.slug, s.description)).slice(0, 8),
    procedures: procedures.data.filter((p) => matches(q, p.name, p.slug, p.description, p.specialty.name)).slice(0, 12),
    hospitals: hospitals.data.filter((h) => matches(q, h.name, h.city, h.state, ...h.specialties)).slice(0, 12),
    doctors: doctors.data
      .filter((d) => matches(q, d.full_name, d.specialty?.name, d.hospital?.name, d.hospital?.city))
      .slice(0, 12),
  };
}

export function anyFallback(...items: (Loaded<unknown> | { source: Loaded<unknown>['source'] } | null | undefined)[]) {
  return items.some((i) => i?.source === 'fallback');
}
