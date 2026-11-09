import { ArrowRight, CircleCheck } from 'lucide-react';
import type { Dictionary } from '@/i18n';
import { formatNumber } from '@/i18n/format';
import { illustration } from '@/lib/brand';
import { href, routes } from '@/lib/routes';
import { PageHero } from './page-hero';
import { ButtonLink, SectionHeader } from './ui';
import { InlineNote } from './data-notice';

interface PartnerCopy {
  title: string;
  intro: string;
  cta: string;
  benefitsTitle: string;
  benefits: { title: string; body: string }[];
  stepsTitle: string;
  steps: { title: string; body: string }[];
  termsNote: string;
  ctaTitle: string;
  ctaBody: string;
}

/** Shared layout of the "For hospitals" and "For agents" pages (registration goes through the public door). */
export function PartnerPage({
  t,
  copy,
  role,
  path,
  navLabel,
  art,
}: {
  t: Dictionary;
  copy: PartnerCopy;
  role: 'hospital' | 'agent';
  path: string;
  navLabel: string;
  art: string;
}) {
  const registerHref = `${href(routes.register)}?role=${role}`;
  const image = illustration(art);
  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: navLabel, path: href(path) },
        ]}
        title={copy.title}
        intro={copy.intro}
        aside={
          image ? (
            // Decorative brand illustration from design/ (static SVG).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" width={360} height={280} className="mx-auto hidden h-40 w-auto lg:block" />
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={registerHref} size="lg">
            {copy.cta}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href={href(routes.login)} variant="secondary" size="lg">
            {t.nav.login}
          </ButtonLink>
        </div>
      </PageHero>

      <div className="container-page space-y-12 py-8 sm:py-10">
        <section aria-labelledby="benefits-title">
          <SectionHeader id="benefits-title" title={copy.benefitsTitle} />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {copy.benefits.map((b, i) => (
              <li key={b.title} className="card-hover rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${
                    ['bg-primary-50 text-primary-700 ring-primary-100', 'bg-slate-100 text-slate-800 ring-slate-200', 'bg-champagne-soft/70 text-champagne ring-champagne/30', 'bg-primary-50 text-primary-700 ring-primary-100'][i % 4]
                  }`}
                >
                  <CircleCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{b.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="steps-title" className="bg-section-tint rounded-3xl border border-white p-6 sm:p-8">
          <SectionHeader id="steps-title" title={copy.stepsTitle} />
          <ol className={`grid gap-5 sm:grid-cols-2 ${copy.steps.length > 3 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            {copy.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600 font-bold text-white shadow-sm">
                  {formatNumber(i + 1)}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <InlineNote text={copy.termsNote} />

        <section className="rounded-2xl bg-navy px-6 py-10 text-white sm:px-10" aria-labelledby="partner-cta">
          <h2 id="partner-cta" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {copy.ctaTitle}
          </h2>
          <p className="mt-3 max-w-2xl text-slate-200">{copy.ctaBody}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={registerHref} variant="primary" size="lg">
              {copy.cta}
            </ButtonLink>
            <ButtonLink href={href(routes.contact)} variant="onDark" size="lg">
              {t.nav.contact}
            </ButtonLink>
          </div>
        </section>
      </div>
    </>
  );
}
