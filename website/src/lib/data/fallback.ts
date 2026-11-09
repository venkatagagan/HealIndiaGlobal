import 'server-only';

/**
 * Offline fallback catalogue. Built from src/data/seed-data.json (exported from backend/scripts/seed_data by
 * scripts/export-seed.py) or, when that file is empty, from the small built-in fictional dataset.
 * Produces exactly the public API shapes (PLAN §8.4) so pages do not care where data came from.
 */
import seedJson from '@/data/seed-data.json';
import { builtinData } from '@/data/builtin-data';
import { toNumber } from '@/lib/money';
import type {
  Benchmark,
  CulturalTip,
  DoctorCard,
  DoctorDetail,
  FxTable,
  HospitalCard,
  HospitalDetail,
  HospitalProcedure,
  Procedure,
  Ref,
  Specialty,
} from './types';

type Num = number | string | null | undefined;

export interface RawSeed {
  source?: string;
  specialties: {
    slug: string;
    name: string;
    icon?: string | null;
    savings_min_pct?: Num;
    savings_max_pct?: Num;
    description?: string | null;
    sort_order?: number;
  }[];
  procedures: {
    slug: string;
    specialty: string;
    name: string;
    description?: string | null;
    hospital_stay_days?: Num;
    recovery_days?: Num;
    total_stay_days?: Num;
    india_price_min_minor?: Num;
    india_price_max_minor?: Num;
    currency?: string;
  }[];
  benchmarks?: {
    procedure: string;
    country_code: string;
    currency: string;
    cost_min_minor: Num;
    cost_max_minor: Num;
    wait_time_text?: string | null;
  }[];
  hospitals: {
    slug: string;
    name: string;
    description?: string | null;
    city: string;
    state?: string | null;
    address?: string | null;
    lat?: Num;
    lng?: Num;
    logo_url?: string | null;
    cover_image_url?: string | null;
    accreditations?: string[];
    established_year?: Num;
    bed_count?: Num;
    languages?: string[];
    international_desk?: boolean;
    airport_distance_km?: Num;
    rating_avg?: Num;
    rating_count?: Num;
    is_featured?: boolean;
    specialties?: string[];
    offerings?: string[];
    price_factor?: Num;
    offering_details?: {
      procedure: string;
      currency?: string;
      price_min_minor?: Num;
      price_max_minor?: Num;
      success_rate_pct?: Num;
      inclusions?: string[];
      exclusions?: string[];
    }[];
  }[];
  doctors?: {
    slug: string;
    full_name: string;
    gender?: string | null;
    photo_url?: string | null;
    hospital: string;
    specialty: string;
    sub_specialties?: string[];
    qualifications?: string[];
    experience_years?: Num;
    languages?: string[];
    bio?: string | null;
    success_rate_pct?: Num;
    rating_avg?: Num;
    rating_count?: Num;
    consultation_fee_minor?: Num;
    currency?: string;
    teleconsult_available?: boolean;
  }[];
  fx_rates?: Record<string, Num>;
  cultural_tips?: { category?: string | null; title: string; body: string; image_url?: string | null }[];
}

export interface FallbackCatalog {
  source: string;
  specialties: Specialty[];
  procedures: Procedure[];
  hospitals: HospitalDetail[];
  doctors: DoctorDetail[];
  fx: FxTable;
  tips: CulturalTip[];
}

const n = (v: Num): number | null => toNumber(v ?? null);

/** Price-list friendly rounding of INR minor units (Rs 1,000 steps above Rs 1 lakh, as in the seed). */
function roundInr(paise: number): number {
  const rupees = paise / 100;
  const step = rupees >= 100_000 ? 1000 : rupees >= 10_000 ? 500 : 100;
  return Math.round(rupees / step) * step * 100;
}

function isUsableSeed(value: unknown): value is RawSeed {
  const v = value as Partial<RawSeed> | null;
  return (
    !!v &&
    Array.isArray(v.specialties) &&
    v.specialties.length > 0 &&
    Array.isArray(v.procedures) &&
    v.procedures.length > 0 &&
    Array.isArray(v.hospitals)
  );
}

