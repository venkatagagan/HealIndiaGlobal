import 'server-only';
import { getCities } from '@/lib/data/catalog';
import { cityGuideIndex } from '@/lib/content';
import type { HospitalCard, Loaded } from '@/lib/data/types';

export interface Destination {
  slug: string;
  name: string;
  state: string | null;
  summary: string | null;
  /** Content-pack city guide slug, when one exists. */
  guide: string | null;
  hospitals: HospitalCard[];
}

/**
 * Destinations = content-pack city guides (e.g. "delhi-ncr" covering New Delhi, Gurugram, Noida) merged with the
 * cities of partner hospitals in the catalogue. A catalogue city listed in a guide's `catalog_cities` (or with
 * the same slug) is folded into that guide; any other catalogue city becomes its own destination.
 */
export async function getDestinations(): Promise<Loaded<Destination[]>> {
  const cities = await getCities();
  const guides = cityGuideIndex();
  const out = new Map<string, Destination>();
  for (const g of guides) {
    out.set(g.slug, { slug: g.slug, name: g.name, state: null, summary: g.summary, guide: g.slug, hospitals: [] });
  }
  for (const c of cities.data) {
    const lc = c.name.toLowerCase();
    const g = guides.find((x) => x.slug === c.slug || x.cities.some((name) => name.toLowerCase() === lc));
    const target = g ? out.get(g.slug)! : out.get(c.slug) ?? { slug: c.slug, name: c.name, state: c.state, summary: null, guide: null, hospitals: [] };
    target.hospitals.push(...c.hospitals);
    target.state ??= c.state;
    out.set(target.slug, target);
  }
  const data = [...out.values()].sort((a, b) => b.hospitals.length - a.hospitals.length || a.name.localeCompare(b.name));
  return { data, source: cities.source };
}
