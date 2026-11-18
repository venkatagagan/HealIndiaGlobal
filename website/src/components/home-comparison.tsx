'use client';

import { useMemo } from 'react';
import Link from '@/components/link';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { compare, type Comparison } from '@/lib/cost';
import { formatMoneyRange } from '@/lib/money';
import type { Benchmark } from '@/lib/data/types';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { EstimateSource } from './estimate-source';
import { PricesFor } from './prices-for';
import { useIntlLocale } from './locale-provider';
import { useVisitor } from './visitor-provider';
import { Badge, SectionHeader } from './ui';

export interface HomeComparisonItem {
  slug: string;
  name: string;
  href: string;
  india: { min: number; max: number; currency: string };
  benchmarks: Benchmark[];
  /** Earliest free admission slot (ISO date) at a hospital offering the procedure. */
  earliestAdmission: string | null;
}

export interface HomeComparisonLabels {
  home: Pick<
    Dictionary['home'],
    | 'heroCardTitle'
    | 'heroCardIn'
    | 'heroCardCost'
    | 'heroCardWait'
    | 'heroCardSavings'
    | 'heroCardNote'
    | 'savingsTitle'
    | 'savingsSubtitle'
    | 'savingsHome'
    | 'savingsIndia'
    | 'savingsYouSave'
    | 'savingsNote'
  >;
  prices: Dictionary['prices'];
  india: string;
  viewDetails: string;
  indiaWait: string;
}

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