function build(raw: RawSeed): FallbackCatalog {
  const specialtyBySlug = new Map(raw.specialties.map((s) => [s.slug, s]));
  const specRef = (slug: string): Ref => ({
    id: `fb-spec-${slug}`,
    slug,
    name: specialtyBySlug.get(slug)?.name ?? slug,
  });

  const benchmarksBy = new Map<string, Benchmark[]>();
  for (const b of raw.benchmarks ?? []) {
    const list = benchmarksBy.get(b.procedure) ?? [];
    list.push({
      country_code: b.country_code,
      currency: b.currency,
      cost_min_minor: n(b.cost_min_minor) ?? 0,
      cost_max_minor: n(b.cost_max_minor) ?? 0,
      wait_time_text: b.wait_time_text ?? null,
    });
    benchmarksBy.set(b.procedure, list);
  }

  const procedures: Procedure[] = raw.procedures.map((p) => ({
    id: `fb-proc-${p.slug}`,
    slug: p.slug,
    name: p.name,
    description: p.description ?? '',
    specialty: specRef(p.specialty),
    hospital_stay_days: n(p.hospital_stay_days),
    recovery_days: n(p.recovery_days),
    total_stay_days: n(p.total_stay_days),
    india_price_min_minor: n(p.india_price_min_minor),
    india_price_max_minor: n(p.india_price_max_minor),
    currency: p.currency ?? 'INR',
    benchmarks: benchmarksBy.get(p.slug) ?? [],
  }));
  const procBySlug = new Map(procedures.map((p) => [p.slug, p]));

  const specialties: Specialty[] = [...raw.specialties]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => ({
      id: `fb-spec-${s.slug}`,
      slug: s.slug,
      name: s.name,
      description: s.description ?? '',
      icon: s.icon ?? null,
      savings_min_pct: n(s.savings_min_pct),
      savings_max_pct: n(s.savings_max_pct),
      procedures_count: procedures.filter((p) => p.specialty.slug === s.slug).length,
    }));

  // Hospitals (without doctors first; doctors attach below).
  const hospitals: HospitalDetail[] = raw.hospitals.map((h) => {
    const id = `fb-hosp-${h.slug}`;
    const details = new Map((h.offering_details ?? []).map((d) => [d.procedure, d]));
    const factor = n(h.price_factor) ?? 1;
    const hospProcedures: HospitalProcedure[] = (h.offerings ?? [])
      .map((slug): HospitalProcedure | null => {
        const proc = procBySlug.get(slug);
        if (!proc) return null;
        const d = details.get(slug);
        const min =
          n(d?.price_min_minor) ??
          (proc.india_price_min_minor !== null ? roundInr(proc.india_price_min_minor * factor) : null);
        const max =
          n(d?.price_max_minor) ??
          (proc.india_price_max_minor !== null ? roundInr(proc.india_price_max_minor * factor) : null);
        return {
          id: `fb-hp-${h.slug}-${slug}`,
          hospital_id: id,
          procedure: { id: proc.id, slug: proc.slug, name: proc.name },
          price_min_minor: min,
          price_max_minor: max,
          currency: d?.currency ?? proc.currency,
          hospital_stay_days: proc.hospital_stay_days,
          success_rate_pct: n(d?.success_rate_pct),
          inclusions: d?.inclusions ?? [],
          exclusions: d?.exclusions ?? [],
          packages: [],
        };
      })
      .filter((x): x is HospitalProcedure => x !== null);
    const prices = hospProcedures.map((p) => p.price_min_minor).filter((v): v is number => v !== null);
    return {
      id,
      slug: h.slug,
      name: h.name,
      city: h.city,
      state: h.state ?? null,
      accreditations: h.accreditations ?? [],
      rating_avg: n(h.rating_avg),
      rating_count: n(h.rating_count) ?? 0,
      logo_url: h.logo_url ?? null,
      cover_image_url: h.cover_image_url ?? null,
      specialties: (h.specialties ?? []).map((s) => specialtyBySlug.get(s)?.name ?? s),
      languages: h.languages ?? [],
      international_desk: h.international_desk ?? false,
      starting_price_minor: prices.length ? Math.min(...prices) : null,
      currency: 'INR',
      description: h.description ?? null,
      address: h.address ?? null,
      lat: n(h.lat),
      lng: n(h.lng),
      established_year: n(h.established_year),
      bed_count: n(h.bed_count),
      airport_distance_km: n(h.airport_distance_km),
      doctors: [],
      procedures: hospProcedures,
      reviews: [],
    };
  });
  const hospBySlug = new Map(hospitals.map((h) => [h.slug, h]));

  const doctors: DoctorDetail[] = (raw.doctors ?? [])
    .map((d): DoctorDetail | null => {
      const hosp = hospBySlug.get(d.hospital);
      if (!hosp) return null;
      const procs = hosp.procedures.filter((hp) => procBySlug.get(hp.procedure.slug)?.specialty.slug === d.specialty);
      return {
        id: `fb-doc-${d.slug}`,
        slug: d.slug,
        full_name: d.full_name,
        gender: d.gender ?? null,
        photo_url: d.photo_url ?? null,
        specialty: specRef(d.specialty),
        qualifications: d.qualifications ?? [],
        experience_years: n(d.experience_years),
        languages: d.languages ?? [],
        success_rate_pct: n(d.success_rate_pct),
        rating_avg: n(d.rating_avg),
        rating_count: n(d.rating_count) ?? 0,
        consultation_fee_minor: n(d.consultation_fee_minor),
        currency: d.currency ?? 'INR',
        teleconsult_available: d.teleconsult_available ?? false,
        hospital: { id: hosp.id, slug: hosp.slug, name: hosp.name, city: hosp.city, accreditations: hosp.accreditations },
        bio: d.bio ?? null,
        sub_specialties: d.sub_specialties ?? [],
        procedures: procs,
        next_available_date: null,
      };
    })
    .filter((x): x is DoctorDetail => x !== null);

  for (const h of hospitals) {
    h.doctors = doctors.filter((d) => d.hospital?.slug === h.slug).map(toDoctorCard);
  }

  const fx: FxTable = {};
  for (const [ccy, rate] of Object.entries(raw.fx_rates ?? {})) {
    const value = n(rate);
    if (value && value > 0) fx[ccy.toUpperCase()] = value;
  }
  fx.INR = 1;

  const tips: CulturalTip[] = (raw.cultural_tips ?? []).map((t, i) => ({
    id: `fb-tip-${i + 1}`,
    title: t.title,
    body: t.body,
    category: t.category ?? null,
    image_url: t.image_url ?? null,
  }));

  return { source: raw.source ?? 'seed', specialties, procedures, hospitals, doctors, fx, tips };
}

