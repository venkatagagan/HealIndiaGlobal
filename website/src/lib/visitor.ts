/**
 * Visitor country and display currency (shared by the server route /visitor-country and client components).
 *
 * Pages are statically generated / ISR-cached and identical for every visitor. The visitor's country is therefore
 * never used while rendering a page on the server: the browser asks /visitor-country once (no-store, never cached),
 * remembers an explicit choice in the `hig_country` / `hig_currency` cookies and personalises prices client-side
 * (components/visitor-provider.tsx). Detection order: the visitor's saved choice (cookie) -> a trusted CDN country
 * header (only when SITE_TRUST_COUNTRY_HEADER names it) -> the region of the browser's Accept-Language -> none.
 */

export const COUNTRY_COOKIE = 'hig_country';
export const CURRENCY_COOKIE = 'hig_currency';
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const VISITOR_COUNTRY_PATH = '/visitor-country';

export type CountrySource = 'cookie' | 'header' | 'accept_language' | 'none';

const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK'.split(' ');

/**
 * ISO 3166-1 alpha-2 -> ISO 4217. Mirrors backend app/core/currency.py COUNTRY_CURRENCY (keep both in sync).
 */
export const COUNTRY_CURRENCY: Readonly<Record<string, string>> = {
  IN: 'INR', BD: 'BDT', NP: 'NPR', BT: 'BTN', LK: 'LKR', MV: 'MVR', MM: 'MMK', AF: 'AFN', PK: 'PKR', SA: 'SAR',
  AE: 'AED', OM: 'OMR', KW: 'KWD', QA: 'QAR', BH: 'BHD', YE: 'YER', IQ: 'IQD', IR: 'IRR', JO: 'JOD', LB: 'LBP',
  SY: 'SYP', EG: 'EGP', TR: 'TRY', IL: 'ILS', UZ: 'UZS', KZ: 'KZT', TJ: 'TJS', KG: 'KGS', TM: 'TMT', AZ: 'AZN',
  AM: 'AMD', GE: 'GEL', RU: 'RUB', UA: 'UAH', BY: 'BYN', MN: 'MNT', NG: 'NGN', GH: 'GHS', KE: 'KES', TZ: 'TZS',
  UG: 'UGX', RW: 'RWF', BI: 'BIF', ET: 'ETB', SO: 'SOS', DJ: 'DJF', ER: 'ERN', SD: 'SDG', SS: 'SSP', ZM: 'ZMW',
  ZW: 'USD', MZ: 'MZN', MW: 'MWK', AO: 'AOA', CD: 'CDF', CG: 'XAF', CM: 'XAF', GA: 'XAF', TD: 'XAF', CF: 'XAF',
  GQ: 'XAF', CI: 'XOF', SN: 'XOF', ML: 'XOF', BF: 'XOF', NE: 'XOF', BJ: 'XOF', TG: 'XOF', GW: 'XOF', GN: 'GNF',
  SL: 'SLE', LR: 'LRD', GM: 'GMD', MA: 'MAD', DZ: 'DZD', TN: 'TND', LY: 'LYD', ZA: 'ZAR', BW: 'BWP', NA: 'NAD',
  LS: 'LSL', SZ: 'SZL', MG: 'MGA', MU: 'MUR', SC: 'SCR', KM: 'KMF', CN: 'CNY', JP: 'JPY', KR: 'KRW', SG: 'SGD',
  MY: 'MYR', TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND', KH: 'KHR', LA: 'LAK', AU: 'AUD', NZ: 'NZD', FJ: 'FJD',
  PG: 'PGK', US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', EC: 'USD',
  PA: 'USD', SV: 'USD', TT: 'TTD', JM: 'JMD', GY: 'GYD', SR: 'SRD', GB: 'GBP', CH: 'CHF', NO: 'NOK', SE: 'SEK',
  DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', AL: 'ALL', MK: 'MKD',
  BA: 'BAM', MD: 'MDL',
  ...Object.fromEntries(EURO.map((c) => [c, 'EUR'])),
};

/** Codes CDNs use for "unknown", Tor, anonymous proxies or regions rather than countries. */
const NOT_A_COUNTRY = new Set(['XX', 'ZZ', 'T1', 'A1', 'A2', 'O1', 'AP', 'EU']);

/** Upper-case ISO 3166-1 alpha-2 code, or null. */
export function normalizeCountry(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && !NOT_A_COUNTRY.has(code) ? code : null;
}

/** Upper-case ISO 4217 code, or null. */
export function normalizeCurrency(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * The display currency for a country: its own currency when we can convert to it (`available`), else USD (backend
 * DEFAULT_PATIENT_CURRENCY).
 */
export function currencyForCountry(country: string | null | undefined, available: readonly string[]): string {
  const ccy = country ? COUNTRY_CURRENCY[country.toUpperCase()] : undefined;
  return ccy && available.includes(ccy) ? ccy : 'USD';
}

/** Region of the most preferred Accept-Language tag that has one ("fr-CA;q=0.8" -> "CA"); mirrors the backend. */
export function acceptLanguageCountry(header: string | null | undefined): string | null {
  if (!header) return null;
  let best: string | null = null;
  let bestQ = 0;
  for (const part of header.split(',').slice(0, 20)) {
    const [tag = '', ...params] = part.trim().split(';');
    const qParam = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
    const q = qParam === undefined ? 1 : Number(qParam);
    if (!(q > bestQ)) continue; // ties: the earlier tag wins
    const region = tag
      .replace(/_/g, '-')
      .split('-')
      .slice(1)
      .map((s) => (/^[A-Za-z]{2}$/.test(s) ? normalizeCountry(s) : null))
      .find((r): r is string => !!r);
    if (region) {
      best = region;
      bestQ = q;
    }
  }
  return best;
}

/** Read one cookie in the browser (null on the server or when unset). */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function writeCookie(name: string, value: string | null): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    value === null
      ? `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
      : `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${VISITOR_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
