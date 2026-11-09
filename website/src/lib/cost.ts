/** Cost comparison maths shared by the server pages and the interactive calculator (client). */
import { convertMinor } from './money';
import type { Benchmark, FxTable } from './data/types';

export interface Comparison {
  currency: string;
  home: { min: number; max: number; wait: string | null } | null;
  india: { min: number; max: number };
  savings: { min: number; max: number; pctMin: number; pctMax: number } | null;
}

/**
 * Compare a home-country benchmark with the India price range, both converted to `currency`.
 * Like-for-like ends: saving(low) = home(low) - india(low), saving(high) = home(high) - india(high).
 * Savings are null when the benchmark is missing or India is not cheaper at either end.
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
  if (!benchmark) return { currency, home: null, india: { min: iMin, max: iMax }, savings: null };

  const hMin = convertMinor(benchmark.cost_min_minor, benchmark.currency, currency, fx);
  const hMax = convertMinor(benchmark.cost_max_minor, benchmark.currency, currency, fx);
  if (hMin === null || hMax === null) return { currency, home: null, india: { min: iMin, max: iMax }, savings: null };

  const lowSaving = hMin - iMin;
  const highSaving = hMax - iMax;
  const low = Math.max(0, Math.min(lowSaving, highSaving));
  const high = Math.max(0, Math.max(lowSaving, highSaving));
  const pctLow = hMin > 0 ? (lowSaving / hMin) * 100 : 0;
  const pctHigh = hMax > 0 ? (highSaving / hMax) * 100 : 0;
  const savings =
    high > 0
      ? {
          min: low,
          max: high,
          pctMin: Math.max(0, Math.round(Math.min(pctLow, pctHigh))),
          pctMax: Math.max(0, Math.round(Math.max(pctLow, pctHigh))),
        }
      : null;

  return {
    currency,
    home: { min: hMin, max: hMax, wait: benchmark.wait_time_text },
    india: { min: iMin, max: iMax },
    savings,
  };
}

/** Currencies offered in the calculator (PLAN §6.3 supported_currencies), filtered by available FX rates. */
export const DISPLAY_CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'OMR', 'QAR', 'KWD', 'INR', 'NGN', 'KES', 'BDT', 'AUD', 'CAD'];
