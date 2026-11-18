'use client';

import { useId, useMemo } from 'react';
import { CalendarCheck } from 'lucide-react';
import { compare } from '@/lib/cost';
import { formatMoneyRange } from '@/lib/money';
import type { Benchmark } from '@/lib/data/types';
import type { Dictionary } from '@/i18n/dictionaries/en';
import { EstimateSource } from './estimate-source';
import { useVisitor } from './visitor-provider';

export interface CalculatorLabels {
  country: string;
  currency: string;
  homeTitle: string;
  indiaTitle: string;
  cost: string;
  waitTime: string;
  indiaWait: string;
  savingsTitle: string;
  savingsPct: string;
  noSavings: string;
  noBenchmark: string;
  fxNote: string;
}

export type PriceLabels = Dictionary['prices'];

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

function formatDay(iso: string, intl: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/**
 * Interactive "Treatment in {country} vs Treatment in India" comparison (design: Cost Comparison screen).
 * Computed in the browser from the benchmarks passed by the server page and the FX table of the VisitorProvider
 * (no API calls). The server renders the default example country in USD for no-JS visitors and crawlers; after
 * hydration the visitor's country and currency apply. Home prices and savings appear only when the legal display
 * rule passes (lib/cost.ts); otherwise the card leads with wait times and availability.
 */
export function CostCalculator({
  intl,
  labels,
  priceLabels,
  india,
  benchmarks,
  countries,
  defaultCountry,
  earliestAdmission = null,
}: {
  intl: string;
  labels: CalculatorLabels;
  priceLabels: PriceLabels;
  india: { min: number; max: number; currency: string };
  benchmarks: Benchmark[];
  /** Countries with a benchmark, names already localized by the server. */
  countries: { code: string; name: string }[];
  defaultCountry: string;
  /** Earliest free admission slot (ISO date) at a hospital offering the procedure. */
  earliestAdmission?: string | null;
}) {
  const id = useId();
  const visitor = useVisitor();
  const fallback = countries.find((c) => c.code === defaultCountry)?.code ?? countries[0]?.code ?? '';
  const visitorHasBenchmark = !!visitor.country && countries.some((c) => c.code === visitor.country);
  const country = visitor.ready && visitorHasBenchmark ? visitor.country! : fallback;
  const currency = visitor.currency;

  const benchmark = benchmarks.find((b) => b.country_code === country) ?? null;
  const countryName = countries.find((c) => c.code === country)?.name ?? country;
  const result = useMemo(() => compare(india, benchmark, currency, visitor.fx), [india, benchmark, currency, visitor.fx]);
  const money = (min: number, max: number) => formatMoneyRange(min, max, result?.currency ?? currency, intl, { approx: true });
  const showExampleNote = visitor.ready && !!visitor.country && !visitorHasBenchmark && !!country;
  let visitorName = visitor.country ?? '';
  try {
    visitorName = visitor.country ? (new Intl.DisplayNames([intl], { type: 'region' }).of(visitor.country) ?? visitor.country) : '';
  } catch {
    /* keep the code */
  }

  const selectCls =
    'block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 focus:outline-none';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {countries.length ? (
          <div>
            <label htmlFor={`${id}-country`} className="mb-1.5 block text-sm font-medium text-slate-800">
              {labels.country}
            </label>
            <select id={`${id}-country`} value={country} onChange={(e) => visitor.setCountry(e.target.value)} className={selectCls}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor={`${id}-currency`} className="mb-1.5 block text-sm font-medium text-slate-800">
            {labels.currency}
          </label>
          <select id={`${id}-currency`} value={currency} onChange={(e) => visitor.setCurrency(e.target.value)} className={selectCls}>
            {visitor.currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </form>
      {showExampleNote ? (
        <p className="mt-3 text-sm text-slate-600">{fill(priceLabels.exampleCountry, { visitor: visitorName, country: countryName })}</p>
      ) : null}

      <div aria-live="polite" className="mt-5 grid gap-4 sm:grid-cols-2">
        {result?.home ? (
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">{fill(labels.homeTitle, { country: countryName })}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-600">{labels.cost}</dt>
                <dd className="text-lg font-bold text-slate-900">{money(result.home.min, result.home.max)}</dd>
                <dd>
                  <EstimateSource benchmark={result.benchmark} labels={priceLabels} />
                </dd>
              </div>
              {result.home.wait ? (
                <div>
                  <dt className="text-slate-600">{labels.waitTime}</dt>
                  <dd className="font-semibold text-slate-900">{result.home.wait}</dd>
                  {result.benchmark?.waitSource ? (
                    <dd className="text-xs text-slate-600">{fill(priceLabels.waitSource, { source: result.benchmark.waitSource })}</dd>
                  ) : null}
                </div>
              ) : null}
            </dl>
          </div>
        ) : result?.homeWait ? (
          // The price comparison is not allowed for this country: lead with the wait time instead.
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">{fill(labels.homeTitle, { country: countryName })}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-600">{fill(priceLabels.homeWait, { country: countryName })}</dt>
                <dd className="text-lg font-bold text-slate-900">{result.homeWait}</dd>
                {result.benchmark?.waitSource ? (
                  <dd className="text-xs text-slate-600">{fill(priceLabels.waitSource, { source: result.benchmark.waitSource })}</dd>
                ) : null}
              </div>
            </dl>
          </div>
        ) : null}
        {result ? (
          <div className={`rounded-2xl border-2 border-health-500 p-4 ${result.home || result.homeWait ? '' : 'sm:col-span-2'}`}>
            <h3 className="font-semibold text-slate-900">{labels.indiaTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-600">{labels.waitTime}</dt>
                <dd className="font-semibold text-slate-900">{labels.indiaWait}</dd>
                {earliestAdmission ? (
                  <dd className="mt-1 inline-flex items-center gap-1.5 text-health-800">
                    <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                    {fill(priceLabels.earliestAdmission, { date: formatDay(earliestAdmission, intl) })}
                  </dd>
                ) : null}
              </div>
              <div>
                <dt className="text-slate-600">{labels.cost}</dt>
                <dd className="text-lg font-bold text-slate-900">{money(result.india.min, result.india.max)}</dd>
              </div>
              {result.savings ? (
                <div>
                  <dt className="text-slate-600">{labels.savingsTitle}</dt>
                  <dd className="font-bold text-brand-ink">
                    {`${money(result.savings.min, result.savings.max)} (${fill(labels.savingsPct, {
                      min: result.savings.pctMin,
                      max: result.savings.pctMax,
                    })})`}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>
      {result && !result.allowed && result.benchmark ? (
        <p className="mt-4 text-sm text-slate-600">{fill(priceLabels.noComparison, { country: countryName })}</p>
      ) : null}
      {!benchmarks.length ? <p className="mt-4 text-sm text-slate-600">{labels.noBenchmark}</p> : null}
      <p className="mt-4 text-xs text-slate-600">{labels.fxNote}</p>
    </div>
  );
}
