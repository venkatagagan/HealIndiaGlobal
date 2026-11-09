import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { featuredOrder, getFxRates, getHospitals } from '@/lib/data/catalog';
import { toNumber } from '@/lib/money';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { HospitalCard } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { ListFilters } from '@/components/list-filters';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  const hospitals = await getHospitals();
  return pageMetadata({
    path: routes.hospitals,
    title: t.hospitals.metaTitle,
    description: t.hospitals.metaDescription,
    noindex: hospitals.source === 'fallback',
  });
}

const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];

export default async function HospitalsPage() {
  const t = getDictionary();
  const intl = 'en';
  const [hospitals, fx] = await Promise.all([getHospitals(), getFxRates()]);
  const list = featuredOrder(hospitals.data, hospitals.source);
  const sortText = (a: string, b: string) => a.localeCompare(b, intl);

  const cities = uniq(list.map((h) => h.city)).sort(sortText);
  const specialties = uniq(list.flatMap((h) => h.specialties)).sort(sortText);
  const accreditations = uniq(list.flatMap((h) => h.accreditations.map((a) => a.toLowerCase())));
  const languages = uniq(list.flatMap((h) => h.languages)).sort(sortText);
  const accLabel = (a: string) => t.common.accreditations[a as keyof typeof t.common.accreditations] ?? a.toUpperCase();

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.hospitals.title, path: href(routes.hospitals) },
        ]}
        title={t.hospitals.title}
        intro={fmt(t.hospitals.intro, { count: plural(t.common.hospitalsCount, list.length) })}
      />
      <div className="container-page space-y-10 py-6 sm:py-8">
        <ListFilters
          title={t.hospitals.filtersTitle}
          anyLabel={t.hospitals.any}
          resetLabel={t.hospitals.reset}
          resultTemplates={t.hospitals.results}
          emptyText={t.hospitals.noResults}
          pluralRulesLocale={intl}
          filters={[
            { key: 'city', label: t.hospitals.city, options: cities.map((c) => ({ value: c, label: c })) },
            { key: 'specialty', label: t.hospitals.specialty, options: specialties.map((s) => ({ value: s, label: s })) },
            { key: 'accreditation', label: t.hospitals.accreditation, options: accreditations.map((a) => ({ value: a, label: accLabel(a) })) },
            { key: 'language', label: t.hospitals.language, options: languages.map((l) => ({ value: l, label: l })) },
          ]}
          sort={{
            label: t.hospitals.sort,
            options: [
              { value: 'rating', label: t.hospitals.sortRating, numeric: true, desc: true },
              { value: 'price', label: t.hospitals.sortPrice, numeric: true },
              { value: 'name', label: t.hospitals.sortName },
            ],
          }}
        >
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((h) => (
              <li
                key={h.slug}
                data-filter-item=""
                data-f-city={h.city}
                data-f-specialty={h.specialties.join('|')}
                data-f-accreditation={h.accreditations.map((a) => a.toLowerCase()).join('|')}
                data-f-language={h.languages.join('|')}
                data-s-rating={toNumber(h.rating_avg) ?? ''}
                data-s-price={h.starting_price_minor ?? ''}
                data-s-name={h.name}
              >
                <HospitalCard t={t} hospital={h} fx={fx.data} />
              </li>
            ))}
          </ul>
        </ListFilters>
        <InlineNote text={t.hospitals.accreditationVerify} />
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
