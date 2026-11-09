import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Building2, CalendarDays, ChevronDown, Languages, MapPin, Plane } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt, formatList, formatNumber, plural } from '@/i18n/format';
import { getFxRates, getHospital, getHospitals, getProcedures } from '@/lib/data/catalog';
import { formatMoney, toNumber } from '@/lib/money';
import { hospitalLd } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import { pageMetadata, shortName, truncate } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { AccreditationBadges, DoctorCard, Rating } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { JsonLd } from '@/components/json-ld';
import { PriceRange } from '@/components/price';
import { Badge, ButtonLink, Fact, SectionHeader } from '@/components/ui';
import { SectionNav } from '@/components/section-nav';
import { assessmentUrl } from '@/config/site';
import { HospitalRelated } from '@/components/growth/related-blocks';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const hospitals = await getHospitals();
  return hospitals.data.map((h) => ({ slug: h.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = getDictionary();
  const h = await getHospital(slug);
  if (!h.data) return {};
  return pageMetadata({
    path: routes.hospital(h.data.slug),
    title: [
      fmt(t.hospitals.detailMetaTitle, { hospital: h.data.name, city: h.data.city }),
      `${h.data.name}, ${h.data.city}: doctors and prices`,
      `${h.data.name}, ${h.data.city}: prices`,
      `${h.data.name}, ${h.data.city}, India`,
      `${h.data.name}, ${h.data.city}`,
      `${shortName(h.data.name)}, ${h.data.city}`,
    ],
    description: truncate(
      fmt(t.hospitals.detailMetaDescription, {
        hospital: h.data.name,
        city: h.data.city,
        specialties: formatList(h.data.specialties.slice(0, 4)),
      }),
    ),
    noindex: h.source === 'fallback',
  });
}

export default async function HospitalPage({ params }: Props) {
  const { slug } = await params;
  const t = getDictionary();
  const loaded = await getHospital(slug);
  const h = loaded.data;
  if (!h) notFound();
  const intl = 'en';
  const [fx, procedures] = await Promise.all([getFxRates(), getProcedures()]);
  const specialtyOf = new Map(procedures.data.map((p) => [p.slug, p.specialty.slug]));
  const path = routes.hospital(h.slug);
  const airport = toNumber(h.airport_distance_km);

  return (
    <>
      {/* AggregateRating only with live data AND the patient reviews visible on this page (Google review-snippet policy). */}
      <JsonLd data={hospitalLd(h, href(path), loaded.source === 'api' && h.reviews.length > 0)} />
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.hospitals.title, path: href(routes.hospitals) },
          { name: h.name, path: href(path) },
        ]}
        eyebrow={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <MapPin className="h-4 w-4 text-primary-700" aria-hidden="true" />
            {[h.city, h.state].filter(Boolean).join(', ')}
          </span>
        }
        title={h.name}
        intro={
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Rating t={t} value={h.rating_avg} count={h.rating_count} />
              {h.international_desk ? <Badge tone="blue">{t.common.internationalDesk}</Badge> : null}
            </div>
            {h.description ? (
              <>
                <h2 id="overview-title" className="sr-only">
                  {t.hospitals.overview}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-slate-700">{h.description}</p>
              </>
            ) : null}
          </>
        }
        aside={
          <section aria-labelledby="glance-title" className="rounded-2xl border border-white bg-white/90 p-5 shadow-card sm:p-6">
            <h2 id="glance-title" className="text-lg font-bold">
              {t.hospitals.atAGlance}
            </h2>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {h.established_year ? <Fact icon={<CalendarDays className="h-5 w-5" />} label={t.hospitals.established} value={String(h.established_year)} /> : null}
              {h.bed_count ? <Fact icon={<Building2 className="h-5 w-5" />} label={t.hospitals.beds} value={formatNumber(h.bed_count)} /> : null}
              {airport !== null ? (
                <Fact icon={<Plane className="h-5 w-5" />} label={t.hospitals.airport} value={fmt(t.hospitals.km, { km: formatNumber(airport) })} />
              ) : null}
              {h.languages.length ? (
                <Fact
                  icon={<Languages className="h-5 w-5" />}
                  label={t.hospitals.languages}
                  value={formatList(h.languages)}
                />
              ) : null}
            </dl>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-800">{t.hospitals.accreditationsTitle}</h3>
              <div className="mt-2">
                {h.accreditations.length ? <AccreditationBadges t={t} items={h.accreditations} /> : <p className="text-sm text-slate-600">{t.hospitals.noAccreditations}</p>}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{t.hospitals.accreditationVerify}</p>
            </div>
          </section>
        }
      >
        {h.specialties.length ? (
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{t.hospitals.specialties}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {h.specialties.map((s) => (
                <li key={s} className="rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-900/5">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href={assessmentUrl()} variant="primary" className="max-sm:px-4 max-sm:py-2.5 max-sm:text-sm">
            {t.common.getAssessment}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </ButtonLink>
          {h.procedures.length ? (
            <ButtonLink href="#procedures-title" variant="secondary" className="max-sm:px-4 max-sm:py-2.5 max-sm:text-sm">
              {t.nav.sections.procedures}
            </ButtonLink>
          ) : null}
        </div>
      </PageHero>
      <SectionNav
        label={t.nav.onThisPage}
        items={[
          { id: 'procedures-title', label: t.nav.sections.procedures },
          { id: 'doctors-title', label: t.nav.sections.doctors },
          { id: 'reviews-title', label: t.nav.sections.reviews },
          { id: 'location-title', label: t.nav.sections.location },
        ]}
      />

      <div className="container-page space-y-10 py-8 sm:py-10">

        {h.procedures.length ? (
          <section aria-labelledby="procedures-title">
            <SectionHeader id="procedures-title" title={t.hospitals.proceduresTitle} />
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {h.procedures.map((hp) => {
                const spec = specialtyOf.get(hp.procedure.slug);
                return (
                  <li key={hp.id} className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                    <h3 className="font-semibold text-slate-900">
                      {spec ? (
                        <Link href={href(routes.procedure(spec, hp.procedure.slug))} className="hover:text-primary-800 hover:underline">
                          {hp.procedure.name}
                        </Link>
                      ) : (
                        hp.procedure.name
                      )}
                    </h3>
                    <dl className="mt-3 mb-4 space-y-2 text-sm">
                      {hp.price_min_minor !== null || hp.price_max_minor !== null ? (
                        <div>
                          <dt className="text-slate-600">{t.hospitals.priceRange}</dt>
                          <dd>
                            <PriceRange min={hp.price_min_minor} max={hp.price_max_minor} currency={hp.currency} fx={fx.data} approxLabel={t.common.approx} />
                          </dd>
                        </div>
                      ) : null}
                      {hp.hospital_stay_days !== null ? (
                        <div className="flex gap-2">
                          <dt className="text-slate-600">{t.procedure.hospitalStay}:</dt>
                          <dd className="font-medium">
                            {hp.hospital_stay_days === 0 ? t.procedure.dayCare : plural(t.common.nights, hp.hospital_stay_days)}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {hp.inclusions.length || hp.exclusions.length ? (
                      <details className="group mt-3 mb-4 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <summary className="flex items-center justify-between gap-2 font-medium text-primary-800">
                          {t.hospitals.included} / {t.hospitals.notIncluded.toLowerCase()}
                          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                        </summary>
                        <dl className="mt-2 space-y-2">
                          {hp.inclusions.length ? (
                            <div>
                              <dt className="text-slate-600">{t.hospitals.included}</dt>
                              <dd className="text-slate-800">{formatList(hp.inclusions)}</dd>
                            </div>
                          ) : null}
                          {hp.exclusions.length ? (
                            <div>
                              <dt className="text-slate-600">{t.hospitals.notIncluded}</dt>
                              <dd className="text-slate-800">{formatList(hp.exclusions)}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </details>
                    ) : null}
                    {hp.packages.length ? (
                      <div className="mt-auto border-t border-slate-100 pt-3">
                        <p className="text-sm font-semibold text-slate-800">{t.hospitals.packages}</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {hp.packages.map((pk) => (
                            <li key={pk.id} className="flex justify-between gap-3">
                              <span className="text-slate-700">{pk.name}</span>
                              <span className="font-semibold whitespace-nowrap">{formatMoney(pk.price_minor, pk.currency, intl)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-sm text-slate-600">{t.procedure.priceNote}</p>
          </section>
        ) : null}

        {h.doctors.length ? (
          <section aria-labelledby="doctors-title">
            <SectionHeader id="doctors-title" title={fmt(t.hospitals.doctorsTitle, { hospital: h.name })} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {h.doctors.map((d) => (
                <li key={d.slug}>
                  <DoctorCard t={t} doctor={d} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {h.reviews.length ? (
          <section aria-labelledby="reviews-title">
            <SectionHeader id="reviews-title" title={t.hospitals.reviewsTitle} />
            <ul className="grid gap-4 md:grid-cols-2">
              {h.reviews.slice(0, 6).map((r) => (
                <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-amber-600" aria-label={fmt(t.common.rating, { rating: r.rating })}>
                    {'★'.repeat(Math.max(0, Math.min(5, Math.round(r.rating))))}
                  </p>
                  {r.title ? <h3 className="mt-1 font-semibold">{r.title}</h3> : null}
                  {r.body ? <p className="mt-1 text-sm text-slate-700">{r.body}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {h.address || (h.lat !== null && h.lng !== null) ? (
          <section aria-labelledby="location-title">
            <h2 id="location-title" className="text-2xl font-bold tracking-tight">
              {t.hospitals.location}
            </h2>
            {h.address ? <p className="mt-2 text-slate-700">{h.address}</p> : null}
            {h.lat !== null && h.lng !== null ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=15/${h.lat}/${h.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-medium text-primary-700 underline underline-offset-4"
              >
                {t.hospitals.viewOnMap}
              </a>
            ) : null}
          </section>
        ) : null}

        <HospitalRelated hospital={h.slug} />

        <AssessmentCta title={fmt(t.hospitals.ctaTitle, { hospital: h.name })} body={t.hospitals.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
