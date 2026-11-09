/**
 * TypeScript shapes for every request/response in PLAN.md section 8.
 * JSON keys are snake_case (identical to the API). Money is always integer minor units + ISO currency.
 * `Uuid`, `IsoDateTime` ("2026-10-21T06:59:50Z") and `IsoDate` ("2026-10-21") are plain strings.
 * Fields marked optional (`?`) are not guaranteed by the plan; always handle their absence.
 */
import type {
  AccommodationType,
  AgentStatus,
  AgentTier,
  AiEngine,
  CaseStatus,
  ChecklistKey,
  ChecklistStatus,
  CommissionScope,
  ConsentKind,
  ConsultationMode,
  ConsultationStatus,
  ConversationKind,
  DevicePlatform,
  DocumentKind,
  DocumentStatus,
  DoctorGenderPref,
  DurationUnit,
  EntryDirection,
  ExportType,
  Gender,
  HospitalSort,
  HospitalMemberRole,
  HospitalStatus,
  InstallmentStatus,
  InvoiceKind,
  ItineraryKind,
  ItineraryStatus,
  KycStatus,
  LedgerAccountType,
  LedgerOwnerType,
  LedgerTxnType,
  Likelihood,
  OrderStatus,
  PackageTier,
  PayeeType,
  PaymentGateway,
  PaymentMethod,
  PaymentOption,
  PaymentPurpose,
  PaymentStatus,
  PayoutAccountStatus,
  PayoutMethod,
  PayoutStatus,
  PreviousTreatment,
  QuoteLineCategory,
  QuoteStatus,
  RateUnit,
  RefundStatus,
  RegistrableRole,
  ReportGroupBy,
  ReviewStatus,
  SavedEntityType,
  ScreeningStatus,
  ServiceBookingStatus,
  ServiceKind,
  SettlementBatchStatus,
  SettlementItemStatus,
  SeverityLevel,
  SlotKind,
  SosStatus,
  SymptomAnswer,
  TravelKind,
  Urgency,
  UserRole,
  UserStatus,
  VisaStatus,
  VisaType,
  BookingStatus,
} from './enums';

export * from './enums';

// ---------------------------------------------------------------------------------------------------------
// Primitives & common
// ---------------------------------------------------------------------------------------------------------
export type Uuid = string;
/** ISO-8601 UTC timestamp, e.g. "2026-10-21T06:59:50Z" */
export type IsoDateTime = string;
/** Calendar date "YYYY-MM-DD" */
export type IsoDate = string;
/** ISO-4217 currency code, e.g. "USD", "INR" */
export type CurrencyCode = string;
/** ISO-3166 alpha-2 country code, e.g. "US", "NG" */
export type CountryCode = string;
/** Decimal transported as a string (e.g. FX rate "83.12345678"); numbers are also accepted. */
export type DecimalString = string;

/** Paginated list (PLAN section 3). Query with `page` (1-based) and `page_size` (default 20, max 100). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface PageParams {
  page?: number;
  page_size?: number;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | (string & {});
    message: string;
    details: unknown;
    request_id?: string | null;
  };
}

export type ApiErrorCode =
  | 'validation_error'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payment_error'
  | 'internal_error'
  | 'mfa_required'
  | 'network_error'
  /** 400 from /auth/google|apple when a new account would be created without `is_adult` */
  | 'age_attestation_required'
  /** 400 from /auth/google|apple: agent/hospital accounts must be 18+ */
  | 'adult_required';

/** {id, slug, name} reference used across many shapes. */
export interface IdSlugName {
  id: Uuid;
  slug: string;
  name: string;
}
export interface IdName {
  id: Uuid;
  name: string;
}
export interface IdFullName {
  id: Uuid;
  full_name: string;
}

/** Monthly time-series point; the numeric fields differ per dashboard. */
export interface MonthPoint {
  /** "YYYY-MM" */
  month: string;
}

// ---------------------------------------------------------------------------------------------------------
// 8.1 auth
// ---------------------------------------------------------------------------------------------------------
export interface UserHospitalRef {
  id: Uuid;
  name: string;
  slug: string;
  member_role: HospitalMemberRole;
}

export interface UserOut {
  id: Uuid;
  email: string | null;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  phone: string | null;
  country_code: CountryCode | null;
  preferred_language: string;
  avatar_url: string | null;
  is_guest: boolean;
  email_verified: boolean;
  mfa_enabled: boolean;
  created_at: IsoDateTime;
  patient_profile_id?: Uuid | null;
  agent_id?: Uuid | null;
  hospitals?: UserHospitalRef[];
  /** 18+ attestation given at sign-up; null = signed up before the attestation existed (CG-24) */
  is_adult?: boolean | null;
  /** true for a patient who said they are under 18 and has no guardian consent on file yet */
  guardian_consent_required?: boolean;
}

export interface TokenOut {
  access_token: string;
  token_type: 'bearer';
  /** seconds */
  expires_in: number;
  /** only for mobile clients (X-Client-Type: mobile); web uses the httpOnly cookie */
  refresh_token?: string | null;
  user: UserOut;
}

export interface RegisterIn {
  email: string;
  password: string;
  full_name: string;
  role: RegistrableRole;
  phone?: string;
  country_code?: CountryCode;
  referral_code?: string;
  /** agent only */
  agency_name?: string;
  /** hospital only */
  hospital_name?: string;
  /** hospital only */
  city?: string;
  accept_terms: true;
  /**
   * 18+ attestation (required). Patients may send `false` ("under 18, a parent or guardian will consent");
   * agents and hospital users must send `true` (422 otherwise).
   */
  is_adult: boolean;
}

export interface LoginIn {
  email: string;
  password: string;
  otp_code?: string;
}

export interface GoogleLoginIn {
  id_token: string;
  role?: RegistrableRole;
  /**
   * 18+ attestation. Optional, but when the call would create a new account and it is missing the API answers
   * 400 `age_attestation_required` (ask the age question and retry); agent/hospital + `false` -> 400 `adult_required`.
   */
  is_adult?: boolean;
}

export interface GuestUpgradeIn {
  email: string;
  password: string;
  full_name: string;
  /** 18+ attestation (required); `false` = under 18, a parent or guardian will give consent */
  is_adult: boolean;
}

/** DELETE /auth/me (-> 204) - re-authentication for password accounts (+ authenticator code when MFA is on). */
export interface AccountDeleteIn {
  password?: string;
  /** authenticator (TOTP) code, required when MFA is enabled */
  otp_code?: string;
  reason?: string;
}

/** GET /auth/me/deletion-policy - what account deletion keeps (statutory retention), shown before confirming. */
export interface DeletionPolicyOut {
  retained: string[];
  /** what is erased (when the server lists it) */
  deleted?: string[];
}

/** POST /auth/me/deletion-request - ask support to close an account that has blockers (409 on DELETE). */
export interface DeletionRequestIn {
  reason?: string;
}

export interface DeletionRequestOut {
  id?: Uuid;
  status?: string;
  created_at?: IsoDateTime;
}

export interface MeUpdateIn {
  full_name?: string;
  phone?: string | null;
  country_code?: CountryCode | null;
  preferred_language?: string;
  avatar_url?: string | null;
}

export interface ChangePasswordIn {
  current_password: string;
  new_password: string;
}

export interface TokenIn {
  token: string;
}
export interface EmailIn {
  email: string;
}
export interface ResetPasswordIn {
  token: string;
  new_password: string;
}

export interface MfaSetupOut {
  secret: string;
  otpauth_url: string;
}
export interface MfaCodeIn {
  code: string;
}

export interface DeviceIn {
  platform: DevicePlatform;
  token: string;
}

export interface ConsentIn {
  kind: ConsentKind;
  version: string;
  granted: boolean;
}
export interface ConsentOut extends ConsentIn {
  id: Uuid;
  created_at: IsoDateTime;
}

