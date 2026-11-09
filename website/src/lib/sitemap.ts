import 'server-only';

/**
 * Sitemap entries split by page type (served as /sitemap/<section>.xml, listed by the /sitemap.xml index).
 * Only indexable pages are listed: pages rendered from fallback (sample) data, auth pages, search, draft content and
 * legal drafts and the staff door are noindex and left out.
 *
 * lastmod: content pages use their `updated` front matter; catalogue pages use the API's `updated_at` when it is
 * present and otherwise the time this server process started (i.e. the deployment), so the value only changes when
 * something could have changed - never "now" on every request.
 */
import type { MetadataRoute } from 'next';
import { SITE_NOINDEX } from '@/config/site';
import { getDoctors, getHospitals, getProcedures, getSpecialties } from '@/lib/data/catalog';
import { getDestinations } from '@/lib/destinations';
import { GUIDE_SLUGS } from '@/lib/guides';
import { cityGuide, guideContent, legalDocument } from '@/lib/content';
import { growthSitemapPaths } from '@/lib/growth/links';
import { routes } from '@/lib/routes';
import { absoluteUrl } from '@/lib/seo';

export const SITEMAP_SECTIONS = ['pages', 'treatments', 'hospitals', 'doctors', 'destinations', 'guides'] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

const DEPLOYED_AT = new Date().toISOString();
const DATE = /^\d{4}-\d{2}-\d{2}/;

interface Item {
  path: string;
  priority: number;
  lastModified?: string | null;
}

function dateOf(value: unknown): string | null {
  return typeof value === 'string' && DATE.test(value) ? value : null;
}

/** `updated_at` from an API record, when the API sends one. */
function apiUpdated(record: object): string | null {
  return dateOf((record as { updated_at?: unknown }).updated_at);
}

function newest(items: Item[]): string | null {
  return items.map((i) => i.lastModified ?? null).filter((d): d is string => Boolean(d)).sort().pop() ?? null;
}

async function sectionItems(): Promise<Record<SitemapSection, Item[]>> {
  const out: Record<SitemapSection, Item[]> = { pages: [], treatments: [], hospitals: [], doctors: [], destinations: [], guides: [] };
  if (SITE_NOINDEX) return out;
  const [specialties, procedures, hospitals, doctors, destinations, growth] = await Promise.all([
    getSpecialties(),
    getProcedures(),
    getHospitals(),
    getDoctors(),
    getDestinations(),
    growthSitemapPaths().catch(() => []),
  ]);

  // Catalogue pages are indexed only when they come from the live API.
  if (specialties.source === 'api') {
    out.treatments.push(
      ...specialties.data.map((s) => ({ path: routes.specialty(s.slug), priority: 0.8, lastModified: apiUpdated(s) ?? DEPLOYED_AT })),
    );
  }
  if (procedures.source === 'api') {
    out.treatments.push(
      ...procedures.data.map((p) => ({ path: routes.procedure(p.specialty.slug, p.slug), priority: 0.8, lastModified: apiUpdated(p) ?? DEPLOYED_AT })),
    );
  }
  if (hospitals.source === 'api') {
    out.hospitals.push(...hospitals.data.map((h) => ({ path: routes.hospital(h.slug), priority: 0.7, lastModified: apiUpdated(h) ?? DEPLOYED_AT })));
  }
  if (doctors.source === 'api') {
    out.doctors.push(...doctors.data.map((d) => ({ path: routes.doctor(d.slug), priority: 0.6, lastModified: apiUpdated(d) ?? DEPLOYED_AT })));
  }

  for (const d of destinations.data.filter((x) => x.guide || x.hospitals.length)) {
    const guide = d.guide ? cityGuide(d.guide) : null;
    out.destinations.push({ path: routes.city(d.slug), priority: 0.5, lastModified: dateOf(guide?.meta.updated) ?? DEPLOYED_AT });
  }

  for (const slug of GUIDE_SLUGS) {
    const page = guideContent(slug);
    if (page) out.guides.push({ path: routes.guide(slug), priority: 0.5, lastModified: dateOf(page.meta.updated) });
  }
  // Content growth (procedure x city, cost guides, stories): only pages that pass their indexing gates.
  for (const g of growth) {
    const target = g.path.startsWith(routes.treatments) ? out.treatments : out.guides;
    target.push({ path: g.path, priority: g.priority, lastModified: g.lastModified ?? null });
  }

  // Hubs and static pages.
  const pages = out.pages;
  if (specialties.source === 'api') {
    pages.push({ path: routes.treatments, priority: 0.9, lastModified: newest(out.treatments) });
  }
  if (hospitals.source === 'api') pages.push({ path: routes.hospitals, priority: 0.8, lastModified: newest(out.hospitals) });
  if (doctors.source === 'api') pages.push({ path: routes.doctors, priority: 0.7, lastModified: newest(out.doctors) });
  pages.push(
    { path: routes.destinations, priority: 0.6, lastModified: newest(out.destinations) },
    { path: routes.guides, priority: 0.6, lastModified: newest(out.guides) },
    { path: routes.faq, priority: 0.6, lastModified: DEPLOYED_AT },
    { path: routes.forHospitals, priority: 0.5, lastModified: DEPLOYED_AT },
    { path: routes.forAgents, priority: 0.5, lastModified: DEPLOYED_AT },
    { path: routes.about, priority: 0.4, lastModified: DEPLOYED_AT },
    { path: routes.contact, priority: 0.4, lastModified: DEPLOYED_AT },
    { path: routes.deleteAccount, priority: 0.2, lastModified: DEPLOYED_AT },
  );
  for (const [doc, path] of [
    ['terms', routes.terms],
    ['privacy', routes.privacy],
    ['refunds', routes.refunds],
  ] as const) {
    const legal = legalDocument(doc);
    if (legal && !legal.isDraft) pages.push({ path, priority: 0.2, lastModified: DEPLOYED_AT });
  }
  if (specialties.source === 'api') {
    const all = SITEMAP_SECTIONS.flatMap((s) => out[s]);
    pages.unshift({ path: routes.home, priority: 1, lastModified: newest(all) });
  }
  return out;
}

function toEntries(items: Item[]): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.path) ? false : (seen.add(i.path), true)))
    .map((i) => ({
      url: absoluteUrl(i.path || '/'),
      ...(i.lastModified ? { lastModified: i.lastModified } : {}),
      priority: i.priority,
    }));
}

export async function sitemapSection(section: string): Promise<MetadataRoute.Sitemap> {
  if (!(SITEMAP_SECTIONS as readonly string[]).includes(section)) return [];
  const items = await sectionItems();
  return toEntries(items[section as SitemapSection]);
}

/** Sections with at least one URL, with the newest lastmod of their entries (for the sitemap index). */
export async function sitemapIndex(): Promise<{ section: SitemapSection; lastModified: string | null }[]> {
  const items = await sectionItems();
  return SITEMAP_SECTIONS.filter((s) => items[s].length).map((s) => ({ section: s, lastModified: newest(items[s]) }));
}

/** Public URL of one section sitemap (Next serves `generateSitemaps` ids at /sitemap/<id>.xml). */
export function sectionUrl(section: SitemapSection): string {
  return absoluteUrl(`/sitemap/${section}.xml`);
}
