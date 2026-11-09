import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { BadgeCheck, BedDouble, Building2, CalendarDays, Plane, Wallet } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt, formatList, formatNumber, plural } from '@/i18n/format';
import { getFxRates } from '@/lib/data/catalog';
import { convertMinor, formatMoney, formatMoneyRange, toNumber } from '@/lib/money';
import { medicalProcedureLd } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import { pageMetadata, shortName, truncate } from '@/lib/seo';
import { costGuideLinksForProcedure } from '@/lib/growth/links';
import { getProcedureCities, getProcedureCity, procedureCityStatus, type ProcedureCity } from '@/lib/growth/procedure-city';
import { getReviewers } from '@/lib/medical-review';
import { growthWebPageLd, hospitalItemListLd } from '@/lib/growth/jsonld';
import { travelNotes } from '@/lib/growth/travel';
import { resolveContentHref } from '@/lib/content';
import type { DoctorCard as Doctor, FxTable } from '@/lib/data/types';
import { PageHero } from '@/components/page-hero';
import { AccreditationBadges, DoctorCard } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { JsonLd } from '@/components/json-ld';
import { MarkdownContent } from '@/components/markdown';
import { PriceRange } from '@/components/price';
import { Badge, Fact, SectionHeader } from '@/components/ui';
import { IntroArticle } from '@/components/growth/intro-article';
import { RelatedLinks } from '@/components/growth/related-links';

export const revalidate = 3600;

type Props = { params: Promise<{ specialty: string; procedure: string; city: string }> };

/** Only combinations that pass the data threshold are prebuilt; any other URL renders 404. */
export async function generateStaticParams({ params }: { params: { specialty: string; procedure: string } }) {
  const all = await getProcedureCities();
  return all.data
    .filter((c) => c.procedure.specialty.slug === params.specialty && c.procedure.slug === params.procedure)
    .map((c) => ({ city: c.destination.slug }));
}

