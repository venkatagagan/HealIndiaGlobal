/**
 * Phase-1 patient endpoints: quick quote (multi-hospital) and quote SLA, reviews, visa guide, aftercare
 * (follow-up calls + check-ins), the guest free intro call, guardian consent and the guest AI quota.
 * Types live next to the endpoints so this file can be added without touching `types.ts`.
 */
import { api, ApiError, isApiError } from '../client';
import type {
  CaseOut,
  ConsultationMode,
  ConsultationOut,
  ConsultationStatus,
  DoctorDetail,
  HospitalDetail,
  IdSlugName,
  ProcedureOut,
  IsoDate,
  IsoDateTime,
  PatientReviewOut,
  QuoteOut,
  ReviewableBookingOut,
  ReviewCreateIn,
  ReviewUpdateIn,
  Uuid,
} from '../types';
import { seg } from './_util';
import type { GuardianConsentOut } from './privacy';

// ---------------------------------------------------------------------------------------------------------
// Catalogue reads with an explicit display currency (`?currency=` adds `display_*` amounts)
// ---------------------------------------------------------------------------------------------------------
export const catalogDisplayApi = {
  procedure: (slug: string, currency?: string | null) =>
    api.get<ProcedureOut>(`/procedures/${seg(slug)}`, { currency: currency || undefined }),
  hospital: (slugOrId: string, currency?: string | null) =>
    api.get<HospitalDetail>(`/hospitals/${seg(slugOrId)}`, { currency: currency || undefined }),
  doctor: (idOrSlug: string, currency?: string | null) =>
    api.get<DoctorDetail>(`/doctors/${seg(idOrSlug)}`, { currency: currency || undefined }),
};

// ---------------------------------------------------------------------------------------------------------
// Quote SLA + quick quote
// ---------------------------------------------------------------------------------------------------------
/** Quote promise fields of `CaseOut` (GET /cases, /cases/{id}). */
export interface CaseQuoteSla {
  /** when the hospital promised a quote by (case created + QUOTE_SLA_HOURS) */
  quote_due_at?: IsoDateTime | null;
  first_quote_at?: IsoDateTime | null;
  /** no quote yet and `quote_due_at` has passed */
  quote_overdue?: boolean;
  /** hours until `quote_due_at` (0 when overdue); null once a quote was sent */
  hours_left?: number | null;
  /** set when the case was created by a multi-hospital quote request */
  quote_group_id?: Uuid | null;
}

export type CaseWithSla = CaseOut & CaseQuoteSla;

/** POST /cases/quote-request */
export interface QuoteRequestIn {
  hospital_ids: Uuid[];
  procedure_id?: Uuid | null;
  specialty_id?: Uuid | null;
  screening_id?: Uuid | null;
  notes?: string | null;
  /** the patient's own documents shared with every hospital (the screening's reports are shared too) */
  document_ids?: Uuid[];
  /** agents only */
  patient_id?: Uuid | null;
  consent_share: boolean;
}

export interface QuoteGroupCase {
  case_id: Uuid;
  case_number: string;
  status: CaseOut['status'];
  hospital: { id: Uuid; slug: string; name: string; city: string | null };
  doctor: { id: Uuid; full_name: string; specialty_name: string | null } | null;
  quote_due_at: IsoDateTime | null;
  quote_overdue: boolean;
  hours_left: number | null;
  /** latest quote (null while the hospital has not answered) */
  quote: QuoteOut | null;
  /** `quote.total_minor` converted to the group's `currency` */
  total_in_currency_minor: number | null;
}

export interface QuoteGroupOut {
  quote_group_id: Uuid;
  patient: { id: Uuid; full_name: string; nationality: string | null };
  procedure: IdSlugName | null;
  specialty: IdSlugName | null;
  /** currency of `total_in_currency_minor` (the patient's preferred currency, INR as a fallback) */
  currency: string;
  created_at: IsoDateTime;
  cases: QuoteGroupCase[];
  cheapest_case_id: Uuid | null;
}

export const quickQuoteApi = {
  /** one enquiry per hospital (max QUOTE_MAX_HOSPITALS, usually 3), grouped by `quote_group_id` */
  request: (body: QuoteRequestIn) => api.post<QuoteGroupOut>('/cases/quote-request', body),
  group: (groupId: Uuid) => api.get<QuoteGroupOut>(`/cases/quote-groups/${seg(groupId)}`),
};

