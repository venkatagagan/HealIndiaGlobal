import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, HelpCircle } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { GUIDE_SLUGS } from '@/lib/guides';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.guides, title: t.guides.metaTitle, description: t.guides.metaDescription });
}

export default async function GuidesPage() {
  const t = getDictionary();
  const cards = [
    ...GUIDE_SLUGS.map((slug) => ({ path: routes.guide(slug), ...t.guides.items[slug], icon: BookOpen })),
    { path: routes.faq, title: t.faq.title, description: t.faq.intro, icon: HelpCircle },
    { path: routes.destinations, title: t.destinations.title, description: t.destinations.metaDescription, icon: BookOpen },
  ];
  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.guides.title, path: href(routes.guides) },
        ]}
        title={t.guides.title}
        intro={t.guides.intro}
      />
      <div className="container-page space-y-12 py-8 sm:py-10">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.path}>
              <article className="relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition hover:border-primary-300">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                  <c.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-lg font-bold tracking-tight">
                  <Link href={href(c.path)} className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800">
                    {c.title}
                  </Link>
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{c.description}</p>
                <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-700">
                  {t.guides.readGuide}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </p>
              </article>
            </li>
          ))}
        </ul>
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
