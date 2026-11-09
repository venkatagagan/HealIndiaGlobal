import {
  costGuideLinksForProcedure,
  procedureCityLinksForDestination,
  procedureCityLinksForHospital,
  procedureCityLinksForProcedure,
  storyLinks,
} from '@/lib/growth/links';
import { getDictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { RelatedLinks } from './related-links';

/**
 * "Related" blocks for existing pages. Each block lists only pages that exist (data threshold met); index/noindex is
 * decided by the target page itself. Failures never break the host page.
 */
async function safe<T>(fn: () => Promise<T> | T, empty: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[growth] related links unavailable: ${(err as Error).message}`);
    return empty;
  }
}

export async function ProcedureRelated({ procedure, name }: { procedure: string; name: string }) {
  const [cities, costs, stories] = await Promise.all([
    safe(() => procedureCityLinksForProcedure(procedure), []),
    safe(() => costGuideLinksForProcedure(procedure), []),
    safe(() => storyLinks({ procedure }), []),
  ]);
  if (!cities.length && !costs.length && !stories.length) return null;
  const r = (await getDictionary()).related;
  return (
    <div className="space-y-6">
      <RelatedLinks id="related-cities" title={fmt(r.byCity, { name })} items={cities} />
      <RelatedLinks id="related-costs" title={r.costGuides} items={costs} />
      <RelatedLinks id="related-stories" title={r.stories} items={stories} />
    </div>
  );
}

export async function DestinationRelated({ destination, name }: { destination: string; name: string }) {
  const cities = await safe(() => procedureCityLinksForDestination(destination), []);
  const r = (await getDictionary()).related;
  return <RelatedLinks id="related-procedures" title={fmt(r.pricesIn, { name })} items={cities} />;
}

export async function HospitalRelated({ hospital }: { hospital: string }) {
  const [cities, stories] = await Promise.all([
    safe(() => procedureCityLinksForHospital(hospital), []),
    safe(() => storyLinks({ hospital }), []),
  ]);
  if (!cities.length && !stories.length) return null;
  const r = (await getDictionary()).related;
  return (
    <div className="space-y-6">
      <RelatedLinks id="related-compare" title={r.compareCity} items={cities} />
      <RelatedLinks id="related-stories" title={r.stories} items={stories} />
    </div>
  );
}
