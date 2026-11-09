import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { costGuidesWithIntro } from '@/lib/growth/cost-guides';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { RelatedLinks } from '@/components/growth/related-links';

export const revalidate = 3600;

const TITLE = 'Treatment cost guides by home country';
const DESCRIPTION =
  'Indicative, itemised cost guides that set prices at partner hospitals in India next to self-pay benchmarks in your home country, with sources and dates.';

export async function generateMetadata(): Promise<Metadata> {
  const guides = await costGuidesWithIntro().catch(() => []);
  return pageMetadata({ path: routes.costs, title: TITLE, description: DESCRIPTION, noindex: !guides.some((g) => g.indexable) });
}

export default async function CostsPage() {
  const t = getDictionary();
  const guides = await costGuidesWithIntro().catch(() => []);
  const byProcedure = new Map<string, typeof guides>();
  for (const g of guides) byProcedure.set(g.procedure.name, [...(byProcedure.get(g.procedure.name) ?? []), g]);

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: 'Cost guides', path: href(routes.costs) },
        ]}
        title={TITLE}
        intro={<p>{DESCRIPTION} Every figure is indicative; your written quote from the hospital is what counts.</p>}
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        {byProcedure.size ? (
          [...byProcedure.entries()].map(([name, list], i) => (
            <RelatedLinks
              key={name}
              id={`costs-${i}`}
              title={name}
              items={list.map((g) => ({
                href: routes.costGuide(g.procedure.slug, g.slug),
                title: `India and ${g.country}`,
                description: g.intro?.isDraft ? 'Draft - awaiting review' : g.intro?.summary ?? undefined,
              }))}
            />
          ))
        ) : (
          <InlineNote text="Cost guides are being written and reviewed. Meanwhile, every treatment page has a cost calculator for your home country." />
        )}
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} secondary={{ href: href(routes.treatments), label: t.treatments.title }} />
      </div>
    </>
  );
}
