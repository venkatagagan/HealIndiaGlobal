'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FxTable } from '@/lib/data/types';
import {
  COUNTRY_COOKIE,
  CURRENCY_COOKIE,
  VISITOR_COUNTRY_PATH,
  acceptLanguageCountry,
  currencyForCountry,
  normalizeCountry,
  normalizeCurrency,
  readCookie,
  writeCookie,
  type CountrySource,
} from '@/lib/visitor';

/** Currency shown before the visitor is known (server render, crawlers, no JS): matches the server-rendered HTML. */
export const DEFAULT_DISPLAY_CURRENCY = 'USD';

export interface VisitorState {
  /** ISO country of the visitor (null until detected, or when unknown). */
  country: string | null;
  source: CountrySource;
  /** Display currency for approximate conversions and comparisons. */
  currency: string;
  /** True once detection has finished in the browser (always false during the server render). */
  ready: boolean;
  fx: FxTable;
  /** Currencies we can convert to (FX rate known), display order. */
  currencies: string[];
  setCountry: (country: string) => void;
  setCurrency: (currency: string) => void;
}

const noop = () => {};
const VisitorContext = createContext<VisitorState>({
  country: null,
  source: 'none',
  currency: DEFAULT_DISPLAY_CURRENCY,
  ready: false,
  fx: { INR: 1 },
  currencies: ['INR', DEFAULT_DISPLAY_CURRENCY],
  setCountry: noop,
  setCurrency: noop,
});

const SESSION_KEY = 'hig_visitor_detected';

async function detectCountry(): Promise<{ country: string | null; source: CountrySource }> {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as { country: string | null; source: CountrySource } | null;
    if (cached && 'country' in cached) return cached;
  } catch {
    /* storage unavailable */
  }
  let result: { country: string | null; source: CountrySource };
  try {
    const res = await fetch(VISITOR_COUNTRY_PATH, { cache: 'no-store', credentials: 'same-origin' });
    const body = (await res.json()) as { country?: unknown; source?: unknown };
    const country = normalizeCountry(typeof body.country === 'string' ? body.country : null);
    result = { country, source: country ? (body.source === 'header' ? 'header' : 'accept_language') : 'none' };
  } catch {
    const country = acceptLanguageCountry((navigator.languages ?? [navigator.language]).join(','));
    result = { country, source: country ? 'accept_language' : 'none' };
  }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(result));
  } catch {
    /* storage unavailable */
  }
  return result;
}

/**
 * Visitor country + display currency for client components. Pages are cached and identical for everyone, so the
 * server render (and the first client render) always use the neutral default; the visitor's country is applied
 * after hydration. An explicit choice is kept in cookies (lib/visitor.ts); detection is never stored in a cookie.
 */
export function VisitorProvider({ fx, currencies, children }: { fx: FxTable; currencies: string[]; children: ReactNode }) {
  const [country, setCountryState] = useState<string | null>(null);
  const [source, setSource] = useState<CountrySource>('none');
  const [currency, setCurrencyState] = useState(DEFAULT_DISPLAY_CURRENCY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const savedCountry = normalizeCountry(readCookie(COUNTRY_COOKIE));
    const savedCurrency = normalizeCurrency(readCookie(CURRENCY_COOKIE));
    const apply = (code: string | null, from: CountrySource) => {
      if (!alive) return;
      setCountryState(code);
      setSource(from);
      setCurrencyState(savedCurrency && currencies.includes(savedCurrency) ? savedCurrency : currencyForCountry(code, currencies));
      setReady(true);
    };
    if (savedCountry) apply(savedCountry, 'cookie');
    else detectCountry().then((d) => apply(d.country, d.source));
    return () => {
      alive = false;
    };
  }, [currencies]);

  const setCountry = useCallback(
    (code: string) => {
      const next = normalizeCountry(code);
      if (!next) return;
      writeCookie(COUNTRY_COOKIE, next);
      // A new country brings its own currency; a separately chosen currency is forgotten.
      writeCookie(CURRENCY_COOKIE, null);
      setCountryState(next);
      setSource('cookie');
      setCurrencyState(currencyForCountry(next, currencies));
      setReady(true);
    },
    [currencies],
  );

  const setCurrency = useCallback(
    (code: string) => {
      const next = normalizeCurrency(code);
      if (!next || !currencies.includes(next)) return;
      writeCookie(CURRENCY_COOKIE, next);
      setCurrencyState(next);
    },
    [currencies],
  );

  const value = useMemo<VisitorState>(
    () => ({ country, source, currency, ready, fx, currencies, setCountry, setCurrency }),
    [country, source, currency, ready, fx, currencies, setCountry, setCurrency],
  );
  return <VisitorContext.Provider value={value}>{children}</VisitorContext.Provider>;
}

export function useVisitor(): VisitorState {
  return useContext(VisitorContext);
}