export function toDoctorCard(d: DoctorDetail): DoctorCard {
  return {
    id: d.id,
    slug: d.slug,
    full_name: d.full_name,
    gender: d.gender,
    photo_url: d.photo_url,
    specialty: d.specialty,
    qualifications: d.qualifications,
    experience_years: d.experience_years,
    languages: d.languages,
    success_rate_pct: d.success_rate_pct,
    rating_avg: d.rating_avg,
    rating_count: d.rating_count,
    consultation_fee_minor: d.consultation_fee_minor,
    currency: d.currency,
    teleconsult_available: d.teleconsult_available,
    hospital: d.hospital,
  };
}

export function toHospitalCard(h: HospitalDetail): HospitalCard {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    city: h.city,
    state: h.state,
    accreditations: h.accreditations,
    rating_avg: h.rating_avg,
    rating_count: h.rating_count,
    logo_url: h.logo_url,
    cover_image_url: h.cover_image_url,
    specialties: h.specialties,
    languages: h.languages,
    international_desk: h.international_desk,
    starting_price_minor: h.starting_price_minor,
    currency: h.currency,
  };
}

let catalog: FallbackCatalog | null = null;

export function fallbackCatalog(): FallbackCatalog {
  if (!catalog) catalog = build(isUsableSeed(seedJson) ? (seedJson as unknown as RawSeed) : builtinData);
  return catalog;
}

/** Featured hospitals in the fallback dataset (seed `is_featured`), used for ordering on the home page. */
export function fallbackFeaturedSlugs(): string[] {
  const raw = isUsableSeed(seedJson) ? (seedJson as unknown as RawSeed) : builtinData;
  return raw.hospitals.filter((h) => h.is_featured).map((h) => h.slug);
}