function day(iso: string, intl: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function regionName(code: string, intl: string): string {
  try {
    return new Intl.DisplayNames([intl], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The home country used on the home page: the visitor's country when at least one featured procedure has a
 * benchmark for it, else the admin-picked example country (also what the cached HTML shows).
 */
function useHomeCountry(items: HomeComparisonItem[], defaultCountry: string) {
  const visitor = useVisitor();
  const visitorCovered = !!visitor.country && items.some((i) => i.benchmarks.some((b) => b.country_code === visitor.country));
  const country = visitor.ready && visitorCovered ? visitor.country! : defaultCountry;
  const results = useMemo(
    () =>
      items.map((item) => ({
        item,
        result: compare(item.india, item.benchmarks.find((b) => b.country_code === country) ?? null, visitor.currency, visitor.fx),
      })),
    [items, country, visitor.currency, visitor.fx],
  );
  return { country, results, exampleFor: visitor.ready && visitor.country && !visitorCovered ? visitor.country : null };
}

function Availability({ date, labels, intl }: { date: string | null; labels: Dictionary['prices']; intl: string }) {
  if (!date) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-health-800">
      <CalendarCheck className="h-4 w-4" aria-hidden="true" />
      {fill(labels.earliestAdmission, { date: day(date, intl) })}
    </span>
  );
}

/** Hero card: home vs India when the legal display rule allows it, else India price + wait times + availability. */
export function HomeHeroComparison({
  item,
  defaultCountry,
  labels,
}: {
  item: HomeComparisonItem;
  defaultCountry: string;
  labels: HomeComparisonLabels;
}) {
  const intl = useIntlLocale();
  const items = useMemo(() => [item], [item]);
  const { country, results, exampleFor } = useHomeCountry(items, defaultCountry);
  const result: Comparison | null = results[0]?.result ?? null;
  if (!result) return null;
  const place = regionName(country, intl);
  const money = (min: number, max: number) => formatMoneyRange(min, max, result.currency, intl, { approx: true });
  const l = labels.home;

  return (
    <div
      className="relative rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_24px_60px_-28px_rgb(16_42_67/0.35)] sm:p-7"
      aria-labelledby="hero-compare-title"
    >
      <span aria-hidden="true" className="absolute inset-x-7 top-0 h-px bg-gradient-to-r from-transparent via-champagne to-transparent" />
      <p id="hero-compare-title" className="text-sm font-semibold tracking-[0.06em] text-slate-600 uppercase">
        {l.heroCardTitle}
      </p>
      <p className="font-display mt-1 text-xl font-semibold text-slate-900">{item.name}</p>
      <PricesFor labels={labels.prices} className="mt-2" />
      {exampleFor ? <p className="mt-2 text-xs text-slate-600">{fill(labels.prices.exampleCountry, { visitor: regionName(exampleFor, intl), country: place })}</p> : null}
      <dl className={`mt-5 grid ${result.home || result.homeWait ? 'grid-cols-2 divide-x divide-slate-200 rtl:divide-x-reverse' : ''} rounded-xl border border-slate-200`}>
        {result.home ? (
          <div className="p-4">
            <dt className="text-sm font-semibold text-slate-800">{fill(l.heroCardIn, { place })}</dt>
            <dd className="mt-3 text-xs text-slate-600">{l.heroCardCost}</dd>
            <dd className="font-semibold text-slate-900">{money(result.home.min, result.home.max)}</dd>
            <dd>
              <EstimateSource benchmark={result.benchmark} labels={labels.prices} />
            </dd>
            {result.home.wait ? (
              <>
                <dd className="mt-2 text-xs text-slate-600">{l.heroCardWait}</dd>
                <dd className="text-sm font-semibold text-slate-800">{result.home.wait}</dd>
              </>
            ) : null}
          </div>
        ) : result.homeWait ? (
          <div className="p-4">
            <dt className="text-sm font-semibold text-slate-800">{fill(l.heroCardIn, { place })}</dt>
            <dd className="mt-3 text-xs text-slate-600">{fill(labels.prices.homeWait, { country: place })}</dd>
            <dd className="text-lg font-semibold text-slate-900">{result.homeWait}</dd>
            {result.benchmark?.waitSource ? (
              <dd className="mt-1 text-xs text-slate-600">{fill(labels.prices.waitSource, { source: result.benchmark.waitSource })}</dd>
            ) : null}
          </div>
        ) : null}
        <div className="bg-primary-50/50 p-4">
          <dt className="text-sm font-semibold text-slate-800">{fill(l.heroCardIn, { place: labels.india })}</dt>
          <dd className="mt-3 text-xs text-slate-600">{l.heroCardCost}</dd>
          <dd className="font-semibold text-slate-900">{money(result.india.min, result.india.max)}</dd>
          {result.savings ? (
            <>
              <dd className="mt-2 text-xs text-slate-600">{l.heroCardSavings}</dd>
              <dd className="text-sm font-semibold text-health-700">
                {money(result.savings.min, result.savings.max)} ({result.savings.pctMin}–{result.savings.pctMax}%)
              </dd>
            </>
          ) : (
            <>
              <dd className="mt-2 text-xs text-slate-600">{l.heroCardWait}</dd>
              <dd className="text-sm font-semibold text-slate-800">{labels.indiaWait}</dd>
            </>
          )}
          {item.earliestAdmission ? (
            <dd className="mt-2">
              <Availability date={item.earliestAdmission} labels={labels.prices} intl={intl} />
            </dd>
          ) : null}
        </div>
      </dl>
      <p className="mt-4 text-xs text-slate-600">
        {result.benchmark && !result.allowed ? fill(labels.prices.noComparison, { country: place }) : fill(l.heroCardNote, { procedure: item.name })}
      </p>
      <Link href={item.href} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-800">
        {labels.viewDetails}
        <ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** "Cost savings examples" section; without any allowed comparison it becomes "Prices and wait times". */
export function HomeExamples({
  items,
  defaultCountry,
  labels,
}: {
  items: HomeComparisonItem[];
  defaultCountry: string;
  labels: HomeComparisonLabels;
}) {
  const intl = useIntlLocale();
  const { country, results } = useHomeCountry(items, defaultCountry);
  const place = regionName(country, intl);
  const anyClaim = results.some((r) => r.result?.allowed);
  const l = labels.home;
  const shown = results.filter((r): r is { item: HomeComparisonItem; result: Comparison } => !!r.result);
  if (!shown.length) return null;

  return (
    <section className="bg-surface py-12 sm:py-16" aria-labelledby="savings-title">
      <div className="container-page">
        <SectionHeader
          id="savings-title"
          title={anyClaim ? l.savingsTitle : labels.prices.examplesTitleNoClaim}
          subtitle={fill(anyClaim ? l.savingsSubtitle : labels.prices.examplesSubtitleNoClaim, { country: place })}
        />
        <PricesFor labels={labels.prices} className="-mt-2 mb-5" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map(({ item, result }) => (
            <li key={item.slug} className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h3 className="font-semibold text-slate-900">
                <Link href={item.href} className="after:absolute after:inset-0 after:content-[''] hover:text-primary-800">
                  {item.name}
                </Link>
              </h3>
              <dl className="mt-4 space-y-2 text-sm">
                {result.home ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">{fill(l.savingsHome, { country: place })}</dt>
                    <dd className="text-end font-medium">{formatMoneyRange(result.home.min, result.home.max, result.currency, intl, { approx: true })}</dd>
                  </div>
                ) : result.homeWait ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">{fill(labels.prices.homeWait, { country: place })}</dt>
                    <dd className="text-end font-medium">{result.homeWait}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">{l.savingsIndia}</dt>
                  <dd className="text-end font-medium">{formatMoneyRange(result.india.min, result.india.max, result.currency, intl, { approx: true })}</dd>
                </div>
              </dl>
              {result.home ? (
                <p className="relative z-10 mt-2">
                  <EstimateSource benchmark={result.benchmark} labels={labels.prices} />
                </p>
              ) : null}
              <div className="mt-auto space-y-2 pt-4">
                {result.savings ? (
                  <Badge tone="green" className="text-sm">
                    {l.savingsYouSave}: {result.savings.pctMin}–{result.savings.pctMax}%
                  </Badge>
                ) : null}
                <Availability date={item.earliestAdmission} labels={labels.prices} intl={intl} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-600">{anyClaim ? l.savingsNote : fill(labels.prices.noComparison, { country: place })}</p>
      </div>
    </section>
  );
}