// ---------------------------------------------------------------------------------------------------------
// Reviews (patient)
// ---------------------------------------------------------------------------------------------------------
export const reviewsApi = {
  create: (body: ReviewCreateIn) => api.post<PatientReviewOut>('/reviews', body),
  mine: () => api.get<PatientReviewOut[]>('/me/reviews'),
  /** completed bookings without a review yet */
  eligible: () => api.get<ReviewableBookingOut[]>('/me/reviews/eligible'),
  /** pending reviews only */
  update: (id: Uuid, body: ReviewUpdateIn) => api.patch<PatientReviewOut>(`/me/reviews/${seg(id)}`, body),
  remove: (id: Uuid) => api.delete(`/me/reviews/${seg(id)}`),
};

// ---------------------------------------------------------------------------------------------------------
// Visa guide
// ---------------------------------------------------------------------------------------------------------
export type VisaRoute = 'e_visa' | 'regular_visa' | 'not_required';
export type VisaTypeAny = 'e_medical' | 'e_medical_attendant' | 'medical' | 'not_required';

export interface VisaChecklistItemOut {
  id: Uuid | null;
  visa_route: VisaRoute;
  nationality: string | null;
  item_key: string;
  title: string;
  description: string | null;
  required: boolean;
  sort_order: number;
}

/** GET /travel/visa-guide?nationality=XX (public) */
export interface VisaGuideOut {
  nationality: string;
  country_name: string | null;
  visa_route: VisaRoute;
  visa_type: VisaTypeAny;
  attendant_visa_type: VisaTypeAny | null;
  max_attendants: number;
  typical_processing_days: number | null;
  notes: string | null;
  official_url: string | null;
  checklist: VisaChecklistItemOut[];
  /** no rule for this nationality: the general embassy route is shown */
  is_default: boolean;
  updated_at: IsoDateTime | null;
}

/** Invitation-letter fields of `VisaRequestOut`. */
export interface VisaLetterFields {
  invitation_letter_document_id?: Uuid | null;
  invitation_letter_draft_document_id?: Uuid | null;
  invitation_letter_generated_at?: IsoDateTime | null;
  invitation_letter_approved_at?: IsoDateTime | null;
}

export const visaGuideApi = {
  guide: (nationality: string) => api.get<VisaGuideOut>('/travel/visa-guide', { nationality }),
};

// ---------------------------------------------------------------------------------------------------------
// Aftercare
// ---------------------------------------------------------------------------------------------------------
export type ConsultationKindAny = 'standard' | 'followup';

export interface FollowupConsultationOut extends ConsultationOut {
  kind?: ConsultationKindAny;
  /** follow-ups: roughly when the call should happen (the hospital confirms the time) */
  due_at?: IsoDateTime | null;
  followup_day?: number | null;
}

export type MedicationAdherence = 'all' | 'some' | 'none';

export interface CheckinOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  day: number;
  due_at: IsoDateTime;
  is_due: boolean;
  submitted_at: IsoDateTime | null;
  answers: {
    pain?: number;
    fever?: boolean;
    wound_concerns?: boolean;
    breathlessness?: boolean;
    medication_adherence?: MedicationAdherence;
    [key: string]: unknown;
  };
  free_text: string | null;
  /** e.g. fever, breathlessness, severe_pain, wound */
  red_flags: string[];
}

export interface CheckinSubmitIn {
  pain: number;
  fever: boolean;
  wound_concerns: boolean;
  breathlessness: boolean;
  medication_adherence: MedicationAdherence;
  free_text?: string | null;
}

export interface AftercareCaseOut {
  case_id: Uuid;
  case_number: string;
  hospital: { id: Uuid; slug: string; name: string; city: string | null };
  doctor: { id: Uuid; full_name: string; specialty_name: string | null } | null;
  discharged_on: IsoDate | null;
  aftercare_until: IsoDate | null;
}

/** GET /me/aftercare */
export interface AftercareOut {
  cases: AftercareCaseOut[];
  followups: FollowupConsultationOut[];
  checkins_due: CheckinOut[];
  upcoming_checkins: CheckinOut[];
}

export interface FollowupRequestIn {
  case_id: Uuid;
  doctor_id?: Uuid | null;
  mode?: ConsultationMode;
  preferred_at?: IsoDateTime | null;
  notes?: string;
}

export const aftercareApi = {
  overview: () => api.get<AftercareOut>('/me/aftercare'),
  checkins: (caseId?: Uuid) => api.get<CheckinOut[]>('/aftercare/checkins', { case_id: caseId }),
  submitCheckin: (id: Uuid, body: CheckinSubmitIn) => api.post<CheckinOut>(`/aftercare/checkins/${seg(id)}`, body),
  /** another video follow-up (allowed on a completed case within the aftercare window) */
  requestFollowup: (body: FollowupRequestIn) =>
    api.post<FollowupConsultationOut>('/consultations', { mode: 'video', ...body, kind: 'followup' }),
};

