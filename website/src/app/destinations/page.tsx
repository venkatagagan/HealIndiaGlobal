import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Building2, MapPin } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { getDestinations } from '@/lib/destinations';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.destinations, title: t.destinations.metaTitle, description: t.destinations.metaDescription });
}

export default async function DestinationsPage() {
  const t = getDictionary();
  const destinations = await getDestinations();

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.destinations.title, path: href(routes.destinations) },
        ]}
        title={t.destinations.title}
        intro={fmt(t.destinations.intro, { count: plural(t.destinations.citiesCount, destinations.data.length) })}
      />
      <div className="container-page space-y-12 py-8 sm:py-10">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.data.map((d) => (
            <li key={d.slug}>
              <article className="relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition hover:border-primary-300">
                <p className="flex items-center gap-1.5 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 text-primary-700" aria-hidden="true" />
                  {d.state ?? t.common.india}
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight">
                  <Link href={href(routes.city(d.slug))} className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800">
                    {d.name}
                  </Link>
                </h2>
                {d.summary ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{d.summary}</p> : null}
                <div className="mt-auto flex flex-wrap gap-4 pt-4 text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    {plural(t.common.hospitalsCount, d.hospitals.length)}
                  </span>
                  {d.guide ? (
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                      {t.destinations.guideTitle}
                    </span>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
