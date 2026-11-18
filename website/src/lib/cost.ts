/** Cost comparison maths shared by the server pages and the interactive calculator (client). */
import { convertMinor } from './money';
import type { Benchmark, FxTable } from './data/types';

/** Provenance of a home-country benchmark, shown as "Estimate · source (year)" next to every home price. */
export interface BenchmarkSource {
  countryCode: string;
  source: string | null;
  sourceUrl: string | null;
  year: number | null;
  confidence: string | null;
  waitSource: string | null;
}

/** Why no home-vs-India price comparison may be shown (null = it may). */
export type NoClaimReason = 'no_benchmark' | 'no_fx' | 'no_source' | 'low_confidence' | 'not_cheaper';

export interface Comparison {
  currency: string;
  india: { min: number; max: number };
  /** Home price range: ONLY present when the comparison may be shown (`allowed`). */
  home: { min: number; max: number; wait: string | null } | null;
  /** Saving range: only present when the comparison may be shown. */
  savings: { min: number; max: number; pctMin: number; pctMax: number } | null;
  /** Typical home wait time (benchmark), shown whether or not the price comparison is allowed. */
  homeWait: string | null;
  benchmark: BenchmarkSource | null;
  /** The legal display rule passed: a home-vs-India price/saving comparison may be shown. */
  allowed: boolean;
  reason: NoClaimReason | null;
}

const CLAIM_CONFIDENCE = new Set(['medium', 'high']);

/**
 * Legal display rule (owner, 2026-11): a home-vs-India price or saving comparison may be shown ONLY when the
 * benchmark's confidence is medium or high AND India is cheaper at BOTH ends of the range (like-for-like: India low <
 * home low and India high < home high), and the benchmark names its source (every home price is shown as
 * "Estimate · source"). Otherwise pages lead with wait time / availability and make no saving claim.
 */
export function savingClaimReason(
  benchmark: Pick<Benchmark, 'confidence' | 'source'> | null | undefined,
  home: { min: number; max: number } | null,
  india: { min: number; max: number },
): NoClaimReason | null {
  if (!benchmark) return 'no_benchmark';
  if (!home) return 'no_fx';
  if (!benchmark.source?.trim()) return 'no_source';
  if (!CLAIM_CONFIDENCE.has((benchmark.confidence ?? '').trim().toLowerCase())) return 'low_confidence';
  if (!(india.min < home.min && india.max < home.max)) return 'not_cheaper';
  return null;
}

function sourceOf(b: Benchmark): BenchmarkSource {
  const url = b.source_url?.trim() ?? '';
  return {
    countryCode: b.country_code,
    source: b.source?.trim() || null,
    // Only http(s) links are rendered.
    sourceUrl: /^https?:\/\//i.test(url) ? url : null,
    year: b.price_year ?? null,
    confidence: b.confidence?.trim().toLowerCase() || null,
    waitSource: b.wait_source?.trim() || null,
  };
}

/**
 * Compare a home-country benchmark with the India price range, both converted to `currency`.
 * Like-for-like ends: saving(low) = home(low) - india(low), saving(high) = home(high) - india(high).
 * `home` and `savings` are null unless the legal display rule passes (see `savingClaimReason`).
 */
export function compare(
  india: { min: number; max: number; currency: string },
  benchmark: Benchmark | null | undefined,
  currency: string,
  fx: FxTable,
): Comparison | null {
  const iMin = convertMinor(india.min, india.currency, currency, fx);
  const iMax = convertMinor(india.max, india.currency, currency, fx);
  if (iMin === null || iMax === null) return null;
  const indiaRange = { min: iMin, max: iMax };
  if (!benchmark) {
    return { currency, india: indiaRange, home: null, savings: null, homeWait: null, benchmark: null, allowed: false, reason: 'no_benchmark' };
  }
  const meta = sourceOf(benchmark);
  const homeWait = benchmark.wait_time_text?.trim() || null;

  const a = convertMinor(benchmark.cost_min_minor, benchmark.currency, currency, fx);
  const b = convertMinor(benchmark.cost_max_minor, benchmark.currency, currency, fx);
  const home = a === null || b === null ? null : { min: Math.min(a, b), max: Math.max(a, b) };
  const reason = savingClaimReason(benchmark, home, indiaRange);
  if (reason || !home) {
    return { currency, india: indiaRange, home: null, savings: null, homeWait, benchmark: meta, allowed: false, reason: reason ?? 'no_fx' };
  }

  const lowSaving = home.min - iMin;
  const highSaving = home.max - iMax;
  const pctLow = (lowSaving / home.min) * 100;
  const pctHigh = (highSaving / home.max) * 100;
  return {
    currency,
    india: indiaRange,
    home: { ...home, wait: homeWait },
    savings: {
      min: Math.min(lowSaving, highSaving),
      max: Math.max(lowSaving, highSaving),
      pctMin: Math.max(0, Math.round(Math.min(pctLow, pctHigh))),
      pctMax: Math.max(0, Math.round(Math.max(pctLow, pctHigh))),
    },
    homeWait,
    benchmark: meta,
    allowed: true,
    reason: null,
  };
}

/** Currencies offered in the calculator (PLAN §6.3 supported_currencies), filtered by available FX rates. */
export const DISPLAY_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'OMR', 'QAR', 'KWD', 'INR', 'NGN', 'KES', 'BDT', 'AUD', 'CAD'];

/** Currencies a visitor can choose: the calculator list first, then any other currency with an FX rate. */
export function displayCurrencies(fx: FxTable): string[] {
  const known = DISPLAY_CURRENCIES.filter((c) => c === 'INR' || fx[c]);
  const extra = Object.keys(fx)
    .filter((c) => /^[A-Z]{3}$/.test(c) && (fx[c] ?? 0) > 0 && !known.includes(c))
    .sort();
  return [...known, ...extra];
}
