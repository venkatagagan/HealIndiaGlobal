import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { getFxRates, searchCatalog } from '@/lib/data/catalog';
import { getDestinations } from '@/lib/destinations';
import { illustration } from '@/lib/brand';
import { href, routes } from '@/lib/routes';
import { pageMetadata } from '@/lib/seo';
import { PageHero } from '@/components/page-hero';
import { DoctorCard, HospitalCard, ProcedureCard, SpecialtyTile } from '@/components/cards';
import { AssessmentCta } from '@/components/cta';
import { SectionHeader } from '@/components/ui';

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary();
  return pageMetadata({ path: routes.search, title: t.search.metaTitle, description: t.search.hint, noindex: true });
}

export default async function SearchPage({ searchParams }: Props) {
  const t = getDictionary();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? '';
  const [results, fx, destinations] = await Promise.all([searchCatalog(q), getFxRates(), getDestinations()]);
  const lc = q.toLowerCase();
  const cities = q.length >= 2 ? destinations.data.filter((d) => d.name.toLowerCase().includes(lc)).slice(0, 6) : [];
  const total = results.specialties.length + results.procedures.length + results.hospitals.length + results.doctors.length + cities.length;
  const art = illustration('no-results');

  return (
    <>
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: t.search.title, path: href(routes.search) },
        ]}
        title={q ? fmt(t.search.resultsFor, { q }) : t.search.title}
      >
        <form role="search" action={href(routes.search)} method="get" className="max-w-xl">
          <label htmlFor="search-q" className="sr-only">
            {t.search.label}
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white p-1.5">
            <Search className="ms-3 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            <input
              id="search-q"
              name="q"
              type="search"
              defaultValue={q}
              minLength={2}
              required
              placeholder={t.common.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 focus:outline-none"
            />
            <button type="submit" className="rounded-xl bg-night px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              {t.common.search}
            </button>
          </div>
        </form>
      </PageHero>
      <div className="container-page space-y-10 py-8 sm:py-10">
        {!q ? <p className="text-slate-700">{t.search.hint}</p> : null}
        {q && !total ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt="" width={240} height={180} className="h-40 w-auto" />
            ) : null}
            <p className="max-w-xl text-slate-700">{fmt(t.search.noResults, { q })}</p>
          </div>
        ) : null}
        {results.specialties.length ? (
          <section aria-labelledby="r-specialties">
            <SectionHeader id="r-specialties" title={t.search.specialties} />
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {results.specialties.map((s, i) => (
                <li key={s.slug}>
                  <SpecialtyTile t={t} specialty={s} index={i} dark={false} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {results.procedures.length ? (
          <section aria-labelledby="r-procedures">
            <SectionHeader id="r-procedures" title={t.search.procedures} />
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {results.procedures.map((p) => (
                <li key={p.slug}>
                  <ProcedureCard t={t} procedure={p} fx={fx.data} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {results.hospitals.length ? (
          <section aria-labelledby="r-hospitals">
            <SectionHeader id="r-hospitals" title={t.search.hospitals} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.hospitals.map((h) => (
                <li key={h.slug}>
                  <HospitalCard t={t} hospital={h} fx={fx.data} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {results.doctors.length ? (
          <section aria-labelledby="r-doctors">
            <SectionHeader id="r-doctors" title={t.search.doctors} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.doctors.map((d) => (
                <li key={d.slug}>
                  <DoctorCard t={t} doctor={d} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {cities.length ? (
          <section aria-labelledby="r-cities">
            <SectionHeader id="r-cities" title={t.destinations.title} />
            <ul className="flex flex-wrap gap-3">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link href={href(routes.city(c.slug))} className="inline-block rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium hover:border-primary-300">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <AssessmentCta title={t.home.ctaTitle} body={t.home.ctaBody} button={t.common.getAssessment} />
      </div>
    </>
  );
}