/** Price span across the hospitals, converted to INR (the catalogue currency) for one comparable range. */
function overallRange(combo: ProcedureCity, fx: FxTable): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const o of combo.offerings) {
    const lo = convertMinor(o.min, o.currency, 'INR', fx);
    const hi = convertMinor(o.max, o.currency, 'INR', fx);
    if (lo === null || hi === null) continue;
    min = Math.min(min, lo);
    max = Math.max(max, hi);
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function stayText(combo: ProcedureCity) {
  const t = getDictionary();
  const p = combo.procedure;
  const nights = combo.offerings.map((o) => o.offering.hospital_stay_days).filter((n): n is number => n !== null);
  const lo = nights.length ? Math.min(...nights) : p.hospital_stay_days;
  const hi = nights.length ? Math.max(...nights) : p.hospital_stay_days;
  const hospital =
    lo === null || hi === null ? null : hi === 0 ? t.procedure.dayCare : lo === hi ? plural(t.common.nights, hi) : `${formatNumber(lo)}–${formatNumber(hi)} nights`;
  return { hospital, total: p.total_stay_days ? plural(t.common.days, p.total_stay_days) : null };
}

function summaryText(combo: ProcedureCity, range: string | null) {
  const { procedure: p, destination: d, offerings } = combo;
  const count = offerings.length;
  return range
    ? `${count} partner hospitals in ${d.name} publish prices for ${p.name}, from ${range}. Compare hospitals, accreditations, specialists and typical time in India.`
    : `${count} partner hospitals in ${d.name} publish prices for ${p.name}. Compare hospitals, accreditations, specialists and typical time in India.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure, city } = await params;
  const { combo, source } = await getProcedureCity(procedure, city);
  if (!combo) return {};
  const fx = await getFxRates();
  const range = overallRange(combo, fx.data);
  const status = procedureCityStatus(combo, source, await getReviewers());
  return pageMetadata({
    path: routes.procedureCity(combo.procedure.specialty.slug, combo.procedure.slug, combo.destination.slug),
    title: [
      `${combo.procedure.name} in ${combo.destination.name}: hospitals and prices`,
      `${combo.procedure.name} in ${combo.destination.name}: prices`,
      `${shortName(combo.procedure.name)} in ${combo.destination.name}: hospitals and prices`,
      `${shortName(combo.procedure.name)} in ${combo.destination.name}: prices`,
      `${shortName(combo.procedure.name)} in ${combo.destination.name}`,
    ],
    description: truncate(
      status.intro?.summary ?? summaryText(combo, range ? formatMoneyRange(range.min, range.max, 'INR', 'en') : null),
    ),
    // Thin-page protection: indexable only with live data AND a reviewed hand-written intro.
    noindex: !status.indexable,
    type: 'article',
  });
}

export default async function ProcedureCityPage({ params }: Props) {
  const { specialty, procedure, city } = await params;
  const t = getDictionary();
  const { combo, source } = await getProcedureCity(procedure, city);
  if (!combo) notFound();
  const p = combo.procedure;
  const d = combo.destination;
  if (p.specialty.slug !== specialty) permanentRedirect(href(routes.procedureCity(p.specialty.slug, p.slug, d.slug)));

  const path = routes.procedureCity(p.specialty.slug, p.slug, d.slug);
  const status = procedureCityStatus(combo, source, await getReviewers());
  const [fx, all, costLinks] = await Promise.all([getFxRates(), getProcedureCities(), costGuideLinksForProcedure(p.slug).catch(() => [])]);
  const range = overallRange(combo, fx.data);
  const rangeText = range ? formatMoneyRange(range.min, range.max, 'INR', 'en') : null;
  const stay = stayText(combo);
  const hospitals = combo.offerings.map((o) => o.hospital);
  const accredited = hospitals.filter((h) => h.accreditations.some((a) => ['jci', 'nabh'].includes(a.toLowerCase())));
  const airports = hospitals.map((h) => toNumber(h.airport_distance_km)).filter((n): n is number => n !== null);
  const doctors: Doctor[] = hospitals
    .flatMap((h) => h.doctors.filter((doc) => doc.specialty?.slug === p.specialty.slug))
    .filter((doc, i, list) => list.findIndex((x) => x.slug === doc.slug) === i)
    .slice(0, 6);
  const travel = travelNotes(d.guide);
  const otherCities = all.data
    .filter((c) => c.procedure.slug === p.slug && c.destination.slug !== d.slug)
    .map((c) => ({ href: routes.procedureCity(p.specialty.slug, p.slug, c.destination.slug), title: c.destination.name, description: `${c.offerings.length} hospitals with published prices` }));
  const otherProcedures = all.data
    .filter((c) => c.destination.slug === d.slug && c.procedure.slug !== p.slug)
    .map((c) => ({ href: routes.procedureCity(c.procedure.specialty.slug, c.procedure.slug, d.slug), title: c.procedure.name, description: `${c.offerings.length} hospitals with published prices` }));
  const title = `${p.name} in ${d.name}`;

  return (
    <>
      <JsonLd
        data={[
          growthWebPageLd({
            path: href(path),
            name: title,
            description: status.intro?.summary ?? summaryText(combo, rangeText),
            about: medicalProcedureLd(p, href(routes.procedure(p.specialty.slug, p.slug))),
            intro: status.intro,
          }),
          hospitalItemListLd(`Partner hospitals offering ${p.name} in ${d.name}`, hospitals),
        ]}
      />
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.treatments.title, path: href(routes.treatments) },
          { name: p.specialty.name, path: href(routes.specialty(p.specialty.slug)) },
          { name: p.name, path: href(routes.procedure(p.specialty.slug, p.slug)) },
          { name: d.name, path: href(path) },
        ]}
        eyebrow={
          <Link href={href(routes.procedure(p.specialty.slug, p.slug))} className="text-sm font-semibold tracking-wide text-primary-700 uppercase hover:underline">
            {p.name}
          </Link>
        }
        title={title}
        intro={<p>{status.intro?.summary ?? summaryText(combo, rangeText)}</p>}
        aside={
          <section aria-labelledby="key-facts" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 id="key-facts" className="text-lg font-bold">
              {d.name} at a glance
            </h2>
            <dl className="mt-4 space-y-4">
              {range ? (
                <Fact
                  icon={<Wallet className="h-5 w-5" />}
                  label="Published price range"
                  value={<PriceRange min={range.min} max={range.max} currency="INR" fx={fx.data} approxLabel={t.common.approx} stacked />}
                />
              ) : null}
              <Fact
                icon={<Building2 className="h-5 w-5" />}
                label="Partner hospitals with prices"
                value={`${formatNumber(hospitals.length)}${accredited.length ? ` (${formatNumber(accredited.length)} JCI or NABH accredited)` : ''}`}
              />
              {stay.total ? <Fact icon={<CalendarDays className="h-5 w-5" />} label={t.procedure.timeInIndia} value={stay.total} /> : null}
              {stay.hospital ? <Fact icon={<BedDouble className="h-5 w-5" />} label={t.procedure.hospitalStay} value={stay.hospital} /> : null}
              {airports.length ? (
                <Fact
                  icon={<Plane className="h-5 w-5" />}
                  label="Distance from the airport"
                  value={`${formatNumber(Math.min(...airports))}–${formatNumber(Math.max(...airports))} km`}
                />
              ) : null}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">{t.procedure.priceNote}</p>
          </section>
        }
      />

      <div className="container-page space-y-10 py-8 sm:py-10">
        {status.intro ? (
          <section aria-labelledby="intro-title">
            <SectionHeader id="intro-title" title={`About ${p.name} in ${d.name}`} />
            <IntroArticle intro={status.intro} />
          </section>
        ) : null}

        <section aria-labelledby="hospitals-title">
          <SectionHeader
            id="hospitals-title"
            title={`Hospitals in ${d.name} offering ${p.name}`}
            subtitle="Prices are published by each hospital and are indicative until you receive a written quote."
          />
          <ul className="grid gap-5 md:grid-cols-2">
            {combo.offerings.map(({ hospital: h, offering: hp, min, max, currency }) => (
              <li key={h.slug} className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
                <h3 className="text-lg font-semibold text-slate-900">
                  <Link href={href(routes.hospital(h.slug))} className="hover:text-primary-800 hover:underline">
                    {h.name}
                  </Link>
                </h3>
                <p className="text-sm text-slate-600">{[h.city, h.state].filter(Boolean).join(', ')}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {h.accreditations.length ? <AccreditationBadges t={t} items={h.accreditations} /> : <span className="text-sm text-slate-600">{t.hospitals.noAccreditations}</span>}
                  {h.international_desk ? <Badge tone="blue">{t.common.internationalDesk}</Badge> : null}
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-slate-600">{t.procedure.hospitalPrice}</dt>
                    <dd>
                      <PriceRange min={min} max={max} currency={currency} fx={fx.data} approxLabel={t.common.approx} />
                    </dd>
                  </div>
                  {hp.hospital_stay_days !== null ? (
                    <div className="flex gap-2">
                      <dt className="text-slate-600">{t.procedure.hospitalStay}:</dt>
                      <dd className="font-medium">{hp.hospital_stay_days === 0 ? t.procedure.dayCare : plural(t.common.nights, hp.hospital_stay_days)}</dd>
                    </div>
                  ) : null}
                  {hp.inclusions.length ? (
                    <div>
                      <dt className="text-slate-600">{t.hospitals.included}</dt>
                      <dd>{formatList(hp.inclusions.slice(0, 4))}{hp.inclusions.length > 4 ? ` +${hp.inclusions.length - 4}` : ''}</dd>
                    </div>
                  ) : null}
                </dl>
                {hp.packages.length ? (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-sm font-semibold text-slate-800">{t.hospitals.packages}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {hp.packages.slice(0, 3).map((pk) => (
                        <li key={pk.id} className="flex justify-between gap-3">
                          <span className="text-slate-700">{pk.name}</span>
                          <span className="font-semibold whitespace-nowrap">{formatMoney(pk.price_minor, pk.currency, 'en')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t.hospitals.accreditationVerify}
          </p>
        </section>

        {doctors.length ? (
          <section aria-labelledby="doctors-title">
            <SectionHeader id="doctors-title" title={`${p.specialty.name} specialists at these hospitals`} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.map((doc) => (
                <li key={doc.slug}>
                  <DoctorCard t={t} doctor={doc} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {travel ? (
          <section aria-labelledby="travel-title">
            <SectionHeader id="travel-title" title={`Arriving in ${d.name}`} subtitle={`From our ${d.name} city guide.`} />
            <div className="space-y-4">
              {travel.page.isDraft ? <InlineNote tone="amber" text={t.common.contentDraft} /> : null}
              <MarkdownContent resolveHref={(h) => resolveContentHref(travel.page.path, h)} shiftHeadings={1} className="max-w-3xl">
                {travel.markdown}
              </MarkdownContent>
              <Link href={href(routes.city(d.slug))} className="inline-block font-medium text-primary-700 underline underline-offset-4">
                Read the full {d.name} city guide
              </Link>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="compare-title">
          <SectionHeader
            id="compare-title"
            title="Compare with the cost in your home country"
            subtitle={`Indicative benchmarks are available for ${plural({ one: '{count} country', other: '{count} countries' }, p.benchmarks.length)}.`}
          />
          <p>
            <Link href={`${href(routes.procedure(p.specialty.slug, p.slug))}#compare-title`} className="font-medium text-primary-700 underline underline-offset-4">
              Open the {p.name} cost calculator
            </Link>
          </p>
        </section>

        <InlineNote tone="amber" text={fmt(t.procedure.disclaimer, { procedure: p.name })} />

        <AssessmentCta title={fmt(t.procedure.ctaTitle, { procedure: p.name })} body={t.procedure.ctaBody} button={t.common.getAssessment} specialty={p.specialty.slug} />

        <RelatedLinks id="related-costs" title="Cost guides by home country" items={costLinks} />
        <RelatedLinks id="related-cities" title={`${p.name} in other cities`} items={otherCities} />
        <RelatedLinks id="related-procedures" title={`Other treatments with published prices in ${d.name}`} items={otherProcedures} />
      </div>
    </>
  );
}
