import type { Metadata } from 'next';
import { Bot, Building2, CircleCheck, ShieldCheck, TriangleAlert } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { illustration } from '@/lib/brand';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.about, title: t.about.metaTitle, description: t.about.metaDescription });
}

export default async function AboutPage() {
  const t = getDictionary();
  const art = illustration('onboarding-security');
  const blocks = [
    { icon: TriangleAlert, title: t.about.notTitle, body: t.about.not },
    { icon: Building2, title: t.about.hospitalsTitle, body: t.about.hospitals },
    { icon: Bot, title: t.about.aiTitle, body: t.about.ai },
    { icon: ShieldCheck, title: t.about.privacyTitle, body: t.about.privacy },
  ];
  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.nav.about, path: href(routes.about) },
        ]}
        title={t.about.title}
        intro={t.about.intro}
        aside={
          art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt="" width={360} height={280} className="mx-auto hidden h-40 w-auto lg:block" />
          ) : undefined
        }
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        <section aria-labelledby="what-title" className="max-w-3xl">
          <h2 id="what-title" className="text-2xl font-bold tracking-tight">
            {t.about.whatTitle}
          </h2>
          <ul className="mt-5 space-y-3">
            {t.about.what.map((line) => (
              <li key={line} className="flex items-start gap-3 text-slate-700">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
        </section>
        <ul className="grid gap-5 md:grid-cols-2">
          {blocks.map((b) => (
            <li key={b.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <b.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-bold">{b.title}</h2>
              <p className="mt-2 leading-relaxed text-slate-700">{b.body}</p>
            </li>
          ))}
        </ul>
        <AssessmentCta
          title={t.home.ctaTitle}
          body={t.home.ctaBody}
          button={t.common.getAssessment}
          secondary={{ href: href(routes.contact), label: t.nav.contact }}
        />
      </div>
    </>
  );
}
