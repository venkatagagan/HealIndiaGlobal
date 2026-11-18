/** Public catalogue shapes (PLAN §8.4). Money is integer minor units + ISO-4217 currency. */

export interface Ref {
  id: string;
  slug: string;
  name: string;
}

export interface Specialty {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  savings_min_pct: number | null;
  savings_max_pct: number | null;
  procedures_count: number;
}

export interface Benchmark {
  country_code: string;
  currency: string;
  cost_min_minor: number;
  cost_max_minor: number;
  wait_time_text: string | null;
  /** Where the benchmark comes from (shown as "Estimate · source (year)" next to every home price). */
  source?: string | null;
  source_url?: string | null;
  price_year?: number | null;
  /** "high" | "medium" | "low": how well the source matches a self-pay price. Savings need medium or high. */
  confidence?: string | null;
  /** Where the home wait time comes from. */
  wait_source?: string | null;
}

/** An amount converted to the viewer's currency by the API (display only; payments use the original amount). */
export interface DisplayMoney {
  amount_minor: number;
  currency: string;
  fx_rate: string;
  approximate: boolean;
}

/** An accreditation a platform admin has checked (certificate seen, still valid). */
export interface AccreditationBadge {
  body: string;
  valid_until: string | null;
}

export interface Procedure {
  id: string;
  slug: string;
  name: string;
  description: string;
  specialty: Ref;
  hospital_stay_days: number | null;
  recovery_days: number | null;
  total_stay_days: number | null;
  india_price_min_minor: number | null;
  india_price_max_minor: number | null;
  currency: string;
  benchmarks: Benchmark[];
}

export interface PackageOut {
  id: string;
  name: string;
  tier: 'medical_only' | 'medical_stay' | 'all_inclusive' | string;
  price_minor: number;
  original_price_minor: number | null;
  currency: string;
  description: string | null;
  includes: Record<string, unknown> | null;
}

export interface HospitalProcedure {
  id: string;
  hospital_id: string;
  procedure: Ref;
  price_min_minor: number | null;
  price_max_minor: number | null;
  currency: string;
  hospital_stay_days: number | null;
  success_rate_pct: number | string | null;
  inclusions: string[];
  exclusions: string[];
  packages: PackageOut[];
  next_available_consultation?: string | null;
  next_available_admission?: string | null;
}

export interface HospitalCard {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string | null;
  accreditations: string[];
  rating_avg: number | string | null;
  rating_count: number;
  logo_url: string | null;
  cover_image_url: string | null;
  specialties: string[];
  languages: string[];
  international_desk: boolean;
  starting_price_minor: number | null;
  currency: string;
  /** Admin-checked accreditations (the free-text `accreditations` are self-declared by the hospital). */
  accreditations_verified?: AccreditationBadge[];
  /** Earliest day (IST, ISO date) with a free consultation / admission slot. */
  next_available_consultation?: string | null;
  next_available_admission?: string | null;
}

export interface DoctorHospitalRef {
  id: string;
  slug: string;
  name: string;
  city: string;
  accreditations: string[];
  accreditations_verified?: AccreditationBadge[];
}

export interface DoctorCard {
  id: string;
  slug: string;
  full_name: string;
  gender: string | null;
  photo_url: string | null;
  specialty: Ref | null;
  qualifications: string[];
  experience_years: number | null;
  languages: string[];
  success_rate_pct: number | string | null;
  rating_avg: number | string | null;
  rating_count: number;
  consultation_fee_minor: number | null;
  currency: string;
  teleconsult_available: boolean;
  hospital: DoctorHospitalRef | null;
  /** True once a platform admin checked the medical registration against the NMC / State Medical Council register. */
  registration_verified?: boolean;
  next_available_consultation?: string | null;
  next_available_admission?: string | null;
}

export interface DoctorDetail extends DoctorCard {
  bio: string | null;
  sub_specialties: string[];
  procedures: HospitalProcedure[];
  next_available_date: string | null;
  registration_number?: string | null;
  registration_council?: string | null;
  registration_council_name?: string | null;
  /** Latest published reviews naming this doctor (full list: GET /doctors/{id}/reviews). */
  reviews?: Review[];
}

/** A published review (the public API only returns published ones). */
export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string | null;
  published_at?: string | null;
  author_name?: string | null;
  patient_name?: string | null;
  /** True when written by the patient of a completed booking at this hospital. */
  verified_patient?: boolean;
  treatment_name?: string | null;
  doctor_name?: string | null;
  hospital_name?: string | null;
}

export interface ReviewPage {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface HospitalDetail extends HospitalCard {
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  established_year: number | null;
  bed_count: number | null;
  airport_distance_km: number | string | null;
  doctors: DoctorCard[];
  procedures: HospitalProcedure[];
  reviews: Review[];
}

export interface CostComparison {
  procedure: Ref | string;
  requested_country?: string | null;
  country_used?: string;
  is_fallback?: boolean;
  country_source?: string;
  home: {
    country_code: string;
    min_minor: number;
    max_minor: number;
    currency: string;
    wait_time_text: string | null;
    original_currency?: string | null;
    source?: string | null;
    source_url?: string | null;
    price_year?: number | null;
    confidence?: string | null;
    wait_source?: string | null;
  };
  india: { min_minor: number; max_minor: number; currency: string; wait_time_text: string | null; earliest_admission_date?: string | null };
  savings: { min_minor: number; max_minor: number; currency: string; pct_min: number; pct_max: number };
  itemized: { category: string; amount_minor: number; currency: string }[];
}

export interface CulturalTip {
  id: string;
  title: string;
  body: string;
  category: string | null;
  image_url: string | null;
}

/** INR per 1 unit of each currency (PLAN §4.4 fx_rates). */
export type FxTable = Record<string, number>;

export interface Helplines {
  [key: string]: string;
}

export type DataSource = 'api' | 'fallback';

export interface Loaded<T> {
  data: T;
  source: DataSource;
}
