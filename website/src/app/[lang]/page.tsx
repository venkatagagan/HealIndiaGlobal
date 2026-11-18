import type { Metadata } from 'next';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Calculator,
  CircleCheck,
  ClipboardList,
  Clock,
  HeartHandshake,
  Languages,
  Quote,
  Search,
  Users,
} from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt, formatNumber } from '@/i18n/format';
import { marketing, testimonials } from '@/config/marketing';
import { getSiteConfig } from '@/lib/site-config';
import { JCI_URL, NABH_URL, assessmentUrl } from '@/config/site';
import {
  featuredOrder,
  getCities,
  getCostComparison,
  getFxRates,
  getHospitals,
  getProcedure,
  getProcedures,
  getSpecialties,
} from '@/lib/data/catalog';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { websiteLd } from '@/lib/jsonld';
import { JsonLd } from '@/components/json-ld';
import { HospitalCard, SpecialtyTile } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { Badge, ButtonLink, SectionHeader } from '@/components/ui';
import { HomeExamples, HomeHeroComparison, type HomeComparisonItem, type HomeComparisonLabels } from '@/components/home-comparison';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  const specialties = await getSpecialties();
  return pageMetadata({
    path: routes.home,
    title: [`${t.common.brand} - ${t.home.metaTitle}`, t.home.metaTitle],
    titleEn: [
      `${t.common.brand} - ${t.home.metaTitle}`,
      `${t.common.brand}: treatment at accredited hospitals in India`,
      `${t.common.brand}: medical treatment in India, clear prices`,
      `${t.common.brand}: medical treatment in India`,
    ],
    absoluteTitle: true,
    description: t.home.metaDescription,
    noindex: specialties.source === 'fallback',
  });
}

/**
 * A featured procedure for the home comparisons. The page is cached and the same for everyone: the visitor's country
 * is applied in the browser (components/home-comparison.tsx), so every benchmark is passed and the legal display rule
 * (lib/cost.ts) is evaluated there for the country actually shown.
 */
async function loadItem(slug: string, exampleCountry: string): Promise<HomeComparisonItem | null> {
  const p = (await getProcedure(slug)).data;
  if (!p || p.india_price_min_minor === null || p.india_price_max_minor === null) return null;
  // India availability does not depend on the home country; this is the same cached call the procedure page makes.
  const api = await getCostComparison(p.slug, exampleCountry, 'USD');
  return {
    slug: p.slug,
    name: p.name,
    href: href(routes.procedure(p.specialty.slug, p.slug)),
    india: { min: p.india_price_min_minor, max: p.india_price_max_minor, currency: p.currency },
    benchmarks: p.benchmarks,
    earliestAdmission: api?.india.earliest_admission_date ?? null,
  };
}

