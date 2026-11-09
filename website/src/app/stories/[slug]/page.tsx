import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { countryName } from '@/i18n/format';
import { getHospital, getProcedure } from '@/lib/data/catalog';
import { resolveContentHref } from '@/lib/content';
import { href, routes } from '@/lib/routes';
import { pageMetadata, truncate } from '@/lib/seo';
import { stories, story } from '@/lib/growth/collections';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { MarkdownContent } from '@/components/markdown';

export const revalidate = 3600;
/** Only stories that pass the consent gates exist; nothing else is rendered on demand. */
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return stories().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = story(slug);
  if (!s) return {};
  return pageMetadata({
    path: routes.story(s.slug),
    title: s.title,
    description: truncate(s.summary ?? `${s.name}'s experience of treatment in India.`),
    noindex: s.isDraft,
    type: 'article',
  });
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const t = getDictionary();
  const s = story(slug);
  if (!s) notFound();
  const [procedure, hospital] = await Promise.all([getProcedure(s.procedure), s.hospital ? getHospital(s.hospital) : null]);
  const p = procedure.data;
  const h = hospital?.data ?? null;

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: 'Patient stories', path: href(routes.stories) },
          { name: s.title, path: href(routes.story(s.slug)) },
        ]}
        title={s.title}
        intro={
          <p className="text-base">
            {s.name}
            {s.homeCountry ? `, ${countryName(s.homeCountry)}` : ''}
            {p ? (
              <>
                {' · '}
                <Link href={href(routes.procedure(p.specialty.slug, p.slug))} className="text-primary-700 underline underline-offset-4">
                  {p.name}
                </Link>
              </>
            ) : null}
            {h ? (
              <>
                {' · '}
                <Link href={href(routes.hospital(h.slug))} className="text-primary-700 underline underline-offset-4">
                  {h.name}
                </Link>
              </>
            ) : null}
          </p>
        }
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        {s.isDraft ? (
          <InlineNote tone="amber" text="Draft story - shown only on a local development server. It is never built for production." />
        ) : null}
        <article className="max-w-3xl">
          <MarkdownContent resolveHref={(x) => resolveContentHref(s.path, x)}>{s.body}</MarkdownContent>
        </article>
        <InlineNote
          text={
            s.isDraft
              ? 'Placeholder: in a published story this line confirms written consent and review. This is not medical advice.'
              : `Shared by ${s.name} with written consent for publication on this website, and reviewed before publication. This is one person's experience, not medical advice; results differ from patient to patient.`
          }
        />
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} specialty={p?.specialty.slug} />
      </div>
    </>
  );
}
