import type { Metadata } from 'next';
import Link from '@/components/link';
import { notFound } from 'next/navigation';
import { Briefcase, Building2, GraduationCap, Languages, ShieldCheck, Video } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt, formatList, plural, intlLocale } from '@/i18n/format';
import { getDoctor, getDoctorReviews, getDoctors, getFxRates, getProcedures } from '@/lib/data/catalog';
import { formatMoney, toNumber } from '@/lib/money';
import { physicianLd } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import { pageMetadata, truncate } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { AccreditationBadges, EarliestAvailability, Rating, RegistrationVerified, ReviewItem } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { JsonLd } from '@/components/json-ld';
import { PriceRange } from '@/components/price';
import { Badge, ButtonLink, Fact, SectionHeader } from '@/components/ui';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const doctors = await getDoctors();
  return doctors.data.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getDictionary();
  const d = await getDoctor(slug);
  if (!d.data) return {};
  const vars = {
    doctor: d.data.full_name,
    specialty: d.data.specialty?.name ?? '',
    hospital: d.data.hospital?.name ?? '',
    city: d.data.hospital?.city ?? '',
  };
  return pageMetadata({
    path: routes.doctor(d.data.slug),
    title: [fmt(t.doctors.detailMetaTitle, vars), ...(vars.specialty ? [`${vars.doctor} - ${vars.specialty}`] : []), vars.doctor],
    titleEn: [
      fmt(t.doctors.detailMetaTitle, vars),
      ...(vars.specialty && vars.city ? [`${vars.doctor}, ${vars.specialty}, ${vars.city}`, `${vars.doctor}: ${vars.specialty} in India`] : []),
      ...(vars.specialty ? [`${vars.doctor} - ${vars.specialty}`] : []),
      ...(vars.city ? [`${vars.doctor}, specialist in ${vars.city}, India`, `${vars.doctor}, ${vars.city}`] : []),
      vars.doctor,
    ],
    description: truncate(fmt(t.doctors.detailMetaDescription, vars)),
    noindex: d.source === 'fallback',
    type: 'profile',
  });
}

