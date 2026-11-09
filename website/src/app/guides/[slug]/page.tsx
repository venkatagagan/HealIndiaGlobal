import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { OFFICIAL_EVISA_URL } from '@/config/site';
import { guideContent } from '@/lib/content';
import { GUIDE_SLUGS, isGuideSlug } from '@/lib/guides';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { ContentArticle, ContentPending } from '@/components/content-article';
import { AssessmentCta } from '@/components/cta';
import { SectionHeader } from '@/components/ui';

export const revalidate = 3600;
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isGuideSlug(slug)) return {};
  const t = getDictionary();
  const item = t.guides.items[slug];
  const page = guideContent(slug);
  return pageMetadata({
    path: routes.guide(slug),
    title: [
      `${item.title}: guide for treatment in India`,
      `${item.title}: medical travel to India`,
      `${item.title} - patient guide for India`,
      `${item.title}: patient guide`,
      item.title,
    ],
    descriptionExtras: [item.description],
    description: page?.meta.summary ? page.meta.summary : item.description,
    type: 'article',
    noindex: !page,
  });
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const t = getDictionary();
  if (!isGuideSlug(slug)) notFound();
  const item = t.guides.items[slug];
  const page = guideContent(slug);
  const others = GUIDE_SLUGS.filter((s) => s !== slug);

  const visaBox =
    slug === 'visa' || slug === 'pre-arrival' ? (
      <div role="note" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p>{t.guides.visaVerify}</p>
        <a
          href={OFFICIAL_EVISA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 font-semibold text-amber-950 underline underline-offset-4"
        >
          {t.guides.visaOfficial}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    ) : null;

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.guides.title, path: href(routes.guides) },
          { name: item.title, path: href(routes.guide(slug)) },
        ]}
        title={item.title}
        intro={item.description}
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        {page ? <ContentArticle page={page} t={t} aside={visaBox} path={routes.guide(slug)} title={item.title} /> : (
          <div className="space-y-6">
            <ContentPending t={t} />
            {visaBox}
          </div>
        )}

        <section aria-labelledby="related-title">
          <SectionHeader id="related-title" title={t.guides.relatedGuides} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((s) => (
              <li key={s}>
                <Link
                  href={href(routes.guide(s))}
                  className="block h-full rounded-2xl border border-slate-200 bg-white p-5 hover:border-primary-300"
                >
                  <span className="font-semibold text-slate-900">{t.guides.items[s].title}</span>
                  <span className="mt-1 block text-sm text-slate-600">{t.guides.items[s].description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
