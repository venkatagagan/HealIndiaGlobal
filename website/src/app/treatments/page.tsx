import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { fmt, plural } from '@/i18n/format';
import { getFxRates, getHospitals, getProcedures, getSpecialties } from '@/lib/data/catalog';
import { formatMoney } from '@/lib/money';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { ProcedureCard, SpecialtyTile } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { SectionHeader } from '@/components/ui';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  const specialties = await getSpecialties();
  return pageMetadata({
    path: routes.treatments,
    title: t.treatments.metaTitle,
    description: t.treatments.metaDescription,
    noindex: specialties.source === 'fallback',
  });
}

export default async function TreatmentsPage() {
  const t = getDictionary();
  const [specialties, procedures, fx, hospitals] = await Promise.all([getSpecialties(), getProcedures(), getFxRates(), getHospitals()]);

  const bySpecialty = new Map<string, typeof procedures.data>();
  for (const p of procedures.data) {
    const list = bySpecialty.get(p.specialty.slug) ?? [];
    list.push(p);
    bySpecialty.set(p.specialty.slug, list);
  }
  const fromPrice = (slug: string): string | null => {
    const priced = (bySpecialty.get(slug) ?? []).filter((p) => p.india_price_min_minor !== null);
    if (!priced.length) return null;
    const cheapest = priced.reduce((a, b) => (b.india_price_min_minor! < a.india_price_min_minor! ? b : a));
    return fmt(t.common.from, { amount: formatMoney(cheapest.india_price_min_minor!, cheapest.currency, 'en') });
  };
  const popular = specialties.data
    .map((s) => bySpecialty.get(s.slug)?.[0])
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 8);

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.treatments.title, path: href(routes.treatments) },
        ]}
        title={t.treatments.title}
        intro={fmt(t.treatments.intro, {
          specialties: specialties.data.length,
          procedures: procedures.data.length,
        })}
        facts={[
          `${specialties.data.length} specialties`,
          plural(t.common.proceduresCount, procedures.data.length),
          `${plural(t.common.hospitalsCount, hospitals.data.length)}`,
        ]}
      />

      <div className="container-page space-y-12 py-8 sm:py-10">
        <section aria-labelledby="all-specialties">
          <SectionHeader id="all-specialties" title={t.treatments.allSpecialties} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {specialties.data.map((s, i) => (
              <li key={s.slug}>
                <SpecialtyTile
                  t={t}
                  specialty={s}
                  index={i}
                  dark={false}
                  topProcedures={(bySpecialty.get(s.slug) ?? []).map((p) => p.name)}
                  fromPrice={fromPrice(s.slug)}
                />
              </li>
            ))}
          </ul>
        </section>

        {popular.length ? (
          <section aria-labelledby="popular-procedures">
            <SectionHeader id="popular-procedures" title={t.treatments.popularTitle} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {popular.map((p) => (
                <li key={p.slug}>
                  <ProcedureCard t={t} procedure={p} fx={fx.data} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="by-specialty" className="space-y-10">
          <h2 id="by-specialty" className="sr-only">
            {t.treatments.procedures}
          </h2>
          {specialties.data.map((s) => {
            const list = bySpecialty.get(s.slug) ?? [];
            if (!list.length) return null;
            return (
              <div key={s.slug}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xl font-bold tracking-tight text-slate-900">
                    <Link href={href(routes.specialty(s.slug))} className="hover:text-primary-800 hover:underline">
                      {s.name}
                    </Link>
                  </h3>
                  <span className="text-sm text-slate-600">{plural(t.common.proceduresCount, list.length)}</span>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((p) => (
                    <li key={p.slug}>
                      <ProcedureCard t={t} procedure={p} fx={fx.data} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
