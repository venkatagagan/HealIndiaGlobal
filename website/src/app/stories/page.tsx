import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { countryName } from '@/i18n/format';
import { getProcedures } from '@/lib/data/catalog';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { stories } from '@/lib/growth/collections';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { Badge } from '@/components/ui';

export const revalidate = 3600;

const TITLE = 'Patient stories: treatment in India';
const DESCRIPTION =
  'Experiences shared by patients who travelled to India for treatment, published only with their written consent and reviewed before publication.';

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({ path: routes.stories, title: TITLE, description: DESCRIPTION, noindex: !stories().some((s) => !s.isDraft) });
}

export default async function StoriesPage() {
  const t = getDictionary();
  const list = stories();
  const procedures = await getProcedures();
  const procedureName = new Map(procedures.data.map((p) => [p.slug, p.name]));

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: TITLE, path: href(routes.stories) },
        ]}
        title={TITLE}
        intro={<p>{DESCRIPTION}</p>}
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        <InlineNote text="Each story is one person's experience. Results differ from patient to patient, and a story is not medical advice. Names are shortened to a first name or initials." />
        {list.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {list.map((s) => (
              <li key={s.slug} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-card hover:border-primary-300">
                <div className="flex flex-wrap items-center gap-2">
                  {s.isDraft ? <Badge tone="amber">Draft - development only</Badge> : null}
                  {procedureName.get(s.procedure) ? <Badge tone="primary">{procedureName.get(s.procedure)}</Badge> : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-900">
                  <Link href={href(routes.story(s.slug))} className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800">
                    {s.title}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {s.name}
                  {s.homeCountry ? `, ${countryName(s.homeCountry)}` : ''}
                </p>
                {s.summary ? <p className="mt-3 text-slate-700">{s.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <InlineNote text="No stories have been published yet. Stories appear here only after the patient has given written consent and the text has been reviewed." />
        )}
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
