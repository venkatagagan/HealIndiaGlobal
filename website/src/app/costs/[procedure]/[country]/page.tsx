import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, Globe2, Wallet } from 'lucide-react';
import { getDictionary, type Dictionary } from '@/i18n';
import { fmt } from '@/i18n/format';
import { formatMoney, formatMoneyRange } from '@/lib/money';
import { medicalProcedureLd } from '@/lib/jsonld';
import { href, routes } from '@/lib/routes';
import { pageMetadata, shortName, truncate } from '@/lib/seo';
import { costGuidesWithIntro, getCostGuide, type CostGuide } from '@/lib/growth/cost-guides';
import { growthWebPageLd } from '@/lib/growth/jsonld';
import { procedureCityLinksForProcedure } from '@/lib/growth/links';
import { PageHero } from '@/components/page-hero';
import { AssessmentCta } from '@/components/cta';
import { InlineNote } from '@/components/data-notice';
import { JsonLd } from '@/components/json-ld';
import { Fact, SectionHeader } from '@/components/ui';
import { IntroArticle } from '@/components/growth/intro-article';
import { RelatedLinks } from '@/components/growth/related-links';

export const revalidate = 3600;

type Props = { params: Promise<{ procedure: string; country: string }> };

/** Guides with an intro are prebuilt; other procedure x benchmark-country pairs render on demand (noindex). */
export async function generateStaticParams() {
  const guides = await costGuidesWithIntro();
  return guides.map((g) => ({ procedure: g.procedure.slug, country: g.slug }));
}

const range = (min: number, max: number, ccy: string) => formatMoneyRange(min, max, ccy, 'en', { approx: true });

function describe(g: CostGuide): string {
  const c = g.comparison;
  return `Indicative cost of ${g.procedure.name} at partner hospitals in India (${range(c.india.min, c.india.max, g.currency)}) next to a ${g.country} self-pay benchmark (${range(c.home!.min, c.home!.max, g.currency)}), with an itemised breakdown and sources.`;
}

function asOfDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { procedure, country } = await params;
  const g = await getCostGuide(procedure, country);
  if (!g) return {};
  return pageMetadata({
    path: routes.costGuide(g.procedure.slug, g.slug),
    title: [
      `${g.procedure.name} cost: India and ${g.country}`,
      `${g.procedure.name} cost: India vs ${g.country}`,
      `${shortName(g.procedure.name)} cost: India vs ${g.country}`,
      `${shortName(g.procedure.name)} cost in India`,
    ],
    description: truncate(g.intro?.summary ?? describe(g)),
    // Thin-page protection: indexable only with live data, a sourced benchmark and a reviewed intro.
    noindex: !g.indexable,
    type: 'article',
  });
}

function itemLabel(t: Dictionary, category: string): string {
  return t.procedure.itemized[category as keyof Dictionary['procedure']['itemized']] ?? category.replace(/_/g, ' ');
}

