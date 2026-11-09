import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { BedDouble, CalendarDays, HeartPulse, Wallet } from 'lucide-react';
import { getDictionary, type Dictionary } from '@/i18n';
import { countryName, fmt, formatList, plural } from '@/i18n/format';
import { marketing } from '@/config/marketing';
import { getSiteConfig } from '@/lib/site-config';
import {
  getCostComparison,
  getFxRates,
  getHospitalsForProcedure,
  getProcedure,
  getProcedurePricesByHospital,
  getProcedures,
} from '@/lib/data/catalog';
import { procedureGuide, markdownToPlain } from '@/lib/content';
import { DISPLAY_CURRENCIES } from '@/lib/cost';
import { convertMinor, formatMoneyRange } from '@/lib/money';
import { faqLd, medicalProcedureLd } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import { pageMetadata, shortName, truncate } from '@/lib/seo';
import type { Procedure } from '@/lib/data/types';
import { PageHero } from '@/components/page-hero';
import { HospitalCard, ProcedureCard } from '@/components/cards';
import { CostCalculator } from '@/components/cost-calculator';
import { ContentArticle } from '@/components/content-article';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { JsonLd } from '@/components/json-ld';
import { PriceRange } from '@/components/price';
import { Fact, SectionHeader } from '@/components/ui';
import { ProcedureRelated } from '@/components/growth/related-blocks';
import { SectionNav } from '@/components/section-nav';
import { ButtonLink } from '@/components/ui';
import { assessmentUrl } from '@/config/site';
import { ArrowRight } from 'lucide-react';

export const revalidate = 3600;

type Props = { params: Promise<{ specialty: string; procedure: string }> };

export async function generateStaticParams({ params }: { params: { specialty: string } }) {
  const procedures = await getProcedures();
  return procedures.data.filter((p) => p.specialty.slug === params.specialty).map((p) => ({ procedure: p.slug }));
}

function durations(t: Dictionary, p: Procedure) {
  return {
    total: p.total_stay_days ? plural(t.common.days, p.total_stay_days) : null,
    hospital:
      p.hospital_stay_days === null ? null : p.hospital_stay_days === 0 ? t.procedure.dayCare : plural(t.common.nights, p.hospital_stay_days),
    recovery: p.recovery_days ? plural(t.common.days, p.recovery_days) : null,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure: slug } = await params;
  const t = getDictionary();
  const p = await getProcedure(slug);
  if (!p.data) return {};
  const d = durations(t, p.data);
  const price =
    p.data.india_price_min_minor !== null && p.data.india_price_max_minor !== null
      ? formatMoneyRange(p.data.india_price_min_minor, p.data.india_price_max_minor, p.data.currency, 'en')
      : null;
  return pageMetadata({
    path: routes.procedure(p.data.specialty.slug, p.data.slug),
    title: [
      fmt(t.procedure.metaTitle, { procedure: p.data.name }),
      `${p.data.name} in India: cost and recovery`,
      `${p.data.name} in India: cost, recovery`,
      `${p.data.name} cost in India`,
      fmt(t.procedure.metaTitle, { procedure: shortName(p.data.name) }),
      `${shortName(p.data.name)} in India: cost and recovery`,
      `${shortName(p.data.name)} cost in India`,
    ],
    descriptionExtras: [`${p.data.specialty.name} at partner hospitals in India.`],
    description:
      price && d.total
        ? fmt(t.procedure.metaDescription, { procedure: p.data.name, price, days: d.total })
        : truncate(p.data.description),
    noindex: p.source === 'fallback',
    type: 'article',
  });
}

