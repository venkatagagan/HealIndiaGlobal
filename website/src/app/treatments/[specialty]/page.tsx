import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import {
  getDoctors,
  getFxRates,
  getHospitalsForSpecialty,
  getProcedures,
  getSpecialties,
  getSpecialty,
} from '@/lib/data/catalog';
import { href, routes } from '@/lib/routes';
import { pageMetadata, shortName, truncate } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { DoctorCard, HospitalCard, ProcedureCard } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { SpecialtyIcon } from '@/components/specialty-icon';
import { Badge, ButtonLink, SectionHeader } from '@/components/ui';

export const revalidate = 3600;

type Props = { params: Promise<{ specialty: string }> };

export async function generateStaticParams() {
  const specialties = await getSpecialties();
  return specialties.data.map((s) => ({ specialty: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { specialty: slug } = await params;
  const t = getDictionary();
  const specialty = await getSpecialty(slug);
  if (!specialty.data) return {};
  const s = specialty.data;
  const description =
    s.savings_min_pct !== null && s.savings_max_pct !== null
      ? fmt(t.treatments.specialtyMetaDescription, {
          specialty: s.name,
          count: plural(t.common.proceduresCount, s.procedures_count),
          min: s.savings_min_pct,
          max: s.savings_max_pct,
        })
      : truncate(s.description);
  return pageMetadata({
    path: routes.specialty(s.slug),
    title: [
      fmt(t.treatments.specialtyMetaTitle, { specialty: s.name }),
      `${s.name} in India: procedures and prices`,
      `${s.name} in India: treatment costs`,
      `${shortName(s.name)} in India: procedures and prices`,
      `${s.name} in India: prices`,
    ],
    descriptionExtras: [s.procedures_count ? `Compare ${plural(t.common.proceduresCount, s.procedures_count)} and partner hospitals.` : null],
    description,
    noindex: specialty.source === 'fallback',
  });
}

export default async function SpecialtyPage({ params }: Props) {
  const { specialty: slug } = await params;
  const t = getDictionary();
  const specialty = await getSpecialty(slug);
  if (!specialty.data) notFound();
  const s = specialty.data;

  const [procedures, hospitals, doctors, fx] = await Promise.all([
    getProcedures(),
    getHospitalsForSpecialty(s.slug),
    getDoctors(),
    getFxRates(),
  ]);
  const list = procedures.data.filter((p) => p.specialty.slug === s.slug);
  const specialists = doctors.data.filter((d) => d.specialty?.slug === s.slug).slice(0, 6);
  const hasSavings = s.savings_min_pct !== null && s.savings_max_pct !== null;

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.treatments.title, path: href(routes.treatments) },
          { name: s.name, path: href(routes.specialty(s.slug)) },
        ]}
        eyebrow={
          <span className="inline-flex items-center gap-2 text-primary-700">
            <SpecialtyIcon slug={s.slug} icon={s.icon} className="h-7 w-7" />
            <span className="text-sm font-semibold">{plural(t.common.proceduresCount, list.length)}</span>
          </span>
        }
        title={s.name}
        intro={<p>{s.description}</p>}
      >
        <div className="flex flex-wrap items-center gap-3">
          {hasSavings ? (
            <Badge tone="green" className="text-sm">
              {fmt(t.common.savingsRange, { min: s.savings_min_pct!, max: s.savings_max_pct! })}
            </Badge>
          ) : null}
          <ButtonLink href={href(routes.hospitals)} variant="secondary" size="sm">
            {plural(t.common.hospitalsCount, hospitals.data.length)}
          </ButtonLink>
        </div>
      </PageHero>

      <div className="container-page space-y-12 py-8 sm:py-10">
        {hasSavings ? (
          <p className="text-slate-700">{fmt(t.treatments.specialtySavings, { min: s.savings_min_pct!, max: s.savings_max_pct! })}</p>
        ) : null}

        <section aria-labelledby="procedures-title">
          <SectionHeader id="procedures-title" title={t.treatments.specialtyProceduresTitle} />
          {list.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <li key={p.slug}>
                  <ProcedureCard t={t} procedure={p} fx={fx.data} />
                </li>
              ))}
            </ul>
          ) : (
            <InlineNote text={t.treatments.noProcedures} />
          )}
        </section>

        {hospitals.data.length ? (
          <section aria-labelledby="hospitals-title">
            <SectionHeader id="hospitals-title" title={fmt(t.treatments.specialtyHospitalsTitle, { specialty: s.name })} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {hospitals.data.slice(0, 9).map((h) => (
                <li key={h.slug}>
                  <HospitalCard t={t} hospital={h} fx={fx.data} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {specialists.length ? (
          <section aria-labelledby="doctors-title">
            <SectionHeader
              id="doctors-title"
              title={t.treatments.specialtyDoctorsTitle}
              action={
                <ButtonLink href={href(routes.doctors)} variant="secondary" size="sm">
                  {t.common.viewAll}
                </ButtonLink>
              }
            />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {specialists.map((d) => (
                <li key={d.slug}>
                  <DoctorCard t={t} doctor={d} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <AssessmentCta
          title={t.home.ctaTitle}
          body={t.home.ctaBody}
          button={t.common.getAssessment}
          specialty={s.slug}
        />
      </div>
    </>
  );
}