// ---------------------------------------------------------------------------------------------------------
// 8.2 patients
// ---------------------------------------------------------------------------------------------------------
export interface PostalAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: CountryCode | null;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface PatientProfileOut {
  id: Uuid;
  user_id: Uuid;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: IsoDate | null;
  gender: Gender | null;
  nationality: CountryCode | null;
  country_of_residence: CountryCode | null;
  /** passport number is write-only; only the last 4 digits are returned */
  passport_last4: string | null;
  passport_expiry: IsoDate | null;
  phone: string | null;
  whatsapp: string | null;
  address: PostalAddress | null;
  emergency_contact: EmergencyContact | null;
  preferred_language: string | null;
  blood_group: string | null;
  allergies: string | null;
  medical_history: string | null;
  insurance_provider: string | null;
  insurance_policy_last4?: string | null;
  referred_by_agent_id: Uuid | null;
  managed_by_agent_id: Uuid | null;
  preferred_currency: CurrencyCode;
  /** false while preferred_currency still follows country_of_residence */
  currency_set_by_user?: boolean;
  email?: string | null;
  full_name?: string;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface PatientProfileIn {
  first_name?: string;
  last_name?: string;
  date_of_birth?: IsoDate | null;
  gender?: Gender | null;
  nationality?: CountryCode | null;
  country_of_residence?: CountryCode | null;
  /** full value accepted on input only */
  passport_number?: string | null;
  passport_expiry?: IsoDate | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: PostalAddress | null;
  emergency_contact?: EmergencyContact | null;
  preferred_language?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  medical_history?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
  preferred_currency?: CurrencyCode;
}

export interface CompanionOut {
  id: Uuid;
  patient_id: Uuid;
  full_name: string;
  relationship: string;
  nationality: CountryCode | null;
  date_of_birth: IsoDate | null;
  passport_last4: string | null;
  created_at?: IsoDateTime;
}
export interface CompanionIn {
  full_name: string;
  relationship: string;
  nationality?: CountryCode | null;
  date_of_birth?: IsoDate | null;
  passport_number?: string | null;
}

export interface ScreeningLite {
  id: Uuid;
  status: ScreeningStatus;
  specialty: IdSlugName | null;
  urgency: Urgency | null;
  created_at: IsoDateTime;
  completed_at: IsoDateTime | null;
  summary?: string | null;
}

export interface CoordinatorRef {
  id: Uuid;
  full_name: string;
  phone: string | null;
}

export interface PatientDashboard {
  next_booking: BookingOut | null;
  days_until_treatment: number | null;
  checklist: ChecklistItemOut[];
  today_schedule: ItineraryItemOut[];
  active_cases: number;
  unread_notifications: number;
  coordinator: CoordinatorRef | null;
  recent_screenings: ScreeningLite[];
}

export interface SavedItemIn {
  entity_type: SavedEntityType;
  entity_id: Uuid;
}
export interface SavedItemOut {
  id: Uuid;
  entity_type: SavedEntityType;
  entity_id: Uuid;
  created_at: IsoDateTime;
  hospital?: HospitalCard | null;
  doctor?: DoctorCard | null;
  procedure?: ProcedureOut | null;
}

// ---------------------------------------------------------------------------------------------------------
// 8.3 documents
// ---------------------------------------------------------------------------------------------------------
export interface DocumentOut {
  id: Uuid;
  kind: DocumentKind;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  case_id: Uuid | null;
  patient_id: Uuid | null;
  created_at: IsoDateTime;
  uploaded_by_name: string | null;
  hospital_id?: Uuid | null;
  agent_id?: Uuid | null;
  verified_at?: IsoDateTime | null;
}

export interface DocumentUploadIn {
  file: File | Blob;
  kind: DocumentKind;
  case_id?: Uuid;
  patient_id?: Uuid;
  hospital_id?: Uuid;
  /** optional file name when `file` is a Blob */
  file_name?: string;
}

export interface DocumentListParams {
  case_id?: Uuid;
  kind?: DocumentKind;
  patient_id?: Uuid;
  hospital_id?: Uuid;
}

export interface DocumentVerifyIn {
  status: 'verified' | 'rejected';
  note?: string;
}

// ---------------------------------------------------------------------------------------------------------
// 8.4 catalog (public)
// ---------------------------------------------------------------------------------------------------------
export interface SpecialtyOut {
  id: Uuid;
  slug: string;
  name: string;
  description: string | null;
  /** lucide icon name (kebab-case), e.g. "heart-pulse" */
  icon: string | null;
  savings_min_pct: number | null;
  savings_max_pct: number | null;
  procedures_count: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface CostBenchmarkOut {
  country_code: CountryCode;
  currency: CurrencyCode;
  cost_min_minor: number;
  cost_max_minor: number;
  wait_time_text: string | null;
  id?: Uuid;
  procedure_id?: Uuid;
  source?: string | null;
  source_url?: string | null;
  price_year?: number | null;
  /** high | medium | low */
  confidence?: string | null;
  wait_source?: string | null;
}

/** Amount converted to the viewer's currency for display only (`?currency=` or the patient's preferred
 * currency). `fx_rate` = units of `currency` per 1 unit of the original currency. */
export interface DisplayMoney {
  amount_minor: number;
  currency: CurrencyCode;
  fx_rate: string;
  approximate: boolean;
}

/** An accreditation a platform admin has checked (still valid). */
export interface AccreditationBadge {
  body: string;
  valid_until: IsoDate | null;
}

export interface ProcedureOut {
  id: Uuid;
  slug: string;
  name: string;
  description: string | null;
  specialty: IdSlugName;
  hospital_stay_days: number | null;
  recovery_days: number | null;
  total_stay_days: number | null;
  india_price_min_minor: number | null;
  india_price_max_minor: number | null;
  currency: CurrencyCode;
  display_india_price_min?: DisplayMoney | null;
  display_india_price_max?: DisplayMoney | null;
  benchmarks: CostBenchmarkOut[];
  keywords?: string[];
  body_areas?: string[];
  is_active?: boolean;
}

export interface ProcedureListParams {
  specialty?: string;
  q?: string;
  currency?: CurrencyCode;
}

export interface HospitalRefMini {
  id: Uuid;
  slug: string;
  name: string;
  city: string;
  accreditations: string[];
  accreditations_verified?: AccreditationBadge[];
}

export interface HospitalCard {
  id: Uuid;
  slug: string;
  name: string;
  city: string;
  state: string | null;
  accreditations: string[];
  rating_avg: number | null;
  rating_count: number;
  logo_url: string | null;
  cover_image_url: string | null;
  /** specialty names */
  specialties: string[];
  languages: string[];
  international_desk: boolean;
  starting_price_minor: number | null;
  currency: CurrencyCode;
  display_starting_price?: DisplayMoney | null;
  /** admin-verified, unexpired accreditations (`accreditations` is the hospital's own free-text list) */
  accreditations_verified?: AccreditationBadge[];
  /** earliest free slot (IST date) */
  next_available_consultation?: IsoDate | null;
  next_available_admission?: IsoDate | null;
}

export interface ReviewOut {
  id: Uuid;
  rating: number;
  title: string | null;
  body: string | null;
  patient_name: string | null;
  created_at: IsoDateTime;
  hospital_id?: Uuid;
  doctor_id?: Uuid | null;
  case_id?: Uuid | null;
  status?: ReviewStatus;
  /** written for a completed booking at this hospital */
  verified_patient?: boolean;
  treatment_name?: string | null;
  doctor_name?: string | null;
  hospital_name?: string | null;
  published_at?: IsoDateTime | null;
}

/** GET /me/reviews */
export interface PatientReviewOut extends ReviewOut {
  booking_id: Uuid | null;
  moderation_reason: string | null;
  updated_at: IsoDateTime | null;
  /** pending reviews can still be edited or deleted */
  editable: boolean;
}

/** GET /me/reviews/eligible - completed bookings without a review */
export interface ReviewableBookingOut {
  booking_id: Uuid;
  booking_number: string;
  hospital: IdSlugName;
  doctor: { id: Uuid; name: string } | null;
  procedure: IdSlugName | null;
  admission_date: IsoDate | null;
  discharge_date: IsoDate | null;
  completed_at: IsoDateTime | null;
}

/** POST /reviews */
export interface ReviewCreateIn {
  hospital_id: Uuid;
  booking_id: Uuid;
  doctor_id?: Uuid | null;
  rating: number;
  title?: string | null;
  body?: string | null;
}

/** PATCH /me/reviews/{id} (pending reviews only) */
export interface ReviewUpdateIn {
  doctor_id?: Uuid | null;
  rating?: number;
  title?: string | null;
  body?: string | null;
}

/** GET /admin/reviews */
export interface AdminReviewOut extends ReviewOut {
  booking_id: Uuid | null;
  booking_number: string | null;
  patient_id: Uuid;
  moderation_reason: string | null;
  moderated_at: IsoDateTime | null;
  moderated_by_user_id: Uuid | null;
  updated_at: IsoDateTime | null;
}

/** PATCH /admin/reviews/{id} - a reason is required to hide */
export interface ReviewModerateIn {
  status: 'published' | 'hidden';
  reason?: string | null;
}

/** /admin/hospitals/{id}/accreditations, /admin/accreditations/{id}, /hospital-portal/accreditations */
export interface AccreditationOut {
  id: Uuid;
  hospital_id: Uuid;
  body: string;
  certificate_number: string | null;
  valid_until: IsoDate | null;
  document_id: Uuid | null;
  verified: boolean;
  verified_at: IsoDateTime | null;
  verified_by_admin_id: Uuid | null;
  /** verified and not expired: shown in accreditations_verified */
  is_public: boolean;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface AccreditationIn {
  body: string;
  certificate_number?: string | null;
  valid_until?: IsoDate | null;
  document_id?: Uuid | null;
}

export interface PackageIncludes {
  accommodation_nights?: number;
  airport_pickup?: boolean;
  translator?: boolean;
  meals?: boolean;
  local_transport?: boolean;
  followup_teleconsults?: number;
}

export interface PackageOut {
  id: Uuid;
  name: string;
  tier: PackageTier;
  price_minor: number;
  original_price_minor: number | null;
  currency: CurrencyCode;
  display_price?: DisplayMoney | null;
  display_original_price?: DisplayMoney | null;
  description: string | null;
  includes: PackageIncludes;
  is_active?: boolean;
  hospital_procedure_id?: Uuid;
}

export interface HospitalProcedureOut {
  id: Uuid;
  hospital_id: Uuid;
  procedure: IdSlugName;
  price_min_minor: number;
  price_max_minor: number;
  currency: CurrencyCode;
  hospital_stay_days: number | null;
  success_rate_pct: number | null;
  inclusions: string[];
  exclusions: string[];
  packages: PackageOut[];
  doctor_ids?: Uuid[];
  is_active?: boolean;
  display_price_min?: DisplayMoney | null;
  display_price_max?: DisplayMoney | null;
  next_available_consultation?: IsoDate | null;
  next_available_admission?: IsoDate | null;
}

export interface DoctorCard {
  id: Uuid;
  slug: string;
  full_name: string;
  gender: Gender | null;
  photo_url: string | null;
  specialty: IdSlugName;
  qualifications: string[];
  experience_years: number | null;
  languages: string[];
  success_rate_pct: number | null;
  rating_avg: number | null;
  rating_count: number;
  consultation_fee_minor: number | null;
  currency: CurrencyCode;
  teleconsult_available: boolean;
  hospital: HospitalRefMini;
  display_consultation_fee?: DisplayMoney | null;
  /** an admin checked the medical registration */
  registration_verified?: boolean;
  /** the doctor's own + hospital-wide free slots (IST date) */
  next_available_consultation?: IsoDate | null;
  next_available_admission?: IsoDate | null;
}

export interface DoctorDetail extends DoctorCard {
  bio: string | null;
  sub_specialties: string[];
  procedures: HospitalProcedureOut[];
  next_available_date: IsoDate | null;
  /** Medical registration (public in India's NMC register); council code from GET /content/medical-councils. */
  registration_number?: string | null;
  registration_council?: string | null;
  registration_council_name?: string | null;
  registration_verified?: boolean;
  /** latest published reviews naming this doctor */
  reviews?: ReviewOut[];
}

/** GET /content/medical-councils — "nmc" + State Medical Councils. */
export interface MedicalCouncilOut {
  code: string;
  name: string;
}

export interface HospitalDetail extends HospitalCard {
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  established_year: number | null;
  bed_count: number | null;
  airport_distance_km: number | null;
  doctors: DoctorCard[];
  procedures: HospitalProcedureOut[];
  reviews: ReviewOut[];
}

export interface HospitalListParams extends PageParams {
  q?: string;
  city?: string;
  specialty?: string;
  procedure?: string;
  accreditation?: string;
  language?: string;
  sort?: HospitalSort;
  currency?: CurrencyCode;
}

export interface DoctorListParams extends PageParams {
  q?: string;
  specialty?: string;
  hospital_id?: Uuid;
  language?: string;
  gender?: Gender;
  procedure?: string;
  sort?: 'soonest' | 'experience';
  currency?: CurrencyCode;
}

export interface AvailabilityDay {
  date: IsoDate;
  slot_kind: SlotKind;
  capacity: number;
  booked: number;
  available: number;
}

export interface AvailabilityParams {
  from?: IsoDate;
  to?: IsoDate;
}

export interface CostHome {
  country_code: CountryCode;
  min_minor: number;
  max_minor: number;
  currency: CurrencyCode;
  wait_time_text: string | null;
  /** the benchmark's own currency (amounts above are converted to `currency`) */
  original_currency?: CurrencyCode | null;
  source?: string | null;
  source_url?: string | null;
  price_year?: number | null;
  /** high | medium | low */
  confidence?: string | null;
  wait_source?: string | null;
}

export interface CostIndia {
  min_minor: number;
  max_minor: number;
  currency: CurrencyCode;
  wait_time_text: string;
  /** earliest free admission slot at a hospital offering the procedure */
  earliest_admission_date?: IsoDate | null;
}

export interface CostSavings {
  min_minor: number;
  max_minor: number;
  currency: CurrencyCode;
  pct_min: number;
  pct_max: number;
}

/** How the home country was chosen; `country_used` differs from `requested_country` when no benchmark exists
 * for it (`is_fallback`). */
export interface HomeCountryInfo {
  requested_country?: CountryCode | null;
  country_used?: CountryCode;
  is_fallback?: boolean;
  /** query | profile | account | header | accept_language | default */
  country_source?: string;
}

export interface CostComparison extends HomeCountryInfo {
  procedure: IdSlugName;
  home: CostHome;
  india: CostIndia;
  savings: CostSavings;
  itemized: { category: QuoteLineCategory | (string & {}); amount_minor: number; currency: CurrencyCode }[];
}

export interface CostComparisonParams {
  procedure: string;
  /** default: the signed-in patient's country, else detected, else US (is_fallback) */
  country?: CountryCode;
  currency?: CurrencyCode;
}

/** GET /cost-comparison/highlights */
export interface CostHighlights extends HomeCountryInfo {
  currency: CurrencyCode;
  items: {
    procedure: IdSlugName;
    specialty: IdSlugName;
    home: CostHome;
    india: CostIndia;
    savings: CostSavings;
  }[];
}

export interface CostHighlightsParams {
  country?: CountryCode;
  currency?: CurrencyCode;
  limit?: number;
}

/** GET /procedures/{slug}/earliest */
export interface ProcedureEarliest {
  procedure: IdSlugName;
  items: {
    hospital: HospitalCard;
    hospital_procedure_id: Uuid;
    price_min_minor: number | null;
    price_max_minor: number | null;
    currency: CurrencyCode;
    display_price_min?: DisplayMoney | null;
    display_price_max?: DisplayMoney | null;
    lead_doctor_ids: Uuid[];
    next_available_admission: IsoDate | null;
    next_available_consultation: IsoDate | null;
  }[];
}

export interface SearchResults {
  specialties: SpecialtyOut[];
  procedures: ProcedureOut[];
  hospitals: HospitalCard[];
  doctors: DoctorCard[];
}

export interface CulturalTipOut {
  id: Uuid;
  title: string;
  body: string;
  image_url: string | null;
  category: string | null;
  sort_order: number;
  is_active?: boolean;
}

/** e.g. {"24x7": "+91-11-4000-0000", "whatsapp": "...", "emergency": "112"} */
export type Helplines = Record<string, string>;

export interface FxRateOut {
  id?: Uuid;
  base_currency: CurrencyCode;
  quote_currency: CurrencyCode;
  /** INR per 1 unit of quote currency */
  rate: DecimalString | number;
  source: string | null;
  as_of: IsoDateTime;
}

export interface SymptomLibraryItem {
  name: string;
  specialty_slugs: string[];
  body_areas: string[];
}

export interface AccommodationProviderOut {
  id: Uuid;
  name: string;
  type: AccommodationType;
  city: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  star_rating: number | null;
  amenities: string[];
  nightly_rate_minor: number;
  currency: CurrencyCode;
  photos: string[];
  phone: string | null;
  email: string | null;
  is_active?: boolean;
  /** present when filtered by hospital_id */
  distance_km?: number | null;
}

export interface ServiceProviderOut {
  id: Uuid;
  kind: ServiceKind;
  name: string;
  city: string | null;
  languages: string[];
  phone: string | null;
  email: string | null;
  rate_minor: number | null;
  rate_unit: RateUnit | null;
  currency: CurrencyCode;
  rating_avg: number | null;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// 8.5 hospital portal
// ---------------------------------------------------------------------------------------------------------
/** Full hospital record as seen by its members and staff. */
export interface HospitalProfileOut extends HospitalCard {
  legal_name: string | null;
  description: string | null;
  country: CountryCode;
  address: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  established_year: number | null;
  bed_count: number | null;
  airport_distance_km: number | null;
  status: HospitalStatus;
  kyc_status: KycStatus;
  gstin: string | null;
  pan_last4?: string | null;
  commission_rate_bps: number | null;
  settlement_cycle_days: number | null;
  is_featured: boolean;
  approved_at: IsoDateTime | null;
  rejection_reason: string | null;
  specialty_ids?: Uuid[];
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface HospitalProfileIn {
  name?: string;
  legal_name?: string | null;
  description?: string | null;
  city?: string;
  state?: string | null;
  address?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logo_url?: string | null;
  cover_image_url?: string | null;
  accreditations?: string[];
  established_year?: number | null;
  bed_count?: number | null;
  languages?: string[];
  international_desk?: boolean;
  airport_distance_km?: number | null;
  gstin?: string | null;
  /** write-only */
  pan?: string | null;
}

export interface HospitalDashboard {
  enquiries_open: number;
  quotes_pending: number;
  bookings_upcoming: number;
  patients_in_treatment: number;
  revenue_month_minor: number;
  currency: CurrencyCode;
  monthly: (MonthPoint & { bookings: number; revenue_minor: number })[];
  recent_cases: CaseOut[];
}

export interface HospitalMemberOut {
  id: Uuid;
  hospital_id?: Uuid;
  user_id: Uuid;
  email: string | null;
  full_name: string;
  member_role: HospitalMemberRole;
  status?: UserStatus;
  created_at: IsoDateTime;
}
export interface HospitalMemberInviteIn {
  email: string;
  full_name: string;
  member_role: HospitalMemberRole;
}
export interface HospitalMemberUpdateIn {
  member_role: HospitalMemberRole;
}

export interface DoctorAdminOut extends DoctorDetail {
  is_active: boolean;
  user_id?: Uuid | null;
  /** Reset to null when the hospital changes the registration number or council. */
  registration_verified_at?: IsoDateTime | null;
}
export interface DoctorIn {
  full_name: string;
  gender?: Gender | null;
  photo_url?: string | null;
  specialty_id: Uuid;
  sub_specialties?: string[];
  qualifications?: string[];
  experience_years?: number | null;
  languages?: string[];
  bio?: string | null;
  success_rate_pct?: number | null;
  consultation_fee_minor?: number | null;
  currency?: CurrencyCode;
  teleconsult_available?: boolean;
  is_active?: boolean;
  /** Both or neither; "" clears. */
  registration_number?: string | null;
  registration_council?: string | null;
}

export interface AvailabilitySlotIn {
  date: IsoDate;
  slot_kind: SlotKind;
  capacity: number;
}

export interface HospitalProcedureIn {
  procedure_id: Uuid;
  doctor_ids?: Uuid[];
  price_min_minor: number;
  price_max_minor: number;
  currency?: CurrencyCode;
  hospital_stay_days?: number | null;
  success_rate_pct?: number | null;
  inclusions?: string[];
  exclusions?: string[];
  is_active?: boolean;
}

export interface PackageIn {
  name: string;
  tier: PackageTier;
  price_minor: number;
  original_price_minor?: number | null;
  currency?: CurrencyCode;
  description?: string | null;
  includes?: PackageIncludes;
  is_active?: boolean;
}

export interface HospitalSpecialtiesIn {
  specialty_ids: Uuid[];
}

// ---------------------------------------------------------------------------------------------------------
// 8.6 screening
// ---------------------------------------------------------------------------------------------------------
export interface ScreeningSymptom {
  name: string;
  answer: SymptomAnswer;
}

export interface ScreeningSeverity {
  work?: SeverityLevel;
  sleep?: SeverityLevel;
  mobility?: SeverityLevel;
}

export interface ScreeningPreferences {
  languages?: string[];
  doctor_gender?: DoctorGenderPref;
  budget_min_minor?: number | null;
  budget_max_minor?: number | null;
  budget_currency?: CurrencyCode;
  travel_window_start?: IsoDate | null;
  travel_window_end?: IsoDate | null;
  use_ai?: boolean;
}

export interface TriageResult {
  summary: string;
  suggested_specialties: { slug: string; name: string; confidence: number; rationale: string }[];
  possible_conditions: { name: string; likelihood: Likelihood; notes: string }[];
  recommended_procedures: { slug: string; name: string; rationale: string }[];
  urgency: Urgency;
  red_flags: string[];
  recommended_tests: string[];
  questions_for_doctor: string[];
  travel_advice: string;
  disclaimer: string;
  engine: AiEngine;
}

export interface ScreeningOut {
  id: Uuid;
  status: ScreeningStatus;
  patient_id: Uuid;
  specialty: IdSlugName | null;
  body_areas: string[];
  pain_intensity: number | null;
  symptoms: ScreeningSymptom[];
  duration_value: number | null;
  duration_unit: DurationUnit | null;
  severity: ScreeningSeverity;
  previous_treatments: PreviousTreatment[];
  notes: string | null;
  preferences: ScreeningPreferences;
  report_document_ids: Uuid[];
  consent_ai: boolean;
  home_country: CountryCode | null;
  ai_result: TriageResult | null;
  urgency: Urgency | null;
  red_flags: string[];
  error: string | null;
  created_at: IsoDateTime;
  submitted_at: IsoDateTime | null;
  completed_at: IsoDateTime | null;
}

export interface ScreeningCreateIn {
  specialty_slug?: string;
  /** agents create on behalf of a patient */
  patient_id?: Uuid;
}

export interface ScreeningUpdateIn {
  specialty_slug?: string | null;
  body_areas?: string[];
  pain_intensity?: number | null;
  symptoms?: ScreeningSymptom[];
  duration_value?: number | null;
  duration_unit?: DurationUnit | null;
  severity?: ScreeningSeverity;
  previous_treatments?: PreviousTreatment[];
  notes?: string | null;
  preferences?: ScreeningPreferences;
  report_document_ids?: Uuid[];
  home_country?: CountryCode | null;
}

export interface ScreeningSubmitIn {
  consent_ai: boolean;
}

export interface ScreeningListParams extends PageParams {
  patient_id?: Uuid;
  status?: ScreeningStatus;
}

export interface MatchSavings {
  home_country: CountryCode;
  home_min_minor: number;
  home_max_minor: number;
  home_currency: CurrencyCode;
  pct_min: number;
  pct_max: number;
}

export interface MatchOut {
  id: Uuid;
  rank: number;
  match_score: number;
  reasons: string[];
  doctor: DoctorCard | null;
  hospital: HospitalCard;
  procedure: IdSlugName | null;
  package: PackageOut | null;
  estimated_cost_minor: number | null;
  currency: CurrencyCode;
  savings: MatchSavings | null;
  next_available_consultation?: IsoDate | null;
  next_available_admission?: IsoDate | null;
}

// ---------------------------------------------------------------------------------------------------------
// 8.7 cases, quotes, bookings, consultations
// ---------------------------------------------------------------------------------------------------------
export interface CasePatientRef {
  id: Uuid;
  full_name: string;
  nationality: CountryCode | null;
  gender: Gender | null;
  age: number | null;
}

export interface QuoteLineItem {
  category: QuoteLineCategory;
  description: string;
  amount_minor: number;
  /** in responses, with a display currency */
  display_amount?: DisplayMoney | null;
}

export interface QuoteOut {
  id: Uuid;
  case_id: Uuid;
  status: QuoteStatus;
  treatment_plan: string;
  line_items: QuoteLineItem[];
  total_minor: number;
  currency: CurrencyCode;
  /** approximate total in the viewer's currency (patients: preferred currency; others: ?currency=) */
  display_total?: DisplayMoney | null;
  estimated_stay_days: number | null;
  valid_until: IsoDate | null;
  prepared_by_name: string | null;
  created_at: IsoDateTime;
  accepted_at: IsoDateTime | null;
  rejected_reason?: string | null;
  hospital_id?: Uuid;
}

export interface QuoteCreateIn {
  treatment_plan: string;
  line_items: QuoteLineItem[];
  currency: CurrencyCode;
  estimated_stay_days?: number | null;
  valid_until: IsoDate;
}

export interface QuoteRejectIn {
  reason?: string;
}

/** Cancellation refund tier: cancelling at least `days_before` days before admission refunds `refund_pct`%. */
export interface RefundTier {
  days_before: number;
  refund_pct: number;
}

export interface BookingOut {
  id: Uuid;
  booking_number: string;
  case_id: Uuid;
  status: BookingStatus;
  patient: IdFullName;
  hospital: { id: Uuid; name: string; city: string };
  doctor: IdFullName | null;
  procedure: IdName | null;
  package: PackageOut | null;
  quote_id: Uuid | null;
  admission_date: IsoDate | null;
  discharge_date: IsoDate | null;
  duration_days: number | null;
  payment_option: PaymentOption;
  installment_months: number | null;
  insurance_claim_requested: boolean;
  currency: CurrencyCode;
  subtotal_minor: number;
  discount_minor: number;
  service_fee_minor: number;
  tax_minor: number;
  total_minor: number;
  deposit_minor: number;
  amount_paid_minor: number;
  amount_refunded_minor: number;
  balance_due_minor: number;
  display_total?: DisplayMoney | null;
  display_deposit?: DisplayMoney | null;
  display_amount_paid?: DisplayMoney | null;
  display_balance_due?: DisplayMoney | null;
  created_at: IsoDateTime;
  confirmed_at: IsoDateTime | null;
  admitted_at: IsoDateTime | null;
  completed_at: IsoDateTime | null;
  cancelled_at: IsoDateTime | null;
  cancel_reason?: string | null;
  /** refund policy snapshot taken when the booking was created (null for legacy bookings -> platform default) */
  refund_policy?: RefundTier[] | null;
}

export interface CaseOut {
  id: Uuid;
  case_number: string;
  status: CaseStatus;
  patient: CasePatientRef;
  agent: { id: Uuid; agency_name: string } | null;
  hospital: { id: Uuid; slug: string; name: string; city: string };
  doctor: { id: Uuid; full_name: string; specialty_name: string | null } | null;
  procedure: IdSlugName | null;
  specialty: IdSlugName | null;
  screening_id: Uuid | null;
  coordinator: IdFullName | null;
  patient_notes: string | null;
  latest_quote: QuoteOut | null;
  booking: BookingOut | null;
  /** urgency from the linked screening (null when no screening) */
  urgency?: Urgency | null;
  /** true while an emergency-screened case has not been acknowledged; quote acceptance/booking answer 409 */
  emergency_ack_required?: boolean;
  emergency_acknowledged_at?: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** POST /cases/{id}/emergency-ack */
export interface EmergencyAckIn {
  acknowledged: true;
}

export interface CaseTimelineEntry {
  from_status: CaseStatus | null;
  to_status: CaseStatus;
  note: string | null;
  changed_by_name: string | null;
  created_at: IsoDateTime;
}

export interface CaseDetail extends CaseOut {
  medical_summary: string | null;
  quotes: QuoteOut[];
  timeline: CaseTimelineEntry[];
  screening: ScreeningOut | null;
  documents: DocumentOut[];
}

export interface CaseCreateIn {
  hospital_id: Uuid;
  doctor_id?: Uuid;
  procedure_id?: Uuid;
  specialty_id?: Uuid;
  screening_id?: Uuid;
  patient_notes?: string;
  /** agents only */
  patient_id?: Uuid;
  /** records `share_with_hospitals` consent for this case's hospital (required unless already on file) */
  consent_share?: boolean;
}

export interface CaseListParams extends PageParams {
  /** one status or several (sent as repeated `status=` params) */
  status?: CaseStatus | readonly CaseStatus[];
  hospital_id?: Uuid;
  q?: string;
  patient_id?: Uuid;
  agent_id?: Uuid;
  coordinator_id?: Uuid;
  /** only cases without a coordinator */
  unassigned?: boolean;
  /** screening urgency (repeatable) */
  urgency?: Urgency | readonly Urgency[];
  /** inclusive IST calendar dates (YYYY-MM-DD) */
  created_from?: string;
  created_to?: string;
  updated_from?: string;
  updated_to?: string;
  /** created_at | updated_at | case_number | status; '-' prefix = descending (default -created_at) */
  sort?: string;
  /** any of (repeatable) */
  specialty_id?: Uuid | readonly Uuid[];
  procedure_id?: Uuid | readonly Uuid[];
  doctor_id?: Uuid | readonly Uuid[];
}

/** GET /cases/status-counts */
export interface CaseStatusCounts {
  counts: Record<CaseStatus, number>;
  total: number;
}

export interface CaseStatusIn {
  to_status: CaseStatus;
  note?: string;
}

export interface AssignCoordinatorIn {
  user_id: Uuid;
}

export interface BookingCreateIn {
  case_id: Uuid;
  quote_id?: Uuid;
  package_id?: Uuid;
  admission_date: IsoDate;
  payment_option: PaymentOption;
  installment_months?: number;
  insurance_claim_requested?: boolean;
}

/** GET /bookings filters. There is no free-text `q` filter on the backend. */
export interface BookingListParams extends PageParams {
  /** one status or several (repeated `status=`) */
  status?: BookingStatus | readonly BookingStatus[];
  case_id?: Uuid;
  hospital_id?: Uuid;
  patient_id?: Uuid;
  /** booking number or patient name */
  q?: string;
  /** paid (nothing due) | partial | unpaid (repeatable) */
  payment?: BookingPaymentState | readonly BookingPaymentState[];
  /** inclusive dates (YYYY-MM-DD); created_* are IST calendar days */
  admission_from?: string;
  admission_to?: string;
  created_from?: string;
  created_to?: string;
  /** total in minor units */
  min_total?: number;
  max_total?: number;
  /** created_at | admission_date | booking_number | total_minor | status; '-' = descending (default -created_at) */
  sort?: string;
}

export type BookingPaymentState = 'paid' | 'partial' | 'unpaid';

/** GET /bookings/status-counts, GET /admin/{hospitals,agents}/status-counts, /admin/users/role-counts,
 *  GET /travel/status-counts: rows per status (every key present) for the list filters. */
export interface StatusCounts<K extends string = string> {
  counts: Record<K, number>;
  total: number;
}

export interface BookingCancelIn {
  reason: string;
}

/** `discharge_date` is accepted by /complete only (/admit takes `note`). */
export interface BookingTransitionIn {
  note?: string;
  discharge_date?: IsoDate;
}

export interface ChecklistItemOut {
  id: Uuid;
  case_id: Uuid;
  key: ChecklistKey;
  label: string;
  status: ChecklistStatus;
  done_at: IsoDateTime | null;
  sort_order: number;
}

export interface ChecklistUpdateIn {
  status: ChecklistStatus;
}

export interface ItineraryItemOut {
  id: Uuid;
  case_id: Uuid;
  kind: ItineraryKind;
  title: string;
  description: string | null;
  starts_at: IsoDateTime;
  ends_at: IsoDateTime | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  status: ItineraryStatus;
  created_at?: IsoDateTime;
}

export interface ItineraryItemIn {
  kind: ItineraryKind;
  title: string;
  description?: string | null;
  starts_at: IsoDateTime;
  ends_at?: IsoDateTime | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  status?: ItineraryStatus;
}

/** Nested refs as sent by ConsultationOut (backend cases/schemas.py). */
export interface ConsultationDoctorRef {
  id: Uuid;
  full_name: string;
  specialty_name: string | null;
}
export interface ConsultationHospitalRef {
  id: Uuid;
  slug: string;
  name: string;
  city: string | null;
}

export interface ConsultationOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  doctor: ConsultationDoctorRef | null;
  patient: CasePatientRef | null;
  hospital: ConsultationHospitalRef | null;
  scheduled_at: IsoDateTime | null;
  duration_min: number;
  mode: ConsultationMode;
  meeting_url: string | null;
  status: ConsultationStatus;
  fee_minor: number;
  currency: CurrencyCode;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface ConsultationCreateIn {
  case_id: Uuid;
  doctor_id?: Uuid | null;
  mode?: ConsultationMode;
  /** the patient's preferred slot; the hospital sets `scheduled_at` via PATCH */
  preferred_at?: IsoDateTime | null;
  notes?: string;
}

export interface ConsultationUpdateIn {
  scheduled_at?: IsoDateTime | null;
  duration_min?: number | null;
  mode?: ConsultationMode;
  meeting_url?: string | null;
  status?: ConsultationStatus;
  notes?: string | null;
}

export interface ConsultationListParams extends PageParams {
  case_id?: Uuid;
  status?: ConsultationStatus;
}

// ---------------------------------------------------------------------------------------------------------
// 8.8 travel
// ---------------------------------------------------------------------------------------------------------
/** The patient on a travel/visa/SOS record (backend TravelPatientRef). */
export type TravelPatientRef = IdFullName;

export interface VisaRequestOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  patient: TravelPatientRef | null;
  visa_type: VisaType;
  status: VisaStatus;
  invitation_letter_document_id: Uuid | null;
  application_reference: string | null;
  applied_at: IsoDateTime | null;
  decided_at: IsoDateTime | null;
  notes: string | null;
  created_at: IsoDateTime;
  updated_at?: IsoDateTime;
}
export interface VisaRequestIn {
  case_id: Uuid;
  visa_type: VisaType;
  notes?: string;
}
export interface VisaRequestUpdateIn {
  status?: VisaStatus;
  invitation_letter_document_id?: Uuid | null;
  application_reference?: string | null;
  /* applied_at / decided_at are stamped by the server on the status change */
  notes?: string | null;
}

export interface TravelBookingOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  patient: TravelPatientRef | null;
  kind: TravelKind;
  status: ServiceBookingStatus;
  from_location: string | null;
  to_location: string | null;
  depart_at: IsoDateTime | null;
  arrive_at: IsoDateTime | null;
  carrier: string | null;
  flight_number: string | null;
  pnr: string | null;
  passengers: number | null;
  price_minor: number | null;
  currency: CurrencyCode | null;
  details: Record<string, unknown> | null;
  notes: string | null;
  created_at: IsoDateTime;
}
export interface TravelBookingIn {
  case_id: Uuid;
  kind: TravelKind;
  from_location?: string | null;
  to_location?: string | null;
  depart_at?: IsoDateTime | null;
  arrive_at?: IsoDateTime | null;
  carrier?: string | null;
  flight_number?: string | null;
  passengers?: number | null;
  notes?: string | null;
  details?: Record<string, unknown> | null;
}
/** `kind` is fixed at creation; `pnr` is set by staff on update (TravelBookingUpdate). */
export interface TravelBookingUpdateIn extends Partial<Omit<TravelBookingIn, 'case_id' | 'kind'>> {
  status?: ServiceBookingStatus;
  pnr?: string | null;
  price_minor?: number | null;
  currency?: CurrencyCode | null;
}

/** Subset of the accommodation provider embedded in a booking (backend AccommodationProviderRef). */
export interface AccommodationProviderRef {
  id: Uuid;
  name: string;
  type: AccommodationType;
  city: string | null;
  address: string | null;
  star_rating: number | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AccommodationBookingOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  patient: TravelPatientRef | null;
  provider: AccommodationProviderRef | null;
  check_in: IsoDate;
  check_out: IsoDate;
  nights: number;
  guests: number;
  room_type: string | null;
  nightly_rate_minor: number | null;
  total_minor: number | null;
  currency: CurrencyCode | null;
  status: ServiceBookingStatus;
  confirmation_code: string | null;
  notes: string | null;
  created_at: IsoDateTime;
}
export interface AccommodationBookingIn {
  case_id: Uuid;
  provider_id: Uuid;
  check_in: IsoDate;
  check_out: IsoDate;
  guests?: number;
  room_type?: string | null;
  notes?: string | null;
}
/** `total_minor` is computed by the server (nightly rate x nights). */
export interface AccommodationBookingUpdateIn extends Partial<Omit<AccommodationBookingIn, 'case_id' | 'provider_id'>> {
  status?: ServiceBookingStatus;
  nightly_rate_minor?: number | null;
  currency?: CurrencyCode | null;
  confirmation_code?: string | null;
}

/** Subset of the service provider embedded in a booking (backend ServiceProviderRef). */
export interface ServiceProviderRef {
  id: Uuid;
  name: string;
  kind: ServiceKind;
  city: string | null;
  phone: string | null;
  languages: string[];
}

export interface ServiceBookingOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  patient: TravelPatientRef | null;
  provider: ServiceProviderRef | null;
  kind: ServiceKind;
  starts_at: IsoDateTime | null;
  ends_at: IsoDateTime | null;
  status: ServiceBookingStatus;
  price_minor: number | null;
  currency: CurrencyCode | null;
  notes: string | null;
  created_at: IsoDateTime;
}
export interface ServiceBookingIn {
  case_id: Uuid;
  kind: ServiceKind;
  provider_id?: Uuid | null;
  starts_at?: IsoDateTime | null;
  ends_at?: IsoDateTime | null;
  notes?: string | null;
}
export interface ServiceBookingUpdateIn extends Partial<Omit<ServiceBookingIn, 'case_id' | 'kind'>> {
  status?: ServiceBookingStatus;
  price_minor?: number | null;
  currency?: CurrencyCode | null;
}

/** Filters shared by all /travel/* lists (visa + accommodation accept only these). */
export interface TravelListParams extends PageParams {
  case_id?: Uuid;
  /** one status or several (repeated `status=`) */
  status?: string | readonly string[];
  /** patient name */
  q?: string;
  /** inclusive IST days of the key date (visa requested, departure, check-in, service start, SOS raised) */
  from?: string;
  to?: string;
}
/** travel-bookings and service-bookings additionally filter by `kind`. */
export interface TravelKindListParams extends TravelListParams {
  kind?: string | readonly string[];
}

export type TravelResource = 'visa' | 'travel' | 'accommodation' | 'services' | 'sos';

export interface SosAlertOut {
  id: Uuid;
  patient: TravelPatientRef | null;
  patient_phone: string | null;
  case_id: Uuid | null;
  case_number: string | null;
  lat: number | null;
  lng: number | null;
  message: string | null;
  status: SosStatus;
  acknowledged_by: IdFullName | null;
  coordinator: IdFullName | null;
  resolved_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}
export interface SosIn {
  lat?: number;
  lng?: number;
  message?: string;
  case_id?: Uuid;
}
export interface SosUpdateIn {
  status: SosStatus;
  note?: string;
}

// ---------------------------------------------------------------------------------------------------------
// 8.9 messaging & notifications
// ---------------------------------------------------------------------------------------------------------
export interface ParticipantOut {
  user_id: Uuid;
  full_name: string;
  role: UserRole;
}

export interface MessageOut {
  id: Uuid;
  conversation_id: Uuid;
  sender: { id: Uuid; full_name: string; role: UserRole };
  body: string;
  attachment_document_ids: Uuid[];
  created_at: IsoDateTime;
  edited_at?: IsoDateTime | null;
  /** hidden by a moderator; only the sender and staff still receive it (CG-16) */
  hidden?: boolean;
}

export interface ConversationOut {
  id: Uuid;
  kind: ConversationKind;
  case_id: Uuid | null;
  subject: string | null;
  participants: ParticipantOut[];
  last_message: MessageOut | null;
  unread_count: number;
  last_message_at: IsoDateTime | null;
}

export interface ConversationCreateIn {
  case_id?: Uuid;
  subject?: string;
  participant_user_ids?: Uuid[];
}

export interface MessageCreateIn {
  body: string;
  attachment_document_ids?: Uuid[];
}

export interface MessageListParams {
  /** ISO timestamp or message id cursor: returns messages older than this */
  before?: string;
  limit?: number;
}

export interface NotificationOut {
  id: Uuid;
  /** e.g. "booking.confirmed" */
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface NotificationListParams extends PageParams {
  unread?: boolean;
}

export interface UnreadCountOut {
  count: number;
}

/** Server -> client WebSocket events on /api/v1/ws */
export type RealtimeEvent =
  | { type: 'message.created'; data: MessageOut }
  | { type: 'notification.created'; data: NotificationOut }
  | { type: 'screening.completed'; data: { screening_id: Uuid; patient_id?: Uuid; status?: ScreeningStatus } }
  | { type: 'booking.updated'; data: { booking_id: Uuid; status?: BookingStatus; case_id?: Uuid } }
  | { type: 'case.updated'; data: { case_id: Uuid; status?: CaseStatus } };
export type RealtimeEventType = RealtimeEvent['type'];

// ---------------------------------------------------------------------------------------------------------
// 8.10 agent portal
// ---------------------------------------------------------------------------------------------------------
export interface AgentProfileOut {
  id: Uuid;
  user_id: Uuid;
  agency_name: string;
  agent_code: string;
  country: CountryCode | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  status: AgentStatus;
  kyc_status: KycStatus;
  tier: AgentTier;
  commission_rate_bps: number | null;
  approved_at: IsoDateTime | null;
  rejection_reason: string | null;
  created_at: IsoDateTime;
  full_name?: string;
  email?: string | null;
}

export interface AgentProfileIn {
  agency_name?: string;
  country?: CountryCode | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
}

export interface AgentDashboard {
  patients_total: number;
  active_cases: number;
  bookings_confirmed: number;
  commission_pending_minor: number;
  commission_paid_minor: number;
  currency: CurrencyCode;
  /** 0..1 */
  conversion_rate: number;
  monthly: (MonthPoint & { cases: number; bookings: number; commission_minor: number })[];
  recent_cases: CaseOut[];
}

/** How the agent obtained the patient's consent off-platform (backlog #30). */
export const AGENT_CONSENT_METHODS = ['in_person', 'phone', 'video_call', 'written', 'email'] as const;
export type AgentConsentMethod = (typeof AGENT_CONSENT_METHODS)[number];
export const AGENT_CONSENT_METHOD_LABELS: Record<AgentConsentMethod, string> = {
  in_person: 'In person',
  phone: 'Phone call',
  video_call: 'Video call',
  written: 'Written / signed form',
  email: 'Email',
};

export const AGENT_CONSENT_STATUSES = ['not_recorded', 'pending_patient_confirmation', 'confirmed', 'withdrawn'] as const;
export type AgentConsentStatus = (typeof AGENT_CONSENT_STATUSES)[number];
export const AGENT_CONSENT_STATUS_LABELS: Record<AgentConsentStatus, string> = {
  not_recorded: 'Not recorded',
  pending_patient_confirmation: 'Awaiting patient confirmation',
  confirmed: 'Confirmed by patient',
  withdrawn: 'Withdrawn',
};

/** Agent attestation that the patient consented (terms + privacy mandatory). */
export interface AgentConsentAttestationIn {
  consent_attested: true;
  /** default [terms, privacy, share_with_hospitals]; must include terms + privacy */
  consent_kinds?: ConsentKind[];
  /** default "in_person" */
  consent_method?: AgentConsentMethod;
  consent_note?: string | null;
}

export interface AgentPatientConsentOut {
  status: AgentConsentStatus;
  kinds: ConsentKind[];
  method: AgentConsentMethod | string | null;
  version: string | null;
  attested_at: IsoDateTime | null;
  attested_by_user_id: Uuid | null;
  patient_confirmed_at: IsoDateTime | null;
  pending_kinds: ConsentKind[];
}

export interface AgentPatientOut extends PatientProfileOut {
  email?: string | null;
  full_name?: string;
  cases_count?: number;
  /** cases in an open status (enquiry .. in_treatment) */
  active_cases_count?: number;
  screenings_count?: number;
  /** agent consent attestation + patient confirmation state */
  consent?: AgentPatientConsentOut;
}

export interface AgentPatientCreateIn extends AgentConsentAttestationIn {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  nationality: CountryCode;
  date_of_birth?: IsoDate;
  gender?: Gender;
  medical_history?: string;
}

export interface AgentPatientUpdateIn extends Partial<PatientProfileIn> {
  email?: string | null;
}

export interface AgentPatientListParams extends PageParams {
  q?: string;
  /** consent state (repeatable) */
  consent?: AgentConsentStatus | readonly AgentConsentStatus[];
  /** ISO-3166 alpha-2 nationality (repeatable) */
  nationality?: string | readonly string[];
  /** has a case in an open status */
  has_active_case?: boolean;
  /** inclusive IST calendar dates (YYYY-MM-DD) */
  created_from?: string;
  created_to?: string;
  /** created_at | updated_at | name; '-' prefix = descending (default -created_at) */
  sort?: string;
}

/** GET /agent-portal/patients/counts - per consent state (consent filter ignored) and nationality (its filter ignored) */
export interface AgentPatientCounts {
  counts: Partial<Record<AgentConsentStatus, number>>;
  total: number;
  nationalities: Record<string, number>;
}

/** GET /agent-portal/commissions item: a settlement item enriched with its booking's case/hospital/patient */
export interface AgentCommissionOut extends SettlementItemOut {
  case_id?: Uuid | null;
  case_number?: string | null;
  hospital_id?: Uuid | null;
  hospital_name?: string | null;
  patient_id?: Uuid | null;
  patient_name?: string | null;
}

export interface AgentCommissionListParams extends PageParams {
  /** item status (repeatable) */
  status?: SettlementItemStatus | readonly SettlementItemStatus[];
  hospital_id?: Uuid;
  /** booking/case number, patient or hospital name */
  q?: string;
  /** inclusive IST calendar dates (YYYY-MM-DD) on the item's created_at */
  created_from?: string;
  created_to?: string;
  /** net amount bounds, minor units */
  min_net?: number;
  max_net?: number;
  /** created_at | eligible_at | net_minor | gross_minor | status | booking_number; '-' = desc */
  sort?: string;
}

/** GET /agent-portal/commissions/status-counts (status filter ignored) */
export interface AgentCommissionStatusCounts {
  counts: Partial<Record<SettlementItemStatus, number>>;
  net_minor: Partial<Record<SettlementItemStatus, number>>;
  total: number;
}

export interface ReferralOut {
  agent_code: string;
  referral_url: string;
}

// ---------------------------------------------------------------------------------------------------------
// 8.11 payments
// ---------------------------------------------------------------------------------------------------------
export interface PaymentOrderOut {
  id: Uuid;
  order_number: string;
  purpose: PaymentPurpose;
  status: OrderStatus;
  gateway: PaymentGateway;
  amount_minor: number;
  currency: CurrencyCode;
  base_amount_minor: number;
  base_currency: CurrencyCode;
  fx_rate: DecimalString | number;
  booking_id: Uuid | null;
  installment_id: Uuid | null;
  consultation_id: Uuid | null;
  gateway_order_id: string | null;
  created_at: IsoDateTime;
  paid_at: IsoDateTime | null;
  expires_at: IsoDateTime | null;
  case_id?: Uuid | null;
  patient_id?: Uuid | null;
  /** set while the order waits on a finance decision (amount review / second mark-paid approver) */
  review_required?: OrderReviewKind | null;
  /** present on detail responses for staff */
  payments?: PaymentOut[];
  refunds?: RefundOut[];
  payer_name?: string | null;
  booking_number?: string | null;
  /** staff lists: patient of the order and the method of its latest payment attempt */
  patient_name?: string | null;
  payment_method?: PaymentMethod | null;
}

/** Finance review queues on payment orders (`GET /payments/orders?review=`). */
export type OrderReviewKind = 'amount' | 'mark_paid';

export interface BankTransferProofOut {
  document_id: Uuid;
  reference: string;
  submitted_at: IsoDateTime;
}

/** Bank-transfer mark-paid request awaiting (or decided by) a second finance user (staff view only). */
export interface MarkPaidRequestOut {
  /** null only for requests recorded before SEC-063 */
  id?: Uuid | null;
  status: 'pending' | 'approved' | 'rejected';
  reference: string;
  amount_minor: number;
  requested_by: Uuid;
  requested_at: IsoDateTime;
  decided_by?: Uuid | null;
  decided_at?: IsoDateTime | null;
  reason?: string | null;
}

/** A payment held because its captured amount differed from the order amount (staff view only). */
export interface AmountReviewOut {
  payment_id: Uuid;
  status: 'pending' | 'returning' | 'accepted' | 'returned';
  expected_minor: number;
  received_minor: number;
  currency: CurrencyCode;
  held_at: IsoDateTime;
  decided_by?: Uuid | null;
  decided_at?: IsoDateTime | null;
  note?: string | null;
}

/** GET /payments/orders/{id}: the order plus payments, refunds and (staff only) review state. */
export interface PaymentOrderDetail extends PaymentOrderOut {
  payments: PaymentOut[];
  refunds: RefundOut[];
  bank_transfer_proof?: BankTransferProofOut | null;
  mark_paid_request?: MarkPaidRequestOut | null;
  amount_reviews?: AmountReviewOut[];
}

/** Second-approver decision on a pending bank-transfer mark-paid request. */
export interface MarkPaidDecisionIn {
  reason?: string | null;
}

/**
 * Checker approval (SEC-063): echo the reviewed `mark_paid_request` (id, reference, amount); the server answers
 * 409 `mark_paid_request_changed` when the pending request differs.
 */
export interface MarkPaidApproveIn {
  request_id?: Uuid | null;
  reference: string;
  amount_minor: number;
}

/** `accept` applies the received amount pro rata; `return` refunds it in full without touching the books. */
export interface AmountReviewIn {
  payment_id: Uuid;
  decision: 'accept' | 'return';
  note: string;
}

export interface PaymentOut {
  id: Uuid;
  order_id: Uuid;
  gateway: PaymentGateway;
  gateway_payment_id: string | null;
  method: PaymentMethod | null;
  status: PaymentStatus;
  amount_minor: number;
  currency: CurrencyCode;
  base_amount_minor: number;
  fee_minor: number | null;
  tax_on_fee_minor: number | null;
  amount_refunded_minor: number;
  error_code: string | null;
  error_description: string | null;
  captured_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface OrderCreateIn {
  booking_id?: Uuid;
  installment_id?: Uuid;
  consultation_id?: Uuid;
  purpose: PaymentPurpose;
  gateway: PaymentGateway;
  currency?: CurrencyCode;
}

export interface CheckoutOut {
  order: PaymentOrderOut;
  gateway: PaymentGateway;
  razorpay?: {
    key_id: string;
    order_id: string;
    amount: number;
    currency: CurrencyCode;
    name: string;
    description: string;
    prefill: { name?: string | null; email?: string | null; contact?: string | null };
  };
  stripe?: { publishable_key: string; client_secret: string };
  bank_transfer?: {
    beneficiary_name: string;
    bank_name: string;
    account_number: string;
    ifsc: string | null;
    swift: string | null;
    iban: string | null;
    reference: string;
  };
  mock?: { complete_url: string };
}

export interface OrderListParams extends PageParams {
  /** one or several (repeated `status=`) */
  status?: OrderStatus | readonly OrderStatus[];
  booking_id?: Uuid;
  gateway?: PaymentGateway | readonly PaymentGateway[];
  purpose?: PaymentPurpose | readonly PaymentPurpose[];
  /** orders with a payment attempt by this method (repeatable) */
  method?: PaymentMethod | readonly PaymentMethod[];
  /** order currency (repeatable) */
  currency?: CurrencyCode | readonly CurrencyCode[];
  /** order / booking number, gateway order id, patient name */
  q?: string;
  /** staff: orders awaiting a finance decision (`any` = either queue) */
  review?: OrderReviewKind | 'any';
  /** inclusive IST calendar dates (YYYY-MM-DD) */
  created_from?: string;
  created_to?: string;
  paid_from?: string;
  paid_to?: string;
  /** base-currency (INR) minor units */
  min_amount?: number;
  max_amount?: number;
  /** created_at | paid_at | base_amount_minor | amount_minor | order_number | status; '-' = descending */
  sort?: string;
}

/** `GET /payments/orders/status-counts` (staff): per status + finance-review queues for the same filters. */
export interface OrderStatusCounts {
  counts: Record<OrderStatus, number>;
  total: number;
  review: Record<OrderReviewKind | 'any', number>;
}

export interface RazorpayVerifyIn {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface BankTransferProofIn {
  document_id: Uuid;
  reference: string;
}

export interface OrderMarkPaidIn {
  reference: string;
  amount_minor: number;
}

export interface MockCompleteIn {
  outcome: 'success' | 'failure';
}

export interface RefundOut {
  id: Uuid;
  payment_id: Uuid;
  order_id: Uuid;
  booking_id: Uuid | null;
  amount_minor: number;
  currency: CurrencyCode;
  base_amount_minor: number;
  reason: string | null;
  status: RefundStatus;
  gateway_refund_id: string | null;
  requested_by?: Uuid | null;
  requested_by_name?: string | null;
  approved_by?: Uuid | null;
  approved_by_name?: string | null;
  processed_at: IsoDateTime | null;
  created_at: IsoDateTime;
  order_number?: string | null;
  /** staff lists */
  patient_name?: string | null;
}

export interface RefundCreateIn {
  payment_id?: Uuid;
  order_id?: Uuid;
  amount_minor: number;
  reason: string;
}

export interface RefundListParams extends PageParams {
  status?: RefundStatus | readonly RefundStatus[];
  booking_id?: Uuid;
  payment_id?: Uuid;
  order_id?: Uuid;
  /** order / booking number, patient name */
  q?: string;
  created_from?: string;
  created_to?: string;
  /** base-currency (INR) minor units */
  min_amount?: number;
  max_amount?: number;
  /** requested refunds above the dual-approval threshold */
  awaiting_second_approval?: boolean;
  /** created_at | processed_at | base_amount_minor | amount_minor | status; '-' = descending */
  sort?: string;
}

/** `GET /payments/refunds/status-counts`: per status + the second-approver queue (threshold in INR minor). */
export interface RefundStatusCounts {
  counts: Record<RefundStatus, number>;
  total: number;
  awaiting_second_approval: number;
  threshold_minor: number;
}

export interface ReasonIn {
  reason: string;
}

export interface InstallmentOut {
  id: Uuid;
  booking_id: Uuid;
  seq: number;
  due_date: IsoDate;
  amount_minor: number;
  currency: CurrencyCode;
  status: InstallmentStatus;
  order_id: Uuid | null;
  paid_at: IsoDateTime | null;
}

export interface InvoiceLineItem {
  description: string;
  amount_minor: number;
  quantity?: number;
  tax_minor?: number;
  hsn_sac?: string | null;
}

export interface InvoiceOut {
  id: Uuid;
  invoice_number: string;
  kind: InvoiceKind;
  booking_id: Uuid | null;
  order_id: Uuid | null;
  settlement_batch_id: Uuid | null;
  issued_to_user_id: Uuid | null;
  hospital_id: Uuid | null;
  agent_id: Uuid | null;
  line_items: InvoiceLineItem[];
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: CurrencyCode;
  supplier_gstin: string | null;
  recipient_gstin: string | null;
  place_of_supply: string | null;
  issued_at: IsoDateTime;
}

export interface InvoiceListParams extends PageParams {
  kind?: InvoiceKind;
  booking_id?: Uuid;
}

// ---------------------------------------------------------------------------------------------------------
// 8.12 finance - ledger & settlements
// ---------------------------------------------------------------------------------------------------------
export interface StaffFinanceSummary {
  currency: CurrencyCode;
  escrow_minor: number;
  gateway_receivable_minor: number;
  bank_minor: number;
  commission_revenue_minor: number;
  gst_payable_minor: number;
  tds_payable_minor: number;
  hospital_payables_minor: number;
  agent_payables_minor: number;
  pending_settlement_minor: number;
  gmv_minor: number;
  service_fee_revenue_minor?: number;
  gateway_fees_minor?: number;
  agent_commission_expense_minor?: number;
  eligible_settlement_minor?: number;
  on_hold_settlement_minor?: number;
  batches_pending_approval?: number;
  payouts_in_progress?: number;
  /** UTR / transfer id recorded, waiting for a second finance user (`mark-paid/approve`) */
  payouts_awaiting_confirmation?: number;
  /** gateway outcome unknown (SEC-004): resolve with mark-paid (`trf_…`) or the two-person mark-failed */
  payouts_needs_reconciliation?: number;
  /** failure / reversal requests waiting for a second finance user (`mark-failed/approve`) */
  payout_reversals_pending?: number;
}

export interface PayeeFinanceSummary {
  currency: CurrencyCode;
  pending_minor: number;
  eligible_minor: number;
  on_hold_minor: number;
  paid_minor: number;
  last_payout: PayoutOut | null;
  next_payout_date: IsoDate | null;
}

export type FinanceSummary = StaffFinanceSummary | PayeeFinanceSummary;

export function isStaffFinanceSummary(s: FinanceSummary): s is StaffFinanceSummary {
  return 'escrow_minor' in s;
}

export interface LedgerAccountOut {
  id: Uuid;
  code: string;
  name: string;
  type: LedgerAccountType;
  owner_type: LedgerOwnerType;
  owner_id: Uuid | null;
  currency: CurrencyCode;
  balance_minor: number;
  created_at?: IsoDateTime;
}

export interface LedgerAccountListParams extends PageParams {
  owner_type?: LedgerOwnerType | readonly LedgerOwnerType[];
  type?: LedgerAccountType | readonly LedgerAccountType[];
  owner_id?: Uuid;
  q?: string;
  /** only accounts with a non-zero balance */
  nonzero?: boolean;
  /** code | name | type | owner_type | balance_minor; '-' = descending (default code) */
  sort?: string;
}

/** `GET /finance/ledger/accounts/summary`: accounts and summed balances per account type. */
export interface LedgerAccountSummaryOut {
  counts: Record<LedgerAccountType, number>;
  balances: Record<LedgerAccountType, number>;
  total: number;
}

export interface AccountEntryListParams extends PageParams {
  direction?: EntryDirection;
  txn_type?: LedgerTxnType | readonly LedgerTxnType[];
  posted_from?: string;
  posted_to?: string;
  /** posted_at | amount_minor; '-' = descending (default -posted_at) */
  sort?: string;
}

/** One line of a ledger transaction (LedgerTransactionOut.entries). */
export interface LedgerEntryOut {
  id: Uuid;
  account_id: Uuid;
  account_code: string;
  account_name: string;
  account_type: LedgerAccountType;
  direction: EntryDirection;
  amount_minor: number;
  currency: CurrencyCode;
}

/** One line of an account statement (GET /finance/ledger/accounts/{id}/entries). */
export interface AccountEntryOut {
  id: Uuid;
  transaction_id: Uuid;
  txn_type: LedgerTxnType;
  reference_type: string | null;
  reference_id: Uuid | null;
  description: string | null;
  direction: EntryDirection;
  amount_minor: number;
  /** in the account's normal-balance sign */
  signed_amount_minor: number;
  currency: CurrencyCode;
  posted_at: IsoDateTime;
  created_at: IsoDateTime;
}

export interface LedgerTransactionOut {
  id: Uuid;
  txn_type: LedgerTxnType;
  reference_type: string | null;
  reference_id: Uuid | null;
  description: string | null;
  idempotency_key: string;
  posted_at: IsoDateTime;
  created_by?: Uuid | null;
  created_at?: IsoDateTime;
  entries?: LedgerEntryOut[];
  /** sum of the debit lines */
  total_minor?: number;
}

export interface LedgerTransactionListParams extends PageParams {
  txn_type?: LedgerTxnType | readonly LedgerTxnType[];
  reference_type?: string;
  reference_id?: Uuid;
  account_id?: Uuid;
  /** description, reference type or a reference / transaction id */
  q?: string;
  posted_from?: string;
  posted_to?: string;
  /** transaction total (sum of debits), minor units */
  min_amount?: number;
  max_amount?: number;
  /** posted_at; '-' = descending (default) */
  sort?: string;
}

export interface TrialBalanceRow {
  type: LedgerAccountType;
  debit_minor: number;
  credit_minor: number;
  balance_minor: number;
  accounts?: { code: string; name: string; balance_minor: number }[];
}

export interface TrialBalanceOut {
  currency: CurrencyCode;
  rows: TrialBalanceRow[];
  total_debit_minor: number;
  total_credit_minor: number;
  /** must be 0 */
  net_minor: number;
  as_of?: IsoDateTime;
  /** per-account debit / credit totals computed from the entries */
  accounts?: TrialBalanceAccountRow[];
  balanced?: boolean;
  /** cached account balances match the entries */
  cached_balances_consistent?: boolean;
}

export interface TrialBalanceAccountRow {
  id: Uuid;
  code: string;
  name: string;
  type: LedgerAccountType;
  debit_minor: number;
  credit_minor: number;
  /** normal-balance sign, computed from the entries */
  balance_minor: number;
  cached_balance_minor: number;
}

export interface SettlementItemOut {
  id: Uuid;
  payee_type: PayeeType;
  payee_id: Uuid;
  payee_name: string | null;
  booking_id: Uuid;
  booking_number: string | null;
  gross_minor: number;
  commission_minor: number;
  tax_minor: number;
  tds_minor: number;
  net_minor: number;
  currency: CurrencyCode;
  status: SettlementItemStatus;
  eligible_at: IsoDateTime | null;
  hold_reason: string | null;
  batch_id: Uuid | null;
  created_at: IsoDateTime;
}

export interface SettlementItemListParams extends PageParams {
  payee_type?: PayeeType;
  payee_id?: Uuid;
  /** repeatable */
  status?: SettlementItemStatus | SettlementItemStatus[];
  booking_id?: Uuid;
  batch_id?: Uuid;
  /** payee name or booking number */
  q?: string;
  /** eligible (hold ends) window, inclusive IST days */
  eligible_from?: IsoDate;
  eligible_to?: IsoDate;
  created_from?: IsoDate;
  created_to?: IsoDate;
  min_net?: number;
  max_net?: number;
  /** created_at | eligible_at | net_minor | gross_minor | status ('-' = desc) */
  sort?: string;
}

/** GET …/status-counts (settlement items, batches, payouts), …/invoices/kind-counts, payout-accounts/verification-counts. */
export interface SettlementListCounts {
  counts: Record<string, number>;
  total: number;
  /** batches: automatic batches waiting for a human approver */
  auto_pending_approval?: number | null;
  /** payouts: UTR recorded, waiting for a second finance user */
  awaiting_confirmation?: number | null;
  /** payouts: failure / reversal requests waiting for a second finance user */
  reversal_pending?: number | null;
}

export interface PayoutOut {
  id: Uuid;
  batch_id: Uuid;
  payee_type: PayeeType;
  payee_id: Uuid;
  payee_name: string | null;
  amount_minor: number;
  currency: CurrencyCode;
  method: PayoutMethod;
  status: PayoutStatus;
  utr: string | null;
  gateway_payout_id: string | null;
  failure_reason: string | null;
  processed_at: IsoDateTime | null;
  created_at: IsoDateTime;
  batch_number?: string | null;
  payout_account_id?: Uuid | null;
  /** manual mark-paid maker-checker: set by the first finance user; a different one must confirm */
  paid_requested_by?: Uuid | null;
  paid_requested_at?: IsoDateTime | null;
  paid_confirmed_by?: Uuid | null;
  /** UTR recorded, waiting for the second finance user */
  awaiting_confirmation?: boolean;
  /** failing a processed / needs_reconciliation payout: requested by one finance user, approved by another */
  reversal_requested_by?: Uuid | null;
  reversal_requested_at?: IsoDateTime | null;
  reversal_reason?: string | null;
  reversal_reference?: string | null;
  /** SEC-063: echo back to mark-paid/approve (`paid_request_id`) and mark-failed/approve (`reversal_request_id`) */
  paid_request_id?: Uuid | null;
  reversal_request_id?: Uuid | null;
}

/** Checker approval of a payout failure/reversal (SEC-063): the reviewed request id + reference. */
export interface PayoutFailureApproveIn {
  request_id: Uuid;
  reference: string;
}

export interface PayoutListParams extends PageParams {
  /** repeatable */
  status?: PayoutStatus | PayoutStatus[];
  /** repeatable */
  method?: PayoutMethod | PayoutMethod[];
  /** UTR, gateway id, batch number or payee name */
  q?: string;
  created_from?: IsoDate;
  created_to?: IsoDate;
  processed_from?: IsoDate;
  processed_to?: IsoDate;
  min_amount?: number;
  max_amount?: number;
  /** created_at | processed_at | amount_minor | status ('-' = desc) */
  sort?: string;
  payee_type?: PayeeType;
  payee_id?: Uuid;
  batch_id?: Uuid;
  /** true: UTR recorded and waiting for the second finance user (mark-paid/approve) */
  awaiting_confirmation?: boolean;
  /** true: a failure / reversal request waits for the second finance user (mark-failed/approve) */
  reversal_pending?: boolean;
}

/** Masked destination account frozen into a batch at generation (SEC-003); shown to the approver. */
export interface PayoutAccountSnapshot {
  payout_account_id: Uuid;
  fingerprint: string | null;
  account_holder_name: string;
  account_number_masked: string;
  ifsc: string | null;
  swift: string | null;
  bank_name: string | null;
  razorpay_linked_account_id: string | null;
}

export interface SettlementBatchOut {
  id: Uuid;
  batch_number: string;
  payee_type: PayeeType;
  payee_id: Uuid | null;
  payee_name?: string | null;
  status: SettlementBatchStatus;
  period_end: IsoDate | null;
  items_count: number;
  total_gross_minor: number;
  total_commission_minor: number;
  total_tax_minor: number;
  total_tds_minor: number;
  total_net_minor: number;
  currency: CurrencyCode;
  created_by_name: string | null;
  approved_by_name: string | null;
  created_at: IsoDateTime;
  approved_at: IsoDateTime | null;
  processed_at: IsoDateTime | null;
  notes?: string | null;
  created_by?: Uuid | null;
  approved_by?: Uuid | null;
  items?: SettlementItemOut[];
  payouts?: PayoutOut[];
  /** {payee_id: frozen account, or null when the payee had no verified primary account} */
  payout_accounts_snapshot?: Record<string, PayoutAccountSnapshot | null> | null;
}

export interface SettlementBatchListParams extends PageParams {
  /** repeatable */
  status?: SettlementBatchStatus | SettlementBatchStatus[];
  payee_type?: PayeeType;
  payee_id?: Uuid;
  /** true: generated by the daily job (no human maker) */
  auto?: boolean;
  /** batch number, payee or maker name */
  q?: string;
  created_from?: IsoDate;
  created_to?: IsoDate;
  min_net?: number;
  max_net?: number;
  /** created_at | batch_number | period_end | items_count | total_net_minor | status ('-' = desc) */
  sort?: string;
}

export interface SettlementBatchCreateIn {
  payee_type: PayeeType;
  payee_id?: Uuid;
  period_end?: IsoDate;
}

export interface PayoutMarkPaidIn {
  /** bank UTR (4-64 letters, digits, dashes; upper-cased) or a Razorpay Route transfer id `trf_…` (kept as is) */
  utr: string;
}

/**
 * Checker confirmation of a recorded payout UTR (SEC-063 binding): echo what was reviewed; 409
 * `mark_paid_request_changed` when the pending request differs.
 */
export interface PayoutMarkPaidApproveIn {
  /** the payout's `paid_request_id` */
  request_id: Uuid;
  reference: string;
  amount_minor: number;
}

/**
 * Queued/processing payouts fail at once. Processed (bounced) or needs_reconciliation payouts only record a
 * request that a different finance user approves; `reference` (bank return / gateway reference, 3-100 chars)
 * is then required (400 `reference_required`).
 */
export interface PayoutMarkFailedIn {
  reason: string;
  reference?: string | null;
}

/** Commission invoices / credit notes (hospitals) and commission statements (agents). */
export type SettlementDocumentKind = 'commission_invoice' | 'credit_note' | 'agent_statement';

/** GST head of a commission invoice / credit note line (CGST+SGST intra-state, IGST inter-state). */
export interface SettlementGstSplit {
  tax: 'CGST' | 'SGST' | 'IGST' | (string & {});
  amount_minor: number;
}

/**
 * Settlement document line (backend `settlements/invoices.py`). Commission invoices / credit notes carry
 * `sac`, `taxable_minor`, `gst_minor` and `gst_split`; agent statements carry `commission_minor` and
 * `withholding_minor`. `note` lines are footnotes (no amounts).
 */
export interface SettlementDocumentLineItem {
  description: string;
  amount_minor: number;
  currency?: CurrencyCode;
  item_id?: Uuid;
  booking_id?: Uuid;
  booking_number?: string;
  sac?: string | null;
  taxable_minor?: number;
  gst_minor?: number;
  gst_split?: SettlementGstSplit[];
  original_invoice_number?: string | null;
  commission_minor?: number;
  withholding_minor?: number;
  note?: boolean;
}

export interface SettlementDocumentOut {
  id: Uuid;
  invoice_number: string;
  kind: InvoiceKind;
  settlement_batch_id: Uuid | null;
  hospital_id: Uuid | null;
  agent_id: Uuid | null;
  /** hospital name or agency name */
  payee_name?: string | null;
  line_items: SettlementDocumentLineItem[];
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  currency: CurrencyCode;
  supplier_gstin: string | null;
  recipient_gstin: string | null;
  place_of_supply: string | null;
  issued_at: IsoDateTime;
}

export interface SettlementDocumentListParams extends PageParams {
  /** repeatable */
  kind?: SettlementDocumentKind | SettlementDocumentKind[];
  /** document number, GSTIN or payee name */
  q?: string;
  issued_from?: IsoDate;
  issued_to?: IsoDate;
  min_total?: number;
  max_total?: number;
  /** issued_at | invoice_number | total_minor ('-' = desc) */
  sort?: string;
  batch_id?: Uuid;
  payee_type?: PayeeType;
  payee_id?: Uuid;
}

// ledger adjustments (maker-checker) ------------------------------------------------------------------------
export type LedgerAdjustmentKind = 'tax_remittance' | 'fx_difference' | 'manual';
export type LedgerAdjustmentStatus = 'pending_approval' | 'posted' | 'rejected';

export interface LedgerAdjustmentEntryIn {
  account_code: string;
  direction: EntryDirection;
  amount_minor: number;
}

export interface LedgerAdjustmentCreateIn {
  kind: LedgerAdjustmentKind;
  description: string;
  external_reference?: string | null;
  /** 2-20 balanced entries (INR minor units) */
  entries: LedgerAdjustmentEntryIn[];
}

export interface LedgerAdjustmentOut {
  id: Uuid;
  kind: LedgerAdjustmentKind;
  status: LedgerAdjustmentStatus;
  description: string;
  external_reference: string | null;
  entries: LedgerAdjustmentEntryIn[];
  amount_minor: number;
  currency: CurrencyCode;
  requested_by: Uuid;
  approved_by: Uuid | null;
  approved_at: IsoDateTime | null;
  rejection_reason: string | null;
  ledger_transaction_id: Uuid | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface LedgerAdjustmentListParams extends PageParams {
  status?: LedgerAdjustmentStatus | readonly LedgerAdjustmentStatus[];
  kind?: LedgerAdjustmentKind | readonly LedgerAdjustmentKind[];
  /** description or external reference */
  q?: string;
  created_from?: string;
  created_to?: string;
  min_amount?: number;
  max_amount?: number;
  /** created_at | approved_at | amount_minor | status | kind; '-' = descending */
  sort?: string;
}

/** `GET /finance/ledger/adjustments/status-counts` */
export interface LedgerAdjustmentStatusCounts {
  counts: Record<LedgerAdjustmentStatus, number>;
  total: number;
}

export interface CommissionRuleOut {
  id: Uuid;
  scope: CommissionScope;
  hospital_id: Uuid | null;
  specialty_id: Uuid | null;
  procedure_id: Uuid | null;
  agent_id: Uuid | null;
  hospital_name?: string | null;
  specialty_name?: string | null;
  procedure_name?: string | null;
  agent_name?: string | null;
  rate_bps: number;
  effective_from: IsoDate;
  effective_to: IsoDate | null;
  is_active: boolean;
  created_by?: Uuid | null;
  created_at: IsoDateTime;
}

export interface CommissionRuleIn {
  scope: CommissionScope;
  hospital_id?: Uuid | null;
  specialty_id?: Uuid | null;
  procedure_id?: Uuid | null;
  agent_id?: Uuid | null;
  rate_bps: number;
  effective_from: IsoDate;
  effective_to?: IsoDate | null;
  is_active?: boolean;
}

export interface CommissionRuleListParams extends PageParams {
  scope?: CommissionScope;
  is_active?: boolean;
}

export interface PayoutAccountOut {
  id: Uuid;
  owner_type: PayeeType;
  owner_id: Uuid;
  owner_name?: string | null;
  account_holder_name: string;
  account_number_masked: string;
  ifsc: string | null;
  bank_name: string | null;
  swift: string | null;
  razorpay_linked_account_id: string | null;
  is_verified: boolean;
  is_primary: boolean;
  status: PayoutAccountStatus;
  /** who last submitted the bank details; that user cannot verify them (403 `maker_checker`) */
  submitted_by?: Uuid | null;
  verified_by?: Uuid | null;
  verified_at?: IsoDateTime | null;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface PayoutAccountIn {
  account_holder_name: string;
  /** write-only */
  account_number: string;
  ifsc?: string | null;
  bank_name?: string | null;
  swift?: string | null;
  is_primary?: boolean;
  /** staff only: create for a specific owner */
  owner_type?: PayeeType;
  owner_id?: Uuid;
}

export interface PayoutAccountUpdateIn {
  account_holder_name?: string;
  account_number?: string;
  ifsc?: string | null;
  bank_name?: string | null;
  swift?: string | null;
  is_primary?: boolean;
  status?: PayoutAccountStatus;
  razorpay_linked_account_id?: string | null;
}

export interface PayoutAccountListParams extends PageParams {
  owner_type?: PayeeType;
  owner_id?: Uuid;
  is_verified?: boolean;
  /** repeatable */
  status?: PayoutAccountStatus | PayoutAccountStatus[];
  /** holder, bank, IFSC, last 4 digits or owner name */
  q?: string;
  route?: 'razorpay_route' | 'manual';
  /** created_at | account_holder_name ('-' = desc) */
  sort?: string;
}

export interface StatementRow {
  date: IsoDate;
  type: string;
  reference: string | null;
  description: string | null;
  booking_number?: string | null;
  gross_minor?: number;
  commission_minor?: number;
  tax_minor?: number;
  tds_minor?: number;
  net_minor: number;
  currency: CurrencyCode;
  status?: string;
}

export interface StatementParams {
  from?: IsoDate;
  to?: IsoDate;
}

// ---------------------------------------------------------------------------------------------------------
// 8.13 admin
// ---------------------------------------------------------------------------------------------------------
export interface AdminDashboard {
  users_by_role: Partial<Record<UserRole, number>>;
  hospitals: { active: number; pending_review: number };
  agents: { active: number; pending: number };
  cases_by_status: Partial<Record<CaseStatus, number>>;
  bookings_by_status: Partial<Record<BookingStatus, number>>;
  gmv_minor: number;
  revenue_minor: number;
  escrow_minor: number;
  pending_settlements_minor: number;
  currency: CurrencyCode;
  monthly: (MonthPoint & { gmv_minor: number; revenue_minor: number; bookings: number; new_patients: number })[];
  top_hospitals: { id: Uuid; name: string; bookings: number; gmv_minor: number }[];
  top_specialties: { slug: string; name: string; cases: number }[];
  open_sos: number;
}

export interface AdminUserOut extends UserOut {
  last_login_at?: IsoDateTime | null;
  locked_until?: IsoDateTime | null;
  failed_login_count?: number;
  deleted_at?: IsoDateTime | null;
}

export interface AdminUserListParams extends PageParams {
  role?: UserRole | readonly UserRole[];
  status?: UserStatus | readonly UserStatus[];
  q?: string;
  /** ISO-2 (repeatable) */
  country_code?: string | readonly string[];
  /** inclusive IST days */
  created_from?: string;
  created_to?: string;
  email_verified?: boolean;
  mfa_enabled?: boolean;
  is_guest?: boolean;
  /** created_at | last_login_at | full_name | email; '-' = descending (default -created_at) */
  sort?: string;
}

export interface AdminUserUpdateIn {
  status?: UserStatus;
  role?: UserRole;
}

export interface StaffCreateIn {
  email: string;
  full_name: string;
  role: UserRole;
  password: string;
}

export interface AdminHospitalListParams extends PageParams {
  status?: HospitalStatus | readonly HospitalStatus[];
  q?: string;
  kyc_status?: KycStatus | readonly KycStatus[];
  city?: string | readonly string[];
  state?: string | readonly string[];
  /** any of (repeatable) */
  accreditation?: string | readonly string[];
  specialty_id?: Uuid;
  is_featured?: boolean;
  /** name | city | created_at | updated_at | rating_avg; '-' = descending (default: approval queue first) */
  sort?: string;
}

/** GET /admin/facets: distinct values for the admin list filters. */
export interface AdminFacets {
  hospital_cities: string[];
  hospital_states: string[];
  hospital_accreditations: string[];
  agent_countries: string[];
  user_countries: string[];
  audit_entity_types: string[];
  audit_actions: string[];
}

export interface AdminHospitalDetail extends HospitalProfileOut {
  kyc_documents: DocumentOut[];
  members: HospitalMemberOut[];
  payout_accounts?: PayoutAccountOut[];
  doctors_count?: number;
  cases_count?: number;
  doctors?: AdminDoctorOut[];
  /** Active doctors without a medical registration; approval warns, never blocks. */
  doctors_missing_registration?: number;
  warnings?: string[];
}

export interface AdminDoctorOut {
  id: Uuid;
  slug: string;
  full_name: string;
  specialty_name: string | null;
  qualifications: string[];
  experience_years: number | null;
  is_active: boolean;
  registration_number: string | null;
  registration_council: string | null;
  registration_council_name: string | null;
  /** Set only by an admin who checked the NMC / state register (POST /admin/doctors/{id}/verify-registration). */
  registration_verified: boolean;
  registration_verified_at: IsoDateTime | null;
  registration_verified_by_user_id: Uuid | null;
}

export interface AdminHospitalUpdateIn {
  commission_rate_bps?: number | null;
  settlement_cycle_days?: number | null;
  is_featured?: boolean;
}

export interface AdminAgentListParams extends PageParams {
  status?: AgentStatus | readonly AgentStatus[];
  q?: string;
  kyc_status?: KycStatus | readonly KycStatus[];
  tier?: AgentTier | readonly AgentTier[];
  /** ISO-2 (repeatable) */
  country?: string | readonly string[];
  /** agency_name | created_at | commission_rate_bps; '-' = descending (default: pending first) */
  sort?: string;
}

export interface AdminAgentOut extends AgentProfileOut {
  kyc_documents?: DocumentOut[];
  patients_count?: number;
}

export interface AdminAgentUpdateIn {
  commission_rate_bps?: number | null;
  tier?: AgentTier;
}

export interface SpecialtyIn {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  savings_min_pct?: number | null;
  savings_max_pct?: number | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface ProcedureIn {
  specialty_id: Uuid;
  slug: string;
  name: string;
  description?: string | null;
  keywords?: string[];
  body_areas?: string[];
  hospital_stay_days?: number | null;
  recovery_days?: number | null;
  total_stay_days?: number | null;
  india_price_min_minor?: number | null;
  india_price_max_minor?: number | null;
  currency?: CurrencyCode;
  is_active?: boolean;
}

export interface CostBenchmarkIn {
  procedure_id: Uuid;
  country_code: CountryCode;
  currency: CurrencyCode;
  cost_min_minor: number;
  cost_max_minor: number;
  wait_time_text?: string | null;
  source?: string | null;
  source_url?: string | null;
  price_year?: number | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  wait_source?: string | null;
}

export interface CulturalTipIn {
  title: string;
  body: string;
  image_url?: string | null;
  category?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface AccommodationProviderIn {
  name: string;
  type: AccommodationType;
  city: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  star_rating?: number | null;
  amenities?: string[];
  nightly_rate_minor: number;
  currency?: CurrencyCode;
  photos?: string[];
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
  /** [{hospital_id, distance_km}] */
  hospital_links?: { hospital_id: Uuid; distance_km: number | null }[];
}

export interface ServiceProviderIn {
  kind: ServiceKind;
  name: string;
  city?: string | null;
  languages?: string[];
  phone?: string | null;
  email?: string | null;
  rate_minor?: number | null;
  rate_unit?: RateUnit | null;
  currency?: CurrencyCode;
  is_active?: boolean;
}

export interface FxRateIn {
  quote_currency: CurrencyCode;
  rate: DecimalString | number;
  source?: string | null;
  base_currency?: CurrencyCode;
}

export interface PlatformSettingOut {
  key: string;
  value: unknown;
  updated_at: IsoDateTime | null;
  updated_by?: Uuid | null;
  updated_by_name?: string | null;
  /** true when the value is the built-in default */
  is_default?: boolean;
  is_finance?: boolean;
  /** "finance" (finance|super_admin), "website" (super_admin only: System -> Website & contact) or "general" */
  group?: 'finance' | 'website' | 'general';
  /** only a super_admin may change it (website & contact settings) */
  super_admin_only?: boolean;
}

export interface PlatformSettingIn {
  value: unknown;
}

export interface AuditLogOut {
  id: Uuid;
  actor_user_id: Uuid | null;
  actor_name?: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: IsoDateTime;
}

export interface AuditLogListParams extends PageParams {
  actor_user_id?: Uuid;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  from?: IsoDate;
  to?: IsoDate;
  /** action, entity type/id or actor name/email */
  q?: string;
  /** role values or 'system' (repeatable) */
  actor_role?: string | readonly string[];
}

export interface RevenueReportParams {
  from?: IsoDate;
  to?: IsoDate;
  group_by?: ReportGroupBy;
}

export interface RevenueReportRow {
  /** month "YYYY-MM", hospital id or specialty slug */
  key: string;
  label: string;
  bookings: number;
  gmv_minor: number;
  revenue_minor: number;
  commission_minor?: number;
  refunds_minor?: number;
}

export interface RevenueReport {
  group_by: ReportGroupBy;
  currency: CurrencyCode;
  rows: RevenueReportRow[];
  totals?: { bookings: number; gmv_minor: number; revenue_minor: number };
}

export interface CasesReportParams {
  from?: IsoDate;
  to?: IsoDate;
}

export interface CasesReport {
  by_status: Partial<Record<CaseStatus, number>>;
  by_specialty?: { slug: string; name: string; cases: number }[];
  by_hospital?: { id: Uuid; name: string; cases: number }[];
  /** cases converted to bookings / total, 0..1 */
  conversion_rate?: number;
  monthly?: (MonthPoint & { cases: number; booked: number })[];
}

/** GET /admin/dashboard/overview?period= */
export type DashboardPeriod = '7d' | '30d' | '90d' | 'mtd';

export type DashboardAttentionKey =
  | 'unassigned_enquiries'
  | 'quotes_overdue'
  | 'quotes_awaiting_patient'
  | 'emergency_cases'
  | 'open_sos'
  | 'hospitals_pending'
  | 'agents_pending'
  | 'agent_kyc_pending'
  | 'payout_accounts_unverified';

export interface DashboardKpiPair {
  current: number;
  previous: number;
}

export interface DashboardOverview {
  period: DashboardPeriod;
  date_from: IsoDate;
  date_to: IsoDate;
  previous_from: IsoDate;
  previous_to: IsoDate;
  bucket: 'day' | 'week';
  currency: CurrencyCode;
  quote_sla_hours: number;
  kpis: Record<'new_cases' | 'quotes_sent' | 'bookings' | 'gmv_minor' | 'revenue_minor' | 'conversion_rate', DashboardKpiPair>;
  attention: { key: DashboardAttentionKey | (string & {}); count: number; oldest_at: IsoDateTime | null }[];
  series: { date: IsoDate; gmv_minor: number; bookings: number; new_cases: number }[];
  funnel: { stage: CaseStatus; count: number; pct_of_total: number }[];
  by_specialty: { slug: string; name: string; cases: number }[];
  top_hospitals: { id: Uuid; name: string; bookings: number; gmv_minor: number }[];
  upcoming_admissions: {
    booking_id: Uuid;
    booking_number: string;
    case_id: Uuid;
    case_number: string;
    patient_name: string;
    hospital_id: Uuid;
    hospital_name: string;
    admission_date: IsoDate;
    status: BookingStatus;
  }[];
}

export interface ExportParams {
  type: ExportType;
  from?: IsoDate;
  to?: IsoDate;
}

export interface StaffMemberOut {
  id: Uuid;
  full_name: string;
  email: string | null;
  role: UserRole;
  phone?: string | null;
}

// ---------------------------------------------------------------------------------------------------------
// 8.14 system
// ---------------------------------------------------------------------------------------------------------
export interface HealthOut {
  status: 'ok' | 'degraded' | 'error' | (string & {});
  checks?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------------------------------------
// Content reports & moderation (CG-16)
// -----------------------------------------------------------------------------------------------------------
export type ReportTargetType = 'message' | 'screening_result' | 'document_analysis' | 'review';
export type ReportReason = 'spam' | 'abusive' | 'inappropriate' | 'inaccurate' | 'privacy' | 'other';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';
export type ReportAction = 'dismiss' | 'hide_message' | 'warn' | 'suspend';

/** POST /reports */
export interface ReportCreateIn {
  target_type: ReportTargetType;
  target_id: Uuid;
  reason: ReportReason;
  /** max 1000 chars */
  note?: string;
}

export interface ReportOut {
  id: Uuid;
  target_type: ReportTargetType;
  target_id: Uuid;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  created_at: IsoDateTime;
}

export interface ReportUserRef {
  id: Uuid;
  full_name: string;
  role: UserRole;
}

/** GET /admin/reports, GET /admin/reports/{id} */
export interface AdminReportOut extends ReportOut {
  reporter: ReportUserRef | null;
  target_user: (ReportUserRef & { status: UserStatus }) | null;
  /** message text / AI summary excerpt / review text (max 500 chars) */
  excerpt: string | null;
  conversation_id: Uuid | null;
  message_hidden: boolean;
  /** open reports on the same target */
  report_count: number;
  resolved_at: IsoDateTime | null;
  resolved_by: ReportUserRef | null;
  action: ReportAction | null;
  resolution_note: string | null;
}

export interface AdminReportListParams extends PageParams {
  status?: ReportStatus;
  target_type?: ReportTargetType;
}

/** POST /admin/reports/{id}/resolve */
export interface ReportResolveIn {
  action: ReportAction;
  /** max 1000 chars */
  note?: string;
}

// -----------------------------------------------------------------------------------------------------------
// Website enquiries (public contact form -> admin)
// -----------------------------------------------------------------------------------------------------------
export type EnquiryStatus = 'new' | 'in_progress' | 'closed';

export interface EnquiryOut {
  id: Uuid;
  name: string;
  email: string;
  phone: string | null;
  country: string | null;
  topic: string | null;
  message: string;
  status: EnquiryStatus;
  created_at: IsoDateTime;
  handled_by: ReportUserRef | null;
  handled_at: IsoDateTime | null;
}

export interface AdminEnquiryListParams extends PageParams {
  status?: EnquiryStatus;
}

export interface EnquiryUpdateIn {
  status: EnquiryStatus;
}