export default async function DoctorPage({ params }: Props) {
  const { slug } = await params;
  const t = await getDictionary();
  const loaded = await getDoctor(slug);
  const d = loaded.data;
  if (!d) notFound();
  const intl = intlLocale();
  const [fx, procedures, reviewPage] = await Promise.all([
    getFxRates(),
    getProcedures(),
    loaded.source === 'api' ? getDoctorReviews(d.id, d.slug, 1, 6) : null,
  ]);
  const reviews = reviewPage?.items.length ? reviewPage.items : (d.reviews ?? []);
  const reviewTotal = reviewPage?.total ?? reviews.length;
  const specialtyOf = new Map(procedures.data.map((p) => [p.slug, p.specialty.slug]));
  const path = routes.doctor(d.slug);
  const hospitalPath = d.hospital ? href(routes.hospital(d.hospital.slug)) : null;
  const success = toNumber(d.success_rate_pct);

  return (
    <>
      <JsonLd data={physicianLd(d, href(path), hospitalPath)} />
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.doctors.title, path: href(routes.doctors) },
          { name: d.full_name, path: href(path) },
        ]}
        eyebrow={
          d.specialty ? (
            <Link href={href(routes.specialty(d.specialty.slug))} className="text-sm font-semibold tracking-wide text-primary-700 uppercase hover:underline">
              {d.specialty.name}
            </Link>
          ) : undefined
        }
        title={d.full_name}
        intro={
          <div className="space-y-3">
            {d.qualifications.length ? <p className="text-base text-slate-700">{d.qualifications.join(', ')}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Rating t={t} value={d.rating_avg} count={d.rating_count} />
              <RegistrationVerified t={t} verified={d.registration_verified} />
              {d.teleconsult_available ? (
                <Badge tone="blue">
                  <Video className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.doctors.teleconsult}
                </Badge>
              ) : null}
            </div>
          </div>
        }
        aside={
          <section aria-labelledby="facts-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 id="facts-title" className="sr-only">
              {t.procedure.keyFacts}
            </h2>
            <dl className="space-y-4">
              {d.hospital ? (
                <Fact
                  icon={<Building2 className="h-5 w-5" />}
                  label={t.doctors.hospital}
                  value={
                    <Link href={hospitalPath!} className="text-primary-800 hover:underline">
                      {d.hospital.name}, {d.hospital.city}
                    </Link>
                  }
                />
              ) : null}
              {d.experience_years ? (
                <Fact icon={<Briefcase className="h-5 w-5" />} label={t.doctors.experience} value={plural(t.common.yearsExperience, d.experience_years)} />
              ) : null}
              {d.qualifications.length ? (
                <Fact icon={<GraduationCap className="h-5 w-5" />} label={t.doctors.qualifications} value={formatList(d.qualifications)} />
              ) : null}
              {d.registration_verified ? (
                <Fact
                  icon={<ShieldCheck className="h-5 w-5" />}
                  label={t.trust.registration}
                  value={
                    <span className="flex flex-col">
                      <span>
                        {d.registration_number
                          ? fmt(t.trust.registrationValue, {
                              number: d.registration_number,
                              council: d.registration_council_name || d.registration_council || '',
                            }).replace(/,\s*$/, '')
                          : t.trust.registrationVerified}
                      </span>
                      <span className="text-xs font-normal text-slate-600">{t.trust.registrationVerifiedNote}</span>
                    </span>
                  }
                />
              ) : null}
              {d.languages.length ? (
                <Fact icon={<Languages className="h-5 w-5" />} label={t.doctors.languages} value={formatList(d.languages)} />
              ) : null}
              {d.consultation_fee_minor !== null ? (
                <Fact label={t.doctors.consultationFee} value={formatMoney(d.consultation_fee_minor, d.currency, intl)} />
              ) : null}
            </dl>
            <EarliestAvailability
              t={t}
              consultation={d.next_available_consultation ?? d.next_available_date}
              admission={d.next_available_admission}
              className="mt-4"
            />
            {d.hospital?.accreditations.length ? (
              <div className="mt-4">
                <AccreditationBadges t={t} items={d.hospital.accreditations} verified={d.hospital.accreditations_verified} />
              </div>
            ) : null}
          </section>
        }
      />

      <div className="container-page space-y-10 py-8 sm:py-10">
        {d.bio ? (
          <section aria-labelledby="about-title">
            <h2 id="about-title" className="text-2xl font-bold tracking-tight">
              {fmt(t.doctors.about, { doctor: d.full_name })}
            </h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-slate-700">{d.bio}</p>
          </section>
        ) : null}

        {d.sub_specialties.length ? (
          <section aria-labelledby="expertise-title">
            <h2 id="expertise-title" className="text-xl font-bold tracking-tight">
              {t.doctors.expertise}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {d.sub_specialties.map((s) => (
                <li key={s}>
                  <Badge tone="slate" className="text-sm font-medium">
                    {s}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {d.procedures.length ? (
          <section aria-labelledby="procedures-title">
            <SectionHeader id="procedures-title" title={t.doctors.procedures} />
            <ul className="grid gap-4 md:grid-cols-2">
              {d.procedures.map((hp) => {
                const spec = specialtyOf.get(hp.procedure.slug);
                return (
                  <li key={hp.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="font-semibold">
                      {spec ? (
                        <Link href={href(routes.procedure(spec, hp.procedure.slug))} className="hover:text-primary-800 hover:underline">
                          {hp.procedure.name}
                        </Link>
                      ) : (
                        hp.procedure.name
                      )}
                    </h3>
                    {hp.price_min_minor !== null || hp.price_max_minor !== null ? (
                      <p className="mt-2 text-sm">
                        <PriceRange min={hp.price_min_minor} max={hp.price_max_minor} currency={hp.currency} fx={fx.data} approxLabel={t.common.approx} />
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {reviews.length ? (
          <section aria-labelledby="reviews-title">
            <SectionHeader
              id="reviews-title"
              title={fmt(t.trust.reviewsTitle, { name: d.full_name })}
              action={
                reviewTotal > reviews.length ? (
                  <ButtonLink href={href(routes.doctorReviews(d.slug))} variant="secondary" size="sm">
                    {plural(t.trust.allReviews, reviewTotal)}
                  </ButtonLink>
                ) : undefined
              }
            />
            <ul className="grid gap-4 md:grid-cols-2">
              {reviews.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <ReviewItem t={t} review={r} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-slate-600">{t.trust.reviewsNote}</p>
          </section>
        ) : null}

        {success !== null ? (
          <p className="text-sm text-slate-600">
            {fmt(t.doctors.successRate, { pct: success })} - {t.doctors.successRateNote}
          </p>
        ) : null}

        <AssessmentCta
          title={fmt(t.doctors.ctaTitle, { doctor: d.full_name })}
          body={t.doctors.ctaBody}
          button={t.common.getAssessment}
          specialty={d.specialty?.slug}
        />
      </div>
    </>
  );
}
