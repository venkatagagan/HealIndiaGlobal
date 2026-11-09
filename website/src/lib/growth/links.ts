import 'server-only';

/** Internal links to the content-growth pages ("Related" blocks) and their sitemap entries (indexable only). */
import { SITE_NOINDEX } from '@/config/site';
import { routes } from '@/lib/routes';
import { stories } from './collections';
import { costGuidesWithIntro } from './cost-guides';
import { getReviewers } from '@/lib/medical-review';
import { getProcedureCities, procedureCityStatus, type ProcedureCity } from './procedure-city';

export interface GrowthLink {
  href: string;
  title: string;
  description?: string;
}

function procedureCityLink(c: ProcedureCity, label: 'procedure' | 'city' | 'both'): GrowthLink {
  const title =
    label === 'procedure' ? c.destination.name : label === 'city' ? c.procedure.name : `${c.procedure.name} in ${c.destination.name}`;
  return {
    href: routes.procedureCity(c.procedure.specialty.slug, c.procedure.slug, c.destination.slug),
    title,
    description: `${c.offerings.length} partner hospitals with published prices`,
  };
}

export async function procedureCityLinksForProcedure(procedureSlug: string): Promise<GrowthLink[]> {
  const all = await getProcedureCities();
  return all.data.filter((c) => c.procedure.slug === procedureSlug).map((c) => procedureCityLink(c, 'procedure'));
}

export async function procedureCityLinksForDestination(destinationSlug: string): Promise<GrowthLink[]> {
  const all = await getProcedureCities();
  return all.data.filter((c) => c.destination.slug === destinationSlug).map((c) => procedureCityLink(c, 'city'));
}

export async function procedureCityLinksForHospital(hospitalSlug: string): Promise<GrowthLink[]> {
  const all = await getProcedureCities();
  return all.data.filter((c) => c.offerings.some((o) => o.hospital.slug === hospitalSlug)).map((c) => procedureCityLink(c, 'both'));
}

export async function costGuideLinksForProcedure(procedureSlug: string): Promise<GrowthLink[]> {
  const guides = await costGuidesWithIntro();
  return guides
    .filter((g) => g.procedure.slug === procedureSlug)
    .map((g) => ({ href: routes.costGuide(g.procedure.slug, g.slug), title: `Cost: India and ${g.country}`, description: 'Indicative, itemised' }));
}

export function storyLinks(filter: { procedure?: string; hospital?: string }): GrowthLink[] {
  return stories()
    .filter((s) => (!filter.procedure || s.procedure === filter.procedure) && (!filter.hospital || s.hospital === filter.hospital))
    .map((s) => ({ href: routes.story(s.slug), title: s.title, description: s.isDraft ? 'Draft (development only)' : `${s.name}'s story` }));
}

/** Sitemap entries for indexable growth pages only (noindex pages are never listed). */
export async function growthSitemapPaths(): Promise<{ path: string; priority: number; lastModified?: string }[]> {
  if (SITE_NOINDEX) return [];
  const out: { path: string; priority: number; lastModified?: string }[] = [];
  // `updated` front matter (YYYY-MM-DD) of the reviewed intro / story is the page's last meaningful change.
  const date = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? { lastModified: value } : {});
  const newest = (values: (string | null | undefined)[]) => date(values.filter(Boolean).sort().pop());
  const [cities, reviewers] = await Promise.all([getProcedureCities(), getReviewers()]);
  for (const c of cities.data) {
    const status = procedureCityStatus(c, cities.source, reviewers);
    if (status.indexable) {
      out.push({ path: routes.procedureCity(c.procedure.specialty.slug, c.procedure.slug, c.destination.slug), priority: 0.6, ...date(status.intro?.updated) });
    }
  }
  const guides = (await costGuidesWithIntro()).filter((g) => g.indexable);
  if (guides.length) out.push({ path: routes.costs, priority: 0.5, ...newest(guides.map((g) => g.intro?.updated)) });
  for (const g of guides) out.push({ path: routes.costGuide(g.procedure.slug, g.slug), priority: 0.5, ...date(g.intro?.updated) });
  const published = stories().filter((s) => !s.isDraft);
  if (published.length) out.push({ path: routes.stories, priority: 0.4, ...newest(published.map((s) => s.updated)) });
  for (const s of published) out.push({ path: routes.story(s.slug), priority: 0.4, ...date(s.updated) });
  return out;
}
