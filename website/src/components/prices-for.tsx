'use client';

import { useId, useMemo, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { COUNTRY_CURRENCY } from '@/lib/visitor';
import { useIntlLocale } from './locale-provider';
import { useVisitor } from './visitor-provider';

export interface PricesForLabels {
  pricesFor: string;
  pricesIn: string;
  change: string;
  changeTitle: string;
  country: string;
  currency: string;
  done: string;
  detected: string;
}

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

export function useCountryName(): (code: string) => string {
  const intl = useIntlLocale();
  return useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([intl], { type: 'region' });
    } catch {
      names = null;
    }
    return (code: string) => {
      try {
        return names?.of(code.toUpperCase()) ?? code;
      } catch {
        return code;
      }
    };
  }, [intl]);
}

/**
 * "Prices for Nigeria · NGN · Change": the visitor's country and display currency (detected after hydration, saved
 * in cookies when changed). Renders nothing until detection has finished, so cached pages never show a country.
 */
export function PricesFor({ labels, className = '' }: { labels: PricesForLabels; className?: string }) {
  const visitor = useVisitor();
  const intl = useIntlLocale();
  const countryName = useCountryName();
  const id = useId();
  const [open, setOpen] = useState(false);
  const countries = useMemo(
    () =>
      Object.keys(COUNTRY_CURRENCY)
        .map((code) => ({ code, name: countryName(code) }))
        .sort((a, b) => a.name.localeCompare(b.name, intl)),
    [countryName, intl],
  );

  const selectCls =
    'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 focus:outline-none';
  const name = visitor.country ? countryName(visitor.country) : null;

  return (
    <div className={`text-sm text-slate-700 ${className}`}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Globe2 className="h-4 w-4 shrink-0 text-primary-700" aria-hidden="true" />
        {visitor.ready ? (
          <>
            {name ? <span className="font-medium text-slate-900">{fill(labels.pricesFor, { country: name })}</span> : null}
            <span>
              {name ? '· ' : ''}
              {fill(labels.pricesIn, { currency: visitor.currency })}
            </span>
          </>
        ) : (
          <span aria-hidden="true" className="inline-block h-4 w-32 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
        )}
        <span aria-hidden="true">·</span>
        <button
          type="button"
          className="font-semibold text-primary-700 underline underline-offset-4 hover:text-primary-800"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((v) => !v)}
        >
          {labels.change}
          <span className="sr-only"> - {labels.changeTitle}</span>
        </button>
      </p>
      {open ? (
        <div id={`${id}-panel`} role="group" aria-label={labels.changeTitle} className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-country`} className="mb-1 block text-xs font-medium text-slate-700">
                {labels.country}
              </label>
              <select
                id={`${id}-country`}
                className={selectCls}
                value={visitor.country ?? ''}
                onChange={(e) => visitor.setCountry(e.target.value)}
              >
                {visitor.country ? null : <option value="">-</option>}
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-currency`} className="mb-1 block text-xs font-medium text-slate-700">
                {labels.currency}
              </label>
              <select id={`${id}-currency`} className={selectCls} value={visitor.currency} onChange={(e) => visitor.setCurrency(e.target.value)}>
                {visitor.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {visitor.source === 'header' || visitor.source === 'accept_language' ? (
            <p className="mt-3 text-xs text-slate-600">{labels.detected}</p>
          ) : null}
          <button
            type="button"
            className="mt-3 rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => setOpen(false)}
          >
            {labels.done}
          </button>
        </div>
      ) : null}
    </div>
  );
}