// ---------------------------------------------------------------------------------------------------------
// Guest: free 15-minute intro call
// ---------------------------------------------------------------------------------------------------------
export type ContactChannel = 'email' | 'phone';

export interface GuestVerifyStartIn {
  channel: ContactChannel;
  contact: string;
}

export interface GuestVerifyStartOut {
  verification_id: Uuid;
  channel: ContactChannel;
  contact_masked: string;
  expires_at: IsoDateTime;
}

export interface GuestVerifyConfirmOut {
  verification_id: Uuid;
  verified: boolean;
  channel: ContactChannel;
  contact_masked: string;
  valid_until: IsoDateTime;
}

export interface IntroRequestIn {
  verification_id: Uuid;
  full_name: string;
  preferred_from?: IsoDateTime | null;
  preferred_to?: IsoDateTime | null;
  /** IANA name, e.g. Africa/Lagos */
  timezone?: string | null;
  question?: string | null;
  screening_id?: Uuid | null;
  document_ids?: Uuid[];
}

export interface IntroConsultationOut {
  id: Uuid;
  status: ConsultationStatus;
  kind: 'free_intro';
  full_name: string;
  contact_channel: ContactChannel;
  contact_masked: string;
  preferred_from: IsoDateTime | null;
  preferred_to: IsoDateTime | null;
  timezone: string | null;
  screening_id: Uuid | null;
  document_ids: Uuid[];
  scheduled_at: IsoDateTime | null;
  duration_min: number;
  meeting_url: string | null;
  coordinator_name: string | null;
  created_at: IsoDateTime;
}

const DEVICE_ID_KEY = 'hig.device_id';
let memoryDeviceId: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A random id for this browser (localStorage; kept in memory when storage is blocked). Sent as `X-Device-Id`. */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    memoryDeviceId ??= randomId();
    return memoryDeviceId;
  }
}

export const guestCallApi = {
  startVerification: (body: GuestVerifyStartIn) => api.post<GuestVerifyStartOut>('/guest/verify/start', body),
  confirmVerification: (body: { verification_id: Uuid; code: string }) =>
    api.post<GuestVerifyConfirmOut>('/guest/verify/confirm', body),
  book: (body: IntroRequestIn) =>
    api.post<IntroConsultationOut>('/guest/consultation', body, { headers: { 'X-Device-Id': getDeviceId() } }),
  /** 404 when no free call was booked yet */
  get: () => api.get<IntroConsultationOut>('/guest/consultation'),
};

// ---------------------------------------------------------------------------------------------------------
// Guardian consent (patients under 18)
// ---------------------------------------------------------------------------------------------------------
export type GuardianRelationship = 'parent' | 'lawful_guardian';
export type GuardianVerificationMethod = 'id_document' | 'digilocker' | 'in_person' | 'video_call';

export interface GuardianConsentIn {
  patient_id?: Uuid | null;
  guardian_name: string;
  relationship: GuardianRelationship;
  guardian_email?: string | null;
  guardian_phone?: string | null;
  guardian_date_of_birth: IsoDate;
  verification_method: GuardianVerificationMethod;
  verification_reference?: string | null;
  /** the guardian confirms they are the parent/lawful guardian, an adult, and consent */
  declaration: boolean;
}

export const guardianConsentApi = {
  record: (body: GuardianConsentIn) => api.post<GuardianConsentOut>('/privacy/guardian-consent', body),
  revoke: () => api.delete<void>('/privacy/guardian-consent'),
};

// ---------------------------------------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------------------------------------
function detailsOf(error: ApiError): Record<string, unknown> {
  return error.details && typeof error.details === 'object' && !Array.isArray(error.details)
    ? (error.details as Record<string, unknown>)
    : {};
}

/** 429 with `details.scope = "guest_ai_daily"`: a guest used the free AI scans for today. */
export function isGuestAiLimitError(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 429 && detailsOf(error).scope === 'guest_ai_daily';
}

/** Daily free scan limit from a `guest_ai_daily` error (defaults to 3). */
export function guestAiLimit(error: unknown): number {
  if (!isApiError(error)) return 3;
  const limit = detailsOf(error).limit;
  return typeof limit === 'number' && limit > 0 ? limit : 3;
}

/** 403 `guardian_consent_required`: a patient under 18 needs a verified guardian consent first. */
export function isGuardianConsentRequiredError(error: unknown): error is ApiError {
  return isApiError(error) && error.code === 'guardian_consent_required';
}

/** `details.attempts_left` of an `invalid_code` error (null when absent). */
export function attemptsLeft(error: unknown): number | null {
  if (!isApiError(error)) return null;
  const left = detailsOf(error).attempts_left;
  return typeof left === 'number' ? left : null;
}
