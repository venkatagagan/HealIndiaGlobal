import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { getDoctors } from '@/lib/data/catalog';
import { toNumber } from '@/lib/money';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { DoctorCard } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { ListFilters } from '@/components/list-filters';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  const doctors = await getDoctors();
  return pageMetadata({
    path: routes.doctors,
    title: t.doctors.metaTitle,
    description: t.doctors.metaDescription,
    noindex: doctors.source === 'fallback',
  });
}

export default async function DoctorsPage() {
  const t = getDictionary();
  const intl = 'en';
  const doctors = await getDoctors();
  const list = doctors.data;
  const sortText = (a: string, b: string) => a.localeCompare(b, intl);

  const specialties = [...new Map(list.filter((d) => d.specialty).map((d) => [d.specialty!.slug, d.specialty!.name])).entries()].sort((a, b) =>
    sortText(a[1], b[1]),
  );
  const languages = [...new Set(list.flatMap((d) => d.languages))].sort(sortText);
  const genders = [...new Set(list.map((d) => (d.gender ?? '').toLowerCase()).filter((g) => g === 'male' || g === 'female'))];

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.doctors.title, path: href(routes.doctors) },
        ]}
        title={t.doctors.title}
        intro={fmt(t.doctors.intro, { count: plural(t.common.doctorsCount, list.length) })}
      />
      <div className="container-page space-y-10 py-6 sm:py-8">
        <ListFilters
          title={t.doctors.filtersTitle}
          anyLabel={t.doctors.any}
          resetLabel={t.doctors.reset}
          resultTemplates={t.doctors.results}
          emptyText={t.doctors.noResults}
          pluralRulesLocale={intl}
          filters={[
            { key: 'specialty', label: t.doctors.specialty, options: specialties.map(([value, label]) => ({ value, label })) },
            { key: 'language', label: t.doctors.language, options: languages.map((l) => ({ value: l, label: l })) },
            {
              key: 'gender',
              label: t.doctors.gender,
              options: genders.map((g) => ({ value: g, label: g === 'male' ? t.doctors.genderMale : t.doctors.genderFemale })),
            },
            { key: 'tele', label: t.doctors.teleconsult, options: [], checkbox: true },
          ]}
        >
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((d) => (
              <li
                key={d.slug}
                data-filter-item=""
                data-f-specialty={d.specialty?.slug ?? ''}
                data-f-language={d.languages.join('|')}
                data-f-gender={(d.gender ?? '').toLowerCase()}
                data-f-tele={d.teleconsult_available ? 'true' : 'false'}
                data-s-rating={toNumber(d.rating_avg) ?? ''}
              >
                <DoctorCard t={t} doctor={d} />
              </li>
            ))}
          </ul>
        </ListFilters>
        <InlineNote text={t.doctors.successRateNote} />
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
