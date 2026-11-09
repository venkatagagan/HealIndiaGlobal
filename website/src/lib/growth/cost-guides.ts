import 'server-only';

/**
 * Cost guides by home country (/costs/<procedure>/<country>, country = English country-name slug, e.g.
 * "united-states"). All figures are indicative: the India range is the catalogue's typical range for the procedure
 * (the same one the procedure page and calculator use), the home range is the stored cost benchmark, and
 * conversions use the live FX table.
 *
 * A guide EXISTS when the procedure has a benchmark for the country and an India price. It is INDEXABLE only when
 * the data came from the live API, the benchmark names its source, and a reviewed intro exists
 * (content/en/cost-guides/<procedure>-<country>.md, see content/README.md section 10, "Website-only pages").
 */
import { cache } from 'react';
import { countryName } from '@/i18n/format';
import { compare, type Comparison } from '@/lib/cost';
import { getCostComparison, getFxMeta, getFxRates, getProcedure } from '@/lib/data/catalog';
import type { Benchmark, DataSource, FxTable, Procedure } from '@/lib/data/types';
import { slugify } from '@/lib/slug';
import { getReviewers } from '@/lib/medical-review';
import { costGuideIntro, costGuideIntros, type Intro } from './collections';

export function countrySlug(code: string): string {
  return slugify(countryName(code));
}

export interface ItemizedShare {
  category: string;
  /** Share of the total, 0-100 (rounded). */
  pct: number;
  /** Amount in the home currency, from the India mid-range price. */
  amount: number;
}

export interface CostGuide {
  procedure: Procedure;
  benchmark: Benchmark;
  countryCode: string;
  country: string;
  slug: string;
  /** The home-country currency; every converted figure on the page uses it. */
  currency: string;
  comparison: Comparison;
  /** India range in its own catalogue currency (usually INR). */
  india: { min: number; max: number; currency: string };
  itemized: ItemizedShare[];
  fx: FxTable;
  fxMeta: { source: string | null; asOf: string | null } | null;
  intro: Intro | null;
  source: DataSource;
  indexable: boolean;
  reason: string | null;
}

export const getCostGuide = cache(async (procedureSlug: string, slug: string): Promise<CostGuide | null> => {
  const p = await getProcedure(procedureSlug);
  const procedure = p.data;
  if (!procedure || procedure.india_price_min_minor === null || procedure.india_price_max_minor === null) return null;
  const benchmark = procedure.benchmarks.find((b) => countrySlug(b.country_code) === slug);
  if (!benchmark) return null;

  const currency = benchmark.currency;
  const [fx, fxMeta, apiComparison] = await Promise.all([
    getFxRates(),
    getFxMeta(),
    getCostComparison(procedure.slug, benchmark.country_code, currency),
  ]);
  const india = { min: procedure.india_price_min_minor, max: procedure.india_price_max_minor, currency: procedure.currency };
  const comparison = compare(india, benchmark, currency, fx.data);
  if (!comparison?.home) return null; // no FX rate for the home currency: nothing honest to show

  // The API itemizes its own India mid-price; keep only the shares and apply them to this page's mid-range figure.
  const rows = apiComparison?.home.country_code === benchmark.country_code ? apiComparison.itemized : [];
  const total = rows.reduce((sum, r) => sum + r.amount_minor, 0);
  const mid = Math.round((comparison.india.min + comparison.india.max) / 2);
  const itemized: ItemizedShare[] =
    total > 0 ? rows.map((r) => ({ category: r.category, pct: Math.round((r.amount_minor / total) * 100), amount: Math.round((mid * r.amount_minor) / total) })) : [];

  const source: DataSource = p.source === 'fallback' || fx.source === 'fallback' ? 'fallback' : 'api';
  const intro = costGuideIntro(procedure.slug, benchmark.country_code, await getReviewers());
  const reason =
    source === 'fallback'
      ? 'built from fallback (sample) data'
      : !benchmark.source?.trim()
        ? 'benchmark has no source'
        : !intro
          ? 'no reviewed intro'
          : !intro.reviewed
            ? 'intro not yet approved by a named reviewer (or too short)'
            : null;

  return {
    procedure,
    benchmark,
    countryCode: benchmark.country_code,
    country: countryName(benchmark.country_code),
    slug,
    currency,
    comparison,
    india,
    itemized,
    fx: fx.data,
    fxMeta,
    intro,
    source,
    indexable: reason === null,
    reason,
  };
});

/** Guides that have a (visible) intro: these are prebuilt, listed on /costs and linked from other pages. */
export async function costGuidesWithIntro(): Promise<CostGuide[]> {
  const out: CostGuide[] = [];
  for (const intro of costGuideIntros()) {
    const guide = await getCostGuide(intro.procedure, countrySlug(intro.place));
    if (guide) out.push(guide);
  }
  return out.sort((a, b) => a.procedure.name.localeCompare(b.procedure.name) || a.country.localeCompare(b.country));
}
