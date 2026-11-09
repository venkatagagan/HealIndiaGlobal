'use client';

import { useId, useMemo, useState } from 'react';
import { compare } from '@/lib/cost';
import { formatMoneyRange } from '@/lib/money';
import type { Benchmark, FxTable } from '@/lib/data/types';

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

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * Interactive "Treatment in {country} vs Treatment in India" comparison (design: Cost Comparison screen).
 * Everything is computed in the browser from the benchmarks and FX table passed by the server page, so it
 * makes no API calls; the server renders the default (US / USD) state for no-JS visitors and crawlers.
 */
export function CostCalculator({
  intl,
  labels,
  india,
  benchmarks,
  fx,
  countries,
  currencies,
  defaultCountry,
}: {
  intl: string;
  labels: CalculatorLabels;
  india: { min: number; max: number; currency: string };
  benchmarks: Benchmark[];
  fx: FxTable;
  /** Countries with a benchmark, names already localized by the server. */
  countries: { code: string; name: string }[];
  currencies: string[];
  defaultCountry: string;
}) {
  const id = useId();
  const initial = countries.find((c) => c.code === defaultCountry)?.code ?? countries[0]?.code ?? '';
  const [country, setCountry] = useState(initial);
  const initialBenchmark = benchmarks.find((b) => b.country_code === initial);
  const [currency, setCurrency] = useState(initialBenchmark?.currency ?? 'USD');

  const benchmark = benchmarks.find((b) => b.country_code === country) ?? null;
  const countryName = countries.find((c) => c.code === country)?.name ?? country;
  const result = useMemo(() => compare(india, benchmark, currency, fx), [india, benchmark, currency, fx]);
  const money = (min: number, max: number) => formatMoneyRange(min, max, currency, intl, { approx: true });

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-6">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        {countries.length ? (
          <div>
            <label htmlFor={`${id}-country`} className="mb-1.5 block text-sm font-medium text-slate-800">
              {labels.country}
            </label>
            <select
              id={`${id}-country`}
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                const b = benchmarks.find((x) => x.country_code === e.target.value);
                if (b && currencies.includes(b.currency)) setCurrency(b.currency);
              }}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 focus:outline-none"
            >
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
          <select
            id={`${id}-currency`}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 focus:outline-none"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div aria-live="polite" className="mt-5 grid gap-4 sm:grid-cols-2">
        {result?.home ? (
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900">{fill(labels.homeTitle, { country: countryName })}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-600">{labels.cost}</dt>
                <dd className="text-lg font-bold text-slate-900">{money(result.home.min, result.home.max)}</dd>
              </div>
              {result.home.wait ? (
                <div>
                  <dt className="text-slate-600">{labels.waitTime}</dt>
                  <dd className="font-semibold text-slate-900">{result.home.wait}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
        {result ? (
          <div className={`rounded-2xl border-2 border-health-500 p-4 ${result.home ? '' : 'sm:col-span-2'}`}>
            <h3 className="font-semibold text-slate-900">{labels.indiaTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-600">{labels.cost}</dt>
                <dd className="text-lg font-bold text-slate-900">{money(result.india.min, result.india.max)}</dd>
              </div>
              <div>
                <dt className="text-slate-600">{labels.waitTime}</dt>
                <dd className="font-semibold text-slate-900">{labels.indiaWait}</dd>
              </div>
              {result.home ? (
                <div>
                  <dt className="text-slate-600">{labels.savingsTitle}</dt>
                  <dd className="font-bold text-brand-ink">
                    {result.savings
                      ? `${money(result.savings.min, result.savings.max)} (${fill(labels.savingsPct, {
                          min: result.savings.pctMin,
                          max: result.savings.pctMax,
                        })})`
                      : labels.noSavings}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>
      {!benchmarks.length ? <p className="mt-4 text-sm text-slate-600">{labels.noBenchmark}</p> : null}
      <p className="mt-4 text-xs text-slate-600">{labels.fxNote}</p>
    </div>
  );
}
