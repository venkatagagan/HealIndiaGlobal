import { SITE_NAME, SITE_NOINDEX } from '@/config/site';
import { getDictionary } from '@/i18n';
import { guideContent, legalDocument } from '@/lib/content';
import { getSpecialties } from '@/lib/data/catalog';
import { getDestinations } from '@/lib/destinations';
import { GUIDE_SLUGS } from '@/lib/guides';
import { routes } from '@/lib/routes';
import { absoluteUrl } from '@/lib/seo';

export const revalidate = 3600;

const line = (title: string, path: string, note?: string | null) => `- [${title}](${absoluteUrl(path || '/')})${note ? `: ${note}` : ''}`;

/**
 * /llms.txt (https://llmstxt.org): a short Markdown map of the site for AI assistants and crawlers. Lists only
 * indexable pages (same gates as the sitemap); 404 while SITE_NOINDEX=true.
 */
export async function GET() {
  if (SITE_NOINDEX) return new Response('Not found', { status: 404 });
  const t = getDictionary();
  const [specialties, destinations] = await Promise.all([getSpecialties(), getDestinations()]);
  const out: string[] = [
    `# ${SITE_NAME}`,
    '',
    `> ${t.home.metaDescription}`,
    '',
    `${SITE_NAME} is a medical-travel facilitator: it is not a hospital and does not give medical advice. Prices on the site are indicative ranges; patients receive an itemised quote from the hospital before booking. Content is in English.`,
    '',
    '## Main pages',
    '',
  ];
  if (specialties.source === 'api') out.push(line(t.treatments.title, routes.treatments, t.treatments.metaDescription));
  out.push(
    line(t.hospitals.title, routes.hospitals, t.hospitals.metaDescription),
    line(t.doctors.title, routes.doctors, t.doctors.metaDescription),
    line(t.destinations.title, routes.destinations, t.destinations.metaDescription),
    line(t.faq.title, routes.faq, t.faq.metaDescription),
    line(t.about.title, routes.about, t.about.metaDescription),
    line(t.contact.title, routes.contact),
  );
  if (specialties.source === 'api' && specialties.data.length) {
    out.push('', '## Specialties', '');
    for (const s of specialties.data) out.push(line(s.name, routes.specialty(s.slug)));
  }
  const guides = GUIDE_SLUGS.filter((slug) => guideContent(slug));
  if (guides.length) {
    out.push('', '## Patient guides', '');
    for (const slug of guides) out.push(line(t.guides.items[slug].title, routes.guide(slug), t.guides.items[slug].description));
  }
  const cities = destinations.data.filter((d) => d.guide || d.hospitals.length);
  if (cities.length) {
    out.push('', '## Destinations', '');
    for (const d of cities) out.push(line(d.name, routes.city(d.slug)));
  }
  out.push('', '## Optional', '');
  out.push(line('For hospitals', routes.forHospitals), line('For agents', routes.forAgents));
  for (const [doc, path, title] of [
    ['terms', routes.terms, t.legal.terms.title],
    ['privacy', routes.privacy, t.legal.privacy.title],
    ['refunds', routes.refunds, t.legal.refunds.title],
  ] as const) {
    const legal = legalDocument(doc);
    if (legal && !legal.isDraft) out.push(line(title, path));
  }
  out.push(line('Sitemap', '/sitemap.xml'), '');
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