export default async function ProcedurePage({ params }: Props) {
  const { specialty: specialtySlug, procedure: slug } = await params;
  const t = getDictionary();
  const loaded = await getProcedure(slug);
  const p = loaded.data;
  if (!p) notFound();
  if (p.specialty.slug !== specialtySlug) permanentRedirect(href(routes.procedure(p.specialty.slug, p.slug)));

  const intl = 'en';
  const path = routes.procedure(p.specialty.slug, p.slug);
  const [fx, hospitals, prices, procedures, comparison, site] = await Promise.all([
    getFxRates(),
    getHospitalsForProcedure(p.slug),
    getProcedurePricesByHospital(p.slug),
    getProcedures(),
    getCostComparison(p.slug, marketing.savingsExampleCountry, 'USD'),
    getSiteConfig(),
  ]);
  const d = durations(t, p);
  const hasPrice = p.india_price_min_minor !== null && p.india_price_max_minor !== null;
  const related = procedures.data.filter((x) => x.specialty.slug === p.specialty.slug && x.slug !== p.slug).slice(0, 4);
  const guide = procedureGuide(p.slug);

  // Calculator inputs (all computed client-side from these props; no API calls from the browser).
  const countries = [...new Set(p.benchmarks.map((b) => b.country_code))]
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, intl));
  const currencies = DISPLAY_CURRENCIES.filter((c) => c === 'INR' || fx.data[c]);

  // FAQ (visible + FAQPage JSON-LD).
  const range = hasPrice ? formatMoneyRange(p.india_price_min_minor!, p.india_price_max_minor!, p.currency, intl) : null;
  const usdMin = hasPrice ? convertMinor(p.india_price_min_minor!, p.currency, 'USD', fx.data) : null;
  const usdMax = hasPrice ? convertMinor(p.india_price_max_minor!, p.currency, 'USD', fx.data) : null;
  const approx = usdMin !== null && usdMax !== null ? formatMoneyRange(usdMin, usdMax, 'USD', intl, { approx: true }) : range;
  const names = hospitals.data.slice(0, 3).map((h) => h.name);
  const faqs = [
    range ? { question: fmt(t.procedure.faq.costQ, { procedure: p.name }), answer: fmt(t.procedure.faq.costA, { range, approx: approx ?? range }) } : null,
    d.total
      ? {
          question: fmt(t.procedure.faq.stayQ, { procedure: p.name }),
          answer:
            p.hospital_stay_days && d.hospital
              ? fmt(t.procedure.faq.stayA, { total: d.total, hospital: d.hospital })
              : fmt(t.procedure.faq.stayDayCareA, { total: d.total }),
        }
      : null,
    d.recovery ? { question: fmt(t.procedure.faq.recoveryQ, { procedure: p.name }), answer: fmt(t.procedure.faq.recoveryA, { recovery: d.recovery }) } : null,
    {
      question: fmt(t.procedure.faq.hospitalsQ, { procedure: p.name }),
      answer: names.length
        ? fmt(t.procedure.faq.hospitalsA, { count: plural(t.common.hospitalsCount, hospitals.data.length), names: formatList(names) })
        : t.procedure.faq.hospitalsNoneA,
    },
    { question: t.procedure.faq.aiQ, answer: t.procedure.faq.aiA },
  ].filter((x): x is { question: string; answer: string } => !!x);

  return (
    <>
      <JsonLd data={[medicalProcedureLd(p, href(path)), faqLd(faqs.map((f) => ({ ...f, answer: markdownToPlain(f.answer) })))]} />
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.treatments.title, path: href(routes.treatments) },
          { name: p.specialty.name, path: href(routes.specialty(p.specialty.slug)) },
          { name: p.name, path: href(path) },
        ]}
        eyebrow={
          <Link href={href(routes.specialty(p.specialty.slug))} className="text-sm font-semibold tracking-wide text-primary-700 uppercase hover:underline">
            {p.specialty.name}
          </Link>
        }
        title={p.name}
        intro={
          <>
            <h2 className="sr-only">{fmt(t.procedure.whatIs, { procedure: p.name })}</h2>
            <p>{p.description}</p>
          </>
        }
        facts={[
          hospitals.data.length ? plural(t.common.hospitalsCount, hospitals.data.length) : null,
          d.total ? `${t.procedure.timeInIndia}: ${d.total}` : null,
        ]}
        aside={
          <section aria-labelledby="key-facts" className="rounded-2xl border border-white bg-white/90 p-5 shadow-card sm:p-6">
            <h2 id="key-facts" className="text-lg font-bold">
              {t.procedure.keyFacts}
            </h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {hasPrice ? (
                <Fact
                  icon={<Wallet className="h-5 w-5" />}
                  label={t.procedure.priceRange}
                  value={
                    <PriceRange
                     
                      min={p.india_price_min_minor}
                      max={p.india_price_max_minor}
                      currency={p.currency}
                      fx={fx.data}
                      approxLabel={t.common.approx}
                      stacked
                    />
                  }
                />
              ) : null}
              {d.total ? <Fact icon={<CalendarDays className="h-5 w-5" />} label={t.procedure.timeInIndia} value={d.total} /> : null}
              {d.hospital ? <Fact icon={<BedDouble className="h-5 w-5" />} label={t.procedure.hospitalStay} value={d.hospital} /> : null}
              {d.recovery ? <Fact icon={<HeartPulse className="h-5 w-5" />} label={t.procedure.recovery} value={d.recovery} /> : null}
            </dl>
            {hasPrice ? <p className="mt-4 text-xs leading-relaxed text-slate-600">{t.procedure.priceNote}</p> : null}
          </section>
        }
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={assessmentUrl(p.specialty.slug)} variant="primary" className="max-sm:px-4 max-sm:py-2.5 max-sm:text-sm">
            {t.common.getAssessment}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href="#hospitals-title" variant="secondary" className="max-sm:px-4 max-sm:py-2.5 max-sm:text-sm">
            {t.nav.sections.hospitals}
          </ButtonLink>
        </div>
      </PageHero>
      <SectionNav
        label={t.nav.onThisPage}
        items={[
          { id: 'compare-title', label: t.nav.sections.costs },
          { id: 'itemized-title', label: t.nav.sections.itemized },
          { id: 'hospitals-title', label: t.nav.sections.hospitals },
          { id: 'guide-title', label: t.nav.sections.guide },
          { id: 'faq-title', label: t.nav.sections.faq },
          { id: 'related-title', label: t.nav.sections.related },
        ]}
      />

      <div className="container-page space-y-12 py-8 sm:py-10">

        {hasPrice ? (
          <section aria-labelledby="compare-title">
            <SectionHeader id="compare-title" title={t.procedure.compareTitle} subtitle={t.procedure.compareIntro} />
            <CostCalculator
              intl={intl}
              labels={{ ...t.procedure.calc, indiaWait: site.marketing.indiaWait || t.procedure.calc.indiaWait }}
              india={{ min: p.india_price_min_minor!, max: p.india_price_max_minor!, currency: p.currency }}
              benchmarks={p.benchmarks}
              fx={fx.data}
              countries={countries}
              currencies={currencies}
              defaultCountry={marketing.savingsExampleCountry}
            />
          </section>
        ) : null}

        {comparison?.itemized.length ? (
          <section aria-labelledby="itemized-title">
            <SectionHeader id="itemized-title" title={t.procedure.itemizedTitle} />
            <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {comparison.itemized.map((row) => (
                <div key={row.category} className="flex justify-between gap-4 px-5 py-3 text-sm">
                  <dt className="text-slate-700">
                    {t.procedure.itemized[row.category as keyof Dictionary['procedure']['itemized']] ?? row.category}
                  </dt>
                  <dd className="font-semibold">{formatMoneyRange(row.amount_minor, row.amount_minor, row.currency, intl, { approx: true })}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="hospitals-title">
          <SectionHeader id="hospitals-title" title={fmt(t.procedure.hospitalsTitle, { procedure: p.name })} />
          {hospitals.data.length ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {hospitals.data.slice(0, 9).map((h) => {
                const price = prices.get(h.slug);
                return (
                  <li key={h.slug}>
                    <HospitalCard
                     
                      t={t}
                      hospital={h}
                      fx={fx.data}
                      priceOverride={price ? { min: price.min, max: price.max, currency: price.currency, label: t.procedure.hospitalPrice } : null}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <InlineNote text={t.procedure.hospitalsEmpty} />
          )}
        </section>

        {guide ? (
          <section aria-labelledby="guide-title">
            <SectionHeader id="guide-title" title={t.procedure.guideTitle} />
            <ContentArticle page={guide} t={t} shiftHeadings={1} path={path} title={p.name} />
          </section>
        ) : null}

        <section aria-labelledby="faq-title">
          <SectionHeader id="faq-title" title={t.procedure.faqTitle} />
          <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {faqs.map((f) => (
              <details key={f.question} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-slate-900 marker:hidden">
                  <h3 className="inline">{f.question}</h3>
                </summary>
                <p className="mt-2 text-slate-700">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <InlineNote tone="amber" text={fmt(t.procedure.disclaimer, { procedure: p.name })} />

        <AssessmentCta
          title={fmt(t.procedure.ctaTitle, { procedure: p.name })}
          body={t.procedure.ctaBody}
          button={t.common.getAssessment}
          specialty={p.specialty.slug}
        />

        <ProcedureRelated procedure={p.slug} name={p.name} />

        {related.length ? (
          <section aria-labelledby="related-title">
            <SectionHeader id="related-title" title={fmt(t.procedure.relatedTitle, { specialty: p.specialty.name })} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r) => (
                <li key={r.slug}>
                  <ProcedureCard t={t} procedure={r} fx={fx.data} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
