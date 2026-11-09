import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { getFxRates } from '@/lib/data/catalog';
import { cityGuide } from '@/lib/content';
import { getDestinations } from '@/lib/destinations';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { HospitalCard } from '@/components/cards';
import { ContentArticle } from '@/components/content-article';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { SectionHeader } from '@/components/ui';
import { DestinationRelated } from '@/components/growth/related-blocks';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const destinations = await getDestinations();
  return destinations.data.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = getDictionary();
  const d = (await getDestinations()).data.find((x) => x.slug === slug);
  if (!d) return {};
  return pageMetadata({
    path: routes.city(d.slug),
    title: [
      fmt(t.destinations.cityMetaTitle, { city: d.name }),
      `Treatment in ${d.name}: hospitals and city guide`,
      `Treatment in ${d.name}, India: hospitals and guide`,
      `Medical treatment in ${d.name}, India`,
      `Treatment in ${d.name}: hospitals and tips`,
    ],
    description: fmt(t.destinations.cityMetaDescription, { city: d.name, count: plural(t.common.hospitalsCount, d.hospitals.length) }),
    noindex: !d.guide && !d.hospitals.length,
  });
}

export default async function DestinationPage({ params }: Props) {
  const { slug } = await params;
  const t = getDictionary();
  const [destinations, fx] = await Promise.all([getDestinations(), getFxRates()]);
  const d = destinations.data.find((x) => x.slug === slug);
  if (!d) notFound();
  const guide = d.guide ? cityGuide(d.guide) : null;

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.destinations.title, path: href(routes.destinations) },
          { name: d.name, path: href(routes.city(d.slug)) },
        ]}
        eyebrow={<span className="text-sm font-semibold text-primary-700">{d.state ?? t.common.india}</span>}
        title={d.name}
        intro={d.summary ?? undefined}
        facts={[d.hospitals.length ? plural(t.common.hospitalsCount, d.hospitals.length) : null]}
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        <section aria-labelledby="hospitals-title">
          <SectionHeader id="hospitals-title" title={fmt(t.destinations.hospitalsIn, { city: d.name })} />
          {d.hospitals.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {d.hospitals.map((h) => (
                <li key={h.slug}>
                  <HospitalCard t={t} hospital={h} fx={fx.data} />
                </li>
              ))}
            </ul>
          ) : (
            <InlineNote text={fmt(t.destinations.noHospitals, { city: d.name })} />
          )}
        </section>

        <section aria-labelledby="guide-title">
          <SectionHeader id="guide-title" title={t.destinations.guideTitle} />
          {guide ? (
            <div className="space-y-6">
              <ContentArticle page={guide} t={t} shiftHeadings={1} />
              <InlineNote text={t.destinations.verifyNote} />
            </div>
          ) : (
            <InlineNote text={fmt(t.destinations.guidePending, { city: d.name })} />
          )}
        </section>

        <DestinationRelated destination={d.slug} name={d.name} />

        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
