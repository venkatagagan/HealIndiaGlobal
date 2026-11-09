import { SITE_NOINDEX } from '@/config/site';
import { includeDrafts } from '@/lib/content';
import { getDoctors, getHospitals, getProcedures, getSpecialties, requireLiveData } from '@/lib/data/catalog';
import type { Loaded } from '@/lib/data/types';

/**
 * SEO health: is the catalogue the website renders live (API) or fallback sample data, and how many catalogue pages
 * are indexable. No secrets, no internal URLs. 200 when live, 503 otherwise (for uptime monitors).
 * Production nginx routes /api/ to the backend, so query the website service directly
 * (e.g. http://website:3000/api/health/seo) or add an edge location for it.
 */
export const dynamic = 'force-dynamic';

type Source = Loaded<unknown>['source'] | 'unavailable';

async function probe<T extends unknown[]>(load: () => Promise<Loaded<T>>): Promise<{ source: Source; count: number }> {
  try {
    const result = await load();
    return { source: result.source, count: result.data.length };
  } catch {
    return { source: 'unavailable', count: 0 };
  }
}

export async function GET() {
  const [specialties, procedures, hospitals, doctors] = await Promise.all([
    probe(getSpecialties),
    probe(getProcedures),
    probe(getHospitals),
    probe(getDoctors),
  ]);
  const all = { specialties, procedures, hospitals, doctors };
  const live = Object.values(all).every((r) => r.source === 'api');
  const indexable = (r: { source: Source; count: number }) => (r.source === 'api' && !SITE_NOINDEX ? r.count : 0);

  return Response.json(
    {
      status: live ? 'ok' : 'degraded',
      catalog: {
        live,
        sources: Object.fromEntries(Object.entries(all).map(([k, r]) => [k, r.source])),
      },
      indexable: {
        hospitals: indexable(hospitals),
        doctors: indexable(doctors),
        procedures: indexable(procedures),
        specialties: indexable(specialties),
      },
      site: {
        noindex: SITE_NOINDEX,
        requireLiveData: requireLiveData(),
        includeDrafts: includeDrafts(),
      },
      checkedAt: new Date().toISOString(),
    },
    { status: live ? 200 : 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
  );
}
