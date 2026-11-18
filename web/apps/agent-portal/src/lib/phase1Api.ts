/**
 * Agent-portal calls for the phase-1 endpoints that @hig/shared does not wrap yet (multi-hospital quote requests,
 * quote groups, aftercare) and the `?currency=` variants of the detail reads. Shapes follow
 * backend/app/modules/cases/schemas.py (QuoteRequestCreate, QuoteGroupOut) and cases/aftercare.py.
 */
import {
  api,
  type CaseDetail,
  type CaseOut,
  type ConsultationOut,
  type DoctorDetail,
  type HospitalDetail,
  type QuoteOut,
  type Uuid,
} from '@hig/shared/api';

const seg = (value: string) => encodeURIComponent(value);

/** Quote-deadline fields of a case (`GET /cases`, `GET /cases/{id}`). */
export interface CaseQuoteDeadline {
  quote_due_at?: string | null;
  first_quote_at?: string | null;
  /** no quote yet and `quote_due_at` passed */
  quote_overdue?: boolean;
  /** hours until `quote_due_at` (0 when overdue); null once quoted */
  hours_left?: number | null;
  quote_group_id?: Uuid | null;
}

export type CaseWithDeadline = CaseOut & CaseQuoteDeadline;

/** POST /cases/quote-request */
export interface QuoteRequestIn {
  hospital_ids: Uuid[];
  procedure_id?: Uuid;
  specialty_id?: Uuid;
  screening_id?: Uuid;
  notes?: string;
  document_ids?: Uuid[];
  /** agents: the managed patient */
  patient_id?: Uuid;
  /** records `share_with_hospitals` consent */
  consent_share: boolean;
}

export interface QuoteGroupCase {
  case_id: Uuid;
  case_number: string;
  status: CaseOut['status'];
  hospital: { id: Uuid; slug: string; name: string; city: string | null };
  doctor: { id: Uuid; full_name: string; specialty_name: string | null } | null;
  quote_due_at: string | null;
  quote_overdue: boolean;
  hours_left: number | null;
  /** latest sent quote (null while the hospital has not answered) */
  quote: QuoteOut | null;
  /** `quote.total_minor` in the group's `currency` */
  total_in_currency_minor: number | null;
}

/** POST /cases/quote-request, GET /cases/quote-groups/{id} */
export interface QuoteGroupOut {
  quote_group_id: Uuid;
  patient: { id: Uuid; full_name: string; nationality: string | null };
  procedure: { id: Uuid; slug: string; name: string } | null;
  specialty: { id: Uuid; slug: string; name: string } | null;
  /** currency of `total_in_currency_minor` (the patient's preferred currency, INR as a fallback) */
  currency: string;
  created_at: string;
  cases: QuoteGroupCase[];
  cheapest_case_id: Uuid | null;
}

export interface CheckinOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  day: number;
  due_at: string;
  is_due: boolean;
  submitted_at: string | null;
  answers: Record<string, unknown>;
  free_text: string | null;
  red_flags: string[];
}

export interface AftercareCase {
  case_id: Uuid;
  case_number: string;
  hospital: { id: Uuid; slug: string; name: string; city: string | null };
  doctor: { id: Uuid; full_name: string; specialty_name: string | null } | null;
  discharged_on: string | null;
  aftercare_until: string | null;
}

export type FollowupOut = ConsultationOut & {
  kind?: 'standard' | 'followup';
  due_at?: string | null;
  followup_day?: number | null;
};

/** GET /me/aftercare (agents: their patients' treated cases) */
export interface AftercareOut {
  cases: AftercareCase[];
  followups: FollowupOut[];
  checkins_due: CheckinOut[];
  upcoming_checkins: CheckinOut[];
}

export type MedicationAdherence = 'all' | 'some' | 'none';

/** POST /aftercare/checkins/{id} */
export interface CheckinSubmitIn {
  pain: number;
  fever: boolean;
  wound_concerns: boolean;
  breathlessness: boolean;
  medication_adherence: MedicationAdherence;
  free_text?: string;
}

export const phase1Api = {
  quoteRequest: (body: QuoteRequestIn) => api.post<QuoteGroupOut>('/cases/quote-request', body),
  quoteGroup: (id: Uuid) => api.get<QuoteGroupOut>(`/cases/quote-groups/${seg(id)}`),
  getCase: (id: Uuid, currency?: string) =>
    api.get<CaseDetail & CaseQuoteDeadline>(`/cases/${seg(id)}`, currency ? { currency } : undefined),
  getHospital: (slugOrId: string, currency?: string) =>
    api.get<HospitalDetail>(`/hospitals/${seg(slugOrId)}`, currency ? { currency } : undefined),
  getDoctor: (id: Uuid, currency?: string) =>
    api.get<DoctorDetail>(`/doctors/${seg(id)}`, currency ? { currency } : undefined),
  aftercare: () => api.get<AftercareOut>('/me/aftercare'),
  caseCheckins: (caseId: Uuid) => api.get<CheckinOut[]>('/aftercare/checkins', { case_id: caseId }),
  submitCheckin: (id: Uuid, body: CheckinSubmitIn) => api.post<CheckinOut>(`/aftercare/checkins/${seg(id)}`, body),
};
