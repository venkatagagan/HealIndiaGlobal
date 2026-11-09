import 'server-only';

/**
 * Procedure x city pages (/treatments/<specialty>/<procedure>/<city>, city = destination slug such as "delhi-ncr").
 *
 * A combination EXISTS only when at least MIN_HOSPITALS listed (active/approved) hospitals in the destination publish a
 * price (range or package) for the procedure AND the procedure has at least one home-country cost benchmark.
 * It is INDEXABLE only when, in addition, the data came from the live API (not fallback) and a reviewed hand-written
 * intro exists (content/en/procedure-city/<procedure>-<city>.md, see content/README.md section 10, "Website-only pages").
 */
import { cache } from 'react';
import { getHospital, getProcedure, getProcedures } from '@/lib/data/catalog';
import { getDestinations, type Destination } from '@/lib/destinations';
import type { DataSource, HospitalDetail, HospitalProcedure, Procedure } from '@/lib/data/types';
import type { ReviewerMap } from '@/lib/medical-review';
import { procedureCityIntro, type Intro } from './collections';

export const MIN_HOSPITALS = 2;

export interface CityOffering {
  hospital: HospitalDetail;
  offering: HospitalProcedure;
  /** Lowest/highest published price for this hospital (range ends and package prices), in `currency`. */
  min: number;
  max: number;
  currency: string;
}

export interface ProcedureCity {
  procedure: Procedure;
  destination: Destination;
  offerings: CityOffering[];
}

export interface ProcedureCityStatus {
  intro: Intro | null;
  source: DataSource;
  indexable: boolean;
  /** Why the page is noindex (for logs and the authoring guide), null when indexable. */
  reason: string | null;
}

/** Published price span of one hospital offering, or null when the hospital shows no price. */
function priceSpan(hp: HospitalProcedure): { min: number; max: number; currency: string } | null {
  const values: number[] = [];
  if (hp.price_min_minor !== null) values.push(hp.price_min_minor);
  if (hp.price_max_minor !== null) values.push(hp.price_max_minor);
  // Packages in another currency are ignored here (the offering currency is the reference).
  for (const pk of hp.packages ?? []) if (pk.currency === hp.currency && pk.price_minor > 0) values.push(pk.price_minor);
  const positive = values.filter((v) => v > 0);
  if (!positive.length) return null;
  return { min: Math.min(...positive), max: Math.max(...positive), currency: hp.currency };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Every procedure x destination combination that passes the data threshold (cached per render/build). */
export const getProcedureCities = cache(async (): Promise<{ data: ProcedureCity[]; source: DataSource }> => {
  const [procedures, destinations] = await Promise.all([getProcedures(), getDestinations()]);
  let fallback = procedures.source === 'fallback' || destinations.source === 'fallback';

  const destinationOf = new Map<string, Destination>();
  for (const d of destinations.data) for (const h of d.hospitals) destinationOf.set(h.slug, d);
  const details = await mapLimit([...destinationOf.keys()], 6, (slug) => getHospital(slug));

  const groups = new Map<string, { procedure: string; destination: Destination; offerings: CityOffering[] }>();
  for (const loaded of details) {
    const h = loaded.data;
    if (!h) continue;
    if (loaded.source === 'fallback') fallback = true;
    const destination = destinationOf.get(h.slug);
    if (!destination) continue;
    for (const hp of h.procedures) {
      const span = priceSpan(hp);
      if (!span) continue;
      const key = `${hp.procedure.slug}|${destination.slug}`;
      const group = groups.get(key) ?? { procedure: hp.procedure.slug, destination, offerings: [] };
      if (!group.offerings.some((o) => o.hospital.slug === h.slug)) group.offerings.push({ hospital: h, offering: hp, ...span });
      groups.set(key, group);
    }
  }

  const candidates = [...groups.values()].filter((g) => g.offerings.length >= MIN_HOSPITALS);
  const procedureSlugs = [...new Set(candidates.map((c) => c.procedure))];
  const procedureDetails = new Map<string, Procedure>();
  for (const loaded of await mapLimit(procedureSlugs, 6, (slug) => getProcedure(slug))) {
    if (loaded.source === 'fallback') fallback = true;
    if (loaded.data) procedureDetails.set(loaded.data.slug, loaded.data);
  }

  const data: ProcedureCity[] = [];
  for (const c of candidates) {
    const procedure = procedureDetails.get(c.procedure);
    if (!procedure || !procedure.benchmarks.length) continue; // a cost benchmark is required
    const offerings = [...c.offerings].sort((a, b) => a.hospital.name.localeCompare(b.hospital.name));
    data.push({ procedure, destination: c.destination, offerings });
  }
  data.sort((a, b) => a.procedure.name.localeCompare(b.procedure.name) || a.destination.name.localeCompare(b.destination.name));
  return { data, source: fallback ? 'fallback' : 'api' };
});

export async function getProcedureCity(procedureSlug: string, citySlug: string) {
  const all = await getProcedureCities();
  const combo = all.data.find((c) => c.procedure.slug === procedureSlug && c.destination.slug === citySlug) ?? null;
  return { combo, source: all.source };
}

/** `reviewers`: pass getReviewers() (live list); the indexability gate needs a real, active reviewer. */
export function procedureCityStatus(combo: ProcedureCity, source: DataSource, reviewers?: ReviewerMap): ProcedureCityStatus {
  const intro = procedureCityIntro(combo.procedure.slug, combo.destination.slug, reviewers);
  const reason =
    source === 'fallback'
      ? 'built from fallback (sample) data'
      : !intro
        ? 'no hand-written intro'
        : !intro.reviewed
          ? 'intro not yet approved by a named reviewer (or too short)'
          : null;
  return { intro, source, indexable: reason === null, reason };
}