export default async function CostGuidePage({ params }: Props) {
  const { procedure, country } = await params;
  const t = getDictionary();
  const g = await getCostGuide(procedure, country);
  if (!g) notFound();
  const p = g.procedure;
  const c = g.comparison;
  const home = c.home!;
  const path = routes.costGuide(p.slug, g.slug);
  const title = `${p.name} cost: India and ${g.country}`;
  const [cityLinks, allGuides] = await Promise.all([
    procedureCityLinksForProcedure(p.slug).catch(() => []),
    costGuidesWithIntro().catch(() => []),
  ]);
  const otherCountries = allGuides
    .filter((x) => x.procedure.slug === p.slug && x.slug !== g.slug)
    .map((x) => ({ href: routes.costGuide(p.slug, x.slug), title: `India and ${x.country}` }));
  const fxDate = asOfDate(g.fxMeta?.asOf);
  const converted = g.currency !== g.india.currency;

  return (
    <>
      <JsonLd
        data={growthWebPageLd({
          path: href(path),
          name: title,
          description: g.intro?.summary ?? describe(g),
          about: medicalProcedureLd(p, href(routes.procedure(p.specialty.slug, p.slug))),
          intro: g.intro,
        })}
      />
      <PageHero
        crumbs={[
          { name: t.common.home, path: href(routes.home) },
          { name: 'Cost guides', path: href(routes.costs) },
          { name: title, path: href(path) },
        ]}
        eyebrow={
          <Link href={href(routes.procedure(p.specialty.slug, p.slug))} className="text-sm font-semibold tracking-wide text-primary-700 uppercase hover:underline">
            {p.name}
          </Link>
        }
        title={title}
        intro={
          <p>
            {g.intro?.summary ?? describe(g)} All figures are <strong>indicative</strong>, not quotes.
          </p>
        }
        aside={
          <section aria-labelledby="key-figures" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 id="key-figures" className="text-lg font-bold">
              Indicative figures ({g.currency})
            </h2>
            <dl className="mt-4 space-y-4">
              <Fact icon={<Wallet className="h-5 w-5" />} label="India, partner hospitals" value={range(c.india.min, c.india.max, g.currency)} />
              <Fact icon={<Globe2 className="h-5 w-5" />} label={`${g.country}, self-pay benchmark`} value={range(home.min, home.max, g.currency)} />
              {home.wait ? <Fact icon={<Clock className="h-5 w-5" />} label={`Typical wait in ${g.country} (benchmark)`} value={home.wait} /> : null}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">
              Excludes flights, visas, accommodation, local transport, insurance and follow-up care at home.
            </p>
          </section>
        }
      />

      <div className="container-page space-y-10 py-8 sm:py-10">
        {g.intro ? (
          <section aria-labelledby="intro-title">
            <SectionHeader id="intro-title" title="How to read these figures" />
            <IntroArticle intro={g.intro} />
          </section>
        ) : null}

        <section aria-labelledby="table-title">
          <SectionHeader id="table-title" title="Side by side" subtitle="Low and high ends of each indicative range." />
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-surface text-slate-700">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Where</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Low</th>
                  <th scope="col" className="px-5 py-3 font-semibold">High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {converted ? (
                  <tr>
                    <th scope="row" className="px-5 py-3 font-medium">India ({g.india.currency}, catalogue range)</th>
                    <td className="px-5 py-3">{formatMoney(g.india.min, g.india.currency, 'en')}</td>
                    <td className="px-5 py-3">{formatMoney(g.india.max, g.india.currency, 'en')}</td>
                  </tr>
                ) : null}
                <tr>
                  <th scope="row" className="px-5 py-3 font-medium">India ({g.currency}{converted ? ', converted' : ''})</th>
                  <td className="px-5 py-3">{formatMoney(c.india.min, g.currency, 'en', { approx: converted })}</td>
                  <td className="px-5 py-3">{formatMoney(c.india.max, g.currency, 'en', { approx: converted })}</td>
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-3 font-medium">{g.country} (benchmark, {g.currency})</th>
                  <td className="px-5 py-3">{formatMoney(home.min, g.currency, 'en')}</td>
                  <td className="px-5 py-3">{formatMoney(home.max, g.currency, 'en')}</td>
                </tr>
                {c.savings ? (
                  <tr>
                    <th scope="row" className="px-5 py-3 font-medium">Indicative difference</th>
                    <td className="px-5 py-3">{formatMoney(c.savings.min, g.currency, 'en', { approx: true })}</td>
                    <td className="px-5 py-3">{formatMoney(c.savings.max, g.currency, 'en', { approx: true })}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {c.savings ? (
            <p className="mt-3 text-sm text-slate-600">
              The difference compares like-for-like ends of the two ranges, before travel and accommodation. It is not a saving
              anyone can promise you.
            </p>
          ) : null}
        </section>

        {g.itemized.length ? (
          <section aria-labelledby="itemized-title">
            <SectionHeader
              id="itemized-title"
              title={t.procedure.itemizedTitle}
              subtitle={`An estimated split of a mid-range India price (${formatMoney(Math.round((c.india.min + c.india.max) / 2), g.currency, 'en', { approx: true })}). Your quote lists the real items.`}
            />
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[24rem] text-left text-sm">
                <thead className="bg-surface text-slate-700">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Item</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Share</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Approx. ({g.currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {g.itemized.map((row) => (
                    <tr key={row.category}>
                      <th scope="row" className="px-5 py-3 font-medium">{itemLabel(t, row.category)}</th>
                      <td className="px-5 py-3">{row.pct === 0 && row.amount > 0 ? '<1' : row.pct}%</td>
                      <td className="px-5 py-3">{formatMoney(row.amount, g.currency, 'en', { approx: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="sources-title" className="max-w-3xl">
          <SectionHeader id="sources-title" title="Sources and dates" />
          <ul className="list-disc space-y-2 ps-5 text-sm text-slate-700">
            <li>
              <strong>India range:</strong> the typical range listed for {p.name} in our catalogue of partner hospitals. See{' '}
              <Link href={href(routes.procedure(p.specialty.slug, p.slug))} className="text-primary-700 underline underline-offset-4">
                hospitals and their published prices
              </Link>
              .
            </li>
            <li>
              <strong>{g.country} benchmark:</strong> {g.benchmark.source?.trim() || 'source not yet recorded (this page is not indexed until it is)'}.
            </li>
            <li>
              <strong>Currency conversion:</strong> {g.fxMeta?.source ? `rates from ${g.fxMeta.source}` : 'the exchange rates stored on the platform'}
              {fxDate ? `, as of ${fxDate}` : ''}. Rates change daily; your quote states the rate it uses.
            </li>
            {g.itemized.length ? (
              <li>
                <strong>Breakdown:</strong> an estimated split from the platform&apos;s quote data, not a hospital&apos;s itemised bill.
              </li>
            ) : null}
          </ul>
        </section>

        <InlineNote tone="amber" text={fmt(t.procedure.disclaimer, { procedure: p.name })} />

        <AssessmentCta title={fmt(t.procedure.ctaTitle, { procedure: p.name })} body={t.procedure.ctaBody} button={t.common.getAssessment} specialty={p.specialty.slug} />

        <RelatedLinks id="related-cities" title={`${p.name} by city`} items={cityLinks} />
        <RelatedLinks id="related-countries" title={`${p.name}: other home countries`} items={otherCountries} />
      </div>
    </>
  );
}