export default async function HomePage() {
  const t = await getDictionary();

  const [specialties, procedures, hospitals, fx, cities, site] = await Promise.all([
    getSpecialties(),
    getProcedures(),
    getHospitals(),
    getFxRates(),
    getCities(),
    getSiteConfig(),
  ]);
  // Claims (savings %, stats, testimonials switch): System -> Website & contact -> Marketing claims.
  const claims = site.marketing;
  // Example home country for the cached HTML (crawlers, no JS); visitors see their own country after hydration.
  const country = marketing.savingsExampleCountry;
  const [hero, ...exampleItems] = await Promise.all(
    [marketing.heroComparisonProcedure, ...marketing.savingsExampleProcedures].map((slug) => loadItem(slug, country)),
  );
  const procBySlug = new Map(procedures.data.map((p) => [p.slug, p.name]));
  const examples = exampleItems
    .filter((x): x is HomeComparisonItem => !!x)
    .map((x) => ({ ...x, name: procBySlug.get(x.slug) ?? x.name }));
  const comparisonLabels: HomeComparisonLabels = {
    home: {
      heroCardTitle: t.home.heroCardTitle,
      heroCardIn: t.home.heroCardIn,
      heroCardCost: t.home.heroCardCost,
      heroCardWait: t.home.heroCardWait,
      heroCardSavings: t.home.heroCardSavings,
      heroCardNote: t.home.heroCardNote,
      savingsTitle: t.home.savingsTitle,
      savingsSubtitle: t.home.savingsSubtitle,
      savingsHome: t.home.savingsHome,
      savingsIndia: t.home.savingsIndia,
      savingsYouSave: t.home.savingsYouSave,
      savingsNote: t.home.savingsNote,
    },
    prices: t.prices,
    india: t.common.india,
    viewDetails: t.common.viewDetails,
    indiaWait: claims.indiaWait || t.procedure.calc.indiaWait,
  };
  const featured = featuredOrder(hospitals.data, hospitals.source).slice(0, 6);
  const jci = hospitals.data.filter((h) => h.accreditations.includes('jci')).length;
  const nabh = hospitals.data.filter((h) => h.accreditations.includes('nabh')).length;

  const stats = [
    ...claims.stats
      .filter((s) => s.show)
      .map((s) => ({ value: s.value, label: s.label, note: s.source ? fmt(t.home.statSource, { source: s.source }) : t.home.statFootnote })),
    { value: formatNumber(hospitals.data.length), label: t.home.stats.hospitals, note: null },
    { value: formatNumber(specialties.data.length), label: t.home.stats.specialties, note: null },
    { value: formatNumber(cities.data.length), label: t.home.stats.cities, note: null },
  ];
  const stepIcons = [ClipboardList, Users, Calculator, CalendarCheck];

  return (
    <>
      <JsonLd data={websiteLd()} />

      {/* ------------------------------------------------------------------------------------ hero */}
      <section className="relative isolate overflow-hidden border-b border-slate-200 bg-cloud">
        {/* soft teal glow + faint fine-line pattern */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 end-[-10%] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(15_118_110/0.12),transparent)]" />
          <div className="absolute -bottom-48 start-[-8%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(closest-side,rgb(176_141_87/0.10),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgb(16_42_67/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(16_42_67/0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(70%_80%_at_70%_30%,black,transparent)]" />
        </div>
        <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:py-20">
          <div>
            <p className="flex items-center gap-3 text-sm font-semibold tracking-[0.08em] text-slate-700 uppercase">
              <span aria-hidden="true" className="h-px w-10 bg-champagne" />
              {t.common.tagline}
            </p>
            <h1 className="font-display mt-5 text-[2.25rem] leading-[1.1] font-bold tracking-[-0.02em] text-balance text-slate-900 sm:text-5xl lg:text-[3.25rem]">
              {claims.showMaxSavings ? fmt(t.home.heroTitle, { pct: claims.maxSavingsPct }) : t.home.heroTitleNoPct}
              {claims.showMaxSavings && !claims.maxSavingsSource ? <sup className="ms-1 text-2xl text-slate-600">*</sup> : null}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-700">{t.home.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={assessmentUrl()} variant="primary" size="lg">
                {t.common.getAssessment}
                <ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href={href(routes.treatments)} variant="outline" size="lg">
                {t.home.heroSecondaryCta}
              </ButtonLink>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] text-slate-700">
              {t.home.heroPoints.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <CircleCheck className="h-4 w-4 shrink-0 text-primary-600" strokeWidth={1.75} aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            {claims.showMaxSavings && !claims.maxSavingsSource ? (
              <p className="mt-4 text-xs text-slate-600">* {t.home.statFootnote}</p>
            ) : null}
            <form role="search" action={href(routes.search)} method="get" className="mt-8 max-w-xl">
              <label htmlFor="hero-search" className="sr-only">
                {t.home.searchLabel}
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-primary-500">
                <Search className="ms-3 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
                <input
                  id="hero-search"
                  name="q"
                  type="search"
                  required
                  minLength={2}
                  placeholder={t.common.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-slate-900 placeholder:text-slate-500 focus:outline-none"
                />
                <button type="submit" className="rounded-lg bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                  {t.common.search}
                </button>
              </div>
            </form>
          </div>

          {hero ? <HomeHeroComparison item={hero} defaultCountry={country} labels={comparisonLabels} /> : null}
        </div>
      </section>

      {/* ----------------------------------------------------------------------------------- stats: the one navy band */}
      <section aria-label={t.home.stats.hospitals} className="bg-navy text-white">
        <div className="container-page py-10">
          <dl className="grid grid-cols-2 gap-6 text-center sm:grid-cols-4 sm:divide-x sm:divide-white/10">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse">
                <dt className="mt-1 text-sm text-slate-300">{s.label}</dt>
                <dd className="font-display text-4xl font-semibold tracking-tight text-white">
                  {s.value}
                  {s.note ? <sup className="ms-0.5 text-base text-champagne">*</sup> : null}
                </dd>
              </div>
            ))}
          </dl>
          {stats.some((s) => s.note) ? (
            <p className="mt-5 text-center text-xs text-slate-300">* {stats.find((s) => s.note)?.note}</p>
          ) : null}
        </div>
      </section>

      {/* --------------------------------------------------------------------------- how it works */}
      <section className="bg-section-tint py-12 sm:py-16" aria-labelledby="how-title">
        <div className="container-page">
          <SectionHeader id="how-title" title={t.home.howTitle} subtitle={t.home.howSubtitle} align="center" />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.home.steps.map((step, i) => {
              const Icon = stepIcons[i] ?? ClipboardList;
              return (
                <li key={step.title} className="card-hover relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${
                        ['bg-primary-50 text-primary-700 ring-primary-100', 'bg-slate-100 text-slate-800 ring-slate-200', 'bg-champagne-soft/70 text-champagne ring-champagne/30', 'bg-primary-50 text-primary-700 ring-primary-100'][i % 4]
                      }`}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="text-3xl font-extrabold text-primary-600 tabular-nums">{formatNumber(i + 1)}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
                </li>
              );
            })}
          </ol>
          <div className="mt-8 text-center">
            <ButtonLink href={assessmentUrl()} size="lg">
              {t.common.getAssessment}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------------------- specialties */}
      <section className="py-12 sm:py-16" aria-labelledby="specialties-title">
        <div className="container-page">
          <SectionHeader
            id="specialties-title"
            title={t.home.specialtiesTitle}
            subtitle={t.home.specialtiesSubtitle}
            action={
              <ButtonLink href={href(routes.treatments)} variant="secondary" size="sm">
                {t.common.viewAll}
              </ButtonLink>
            }
          />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {specialties.data.map((s, i) => (
              <li key={s.slug}>
                <SpecialtyTile t={t} specialty={s} index={i} dark={false} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------------ savings examples */}
      {examples.length ? <HomeExamples items={examples} defaultCountry={country} labels={comparisonLabels} /> : null}

      {/* --------------------------------------------------------------------- featured hospitals */}
      {featured.length ? (
        <section className="py-12 sm:py-16" aria-labelledby="featured-title">
          <div className="container-page">
            <SectionHeader
              id="featured-title"
              title={t.home.featuredTitle}
              subtitle={t.home.featuredSubtitle}
              action={
                <ButtonLink href={href(routes.hospitals)} variant="secondary" size="sm">
                  {t.common.viewAll}
                </ButtonLink>
              }
            />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((h) => (
                <li key={h.slug}>
                  <HospitalCard t={t} hospital={h} fx={fx.data} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------------------------- trust */}
      <section className="bg-hero-soft py-12 sm:py-16" aria-labelledby="trust-title">
        <div className="container-page">
          <SectionHeader id="trust-title" title={t.home.trustTitle} subtitle={t.home.trustSubtitle} />
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: BadgeCheck, title: t.home.trust.accreditedTitle, body: fmt(t.home.trust.accreditedBody, { jci, nabh, total: hospitals.data.length }) },
              { icon: Languages, title: t.home.trust.languageTitle, body: t.home.trust.languageBody },
              { icon: Clock, title: t.home.trust.waitTitle, body: t.home.trust.waitBody },
              { icon: HeartHandshake, title: t.home.trust.priceTitle, body: t.home.trust.priceBody },
            ].map((item) => (
              <li key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-health-100 text-brand-ink">
                  <item.icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-slate-700">
            {(() => {
              const parts = t.home.trustNote.split(/(\{jci\}|\{nabh\})/);
              return parts.map((part, i) =>
                part === '{jci}' ? (
                  <a key={i} href={JCI_URL} rel="noopener noreferrer" target="_blank" className="font-medium text-primary-700 underline underline-offset-4">
                    Joint Commission International
                  </a>
                ) : part === '{nabh}' ? (
                  <a key={i} href={NABH_URL} rel="noopener noreferrer" target="_blank" className="font-medium text-primary-700 underline underline-offset-4">
                    NABH
                  </a>
                ) : (
                  <span key={i}>{part}</span>
                ),
              );
            })()}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------------ testimonials */}
      {claims.showTestimonials ? (
        <section className="py-12 sm:py-16" aria-labelledby="stories-title">
          <div className="container-page">
            <SectionHeader id="stories-title" title={t.home.testimonialsTitle} subtitle={t.home.testimonialsNote} />
            <ul className="grid gap-5 md:grid-cols-3">
              {testimonials().map((item) => (
                <li key={item.quote}>
                  <figure className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                    <div className="flex items-center justify-between">
                      <Quote className="h-7 w-7 text-primary-300" aria-hidden="true" />
                      <Badge tone="amber">{t.common.illustrative}</Badge>
                    </div>
                    <blockquote className="mt-4 flex-1 text-slate-800">“{item.quote}”</blockquote>
                    <figcaption className="mt-4 text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">{item.name}</span> · {item.detail}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------------------------------------- CTAs */}
      <div className="container-page space-y-8 pb-16">
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
        <section className="grid gap-6 rounded-3xl border border-slate-200 bg-surface p-6 sm:p-10 lg:grid-cols-[1.5fr_1fr]" aria-labelledby="partners-title">
          <div>
            <h2 id="partners-title" className="text-2xl font-bold tracking-tight">
              {t.home.partnersTitle}
            </h2>
            <p className="mt-2 text-slate-600">{t.home.partnersBody}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <ButtonLink href={href(routes.forHospitals)} variant="accent">
              {t.nav.forHospitals}
            </ButtonLink>
            <ButtonLink href={href(routes.forAgents)} variant="secondary">
              {t.nav.forAgents}
            </ButtonLink>
          </div>
        </section>
      </div>
    </>
  );
}

