/**
 * Admin endpoints added in phase 1 (security dual control, reviews, accreditations, visa rules, free intro
 * calls) that the shared `adminApi` does not wrap yet. Shapes follow the backend schemas:
 * admin/schemas.py (FxRateOut, PlatformSettingOut, AdminHospitalDetail), trust/schemas.py, travel/visa.py,
 * guests/service.py.
 */
import {
  api,
  type AdminHospitalDetail,
  type FxRateOut,
  type Page,
  type PlatformSettingOut,
} from '@hig/shared/api';

const seg = (value: string): string => encodeURIComponent(value);

// ------------------------------------------------------------------------------------------- FX dual control
/** SEC-008: a change of more than 10% waits for a second finance user. */
export interface FxRateWithPending extends FxRateOut {
  updated_at?: string | null;
  pending_rate?: string | null;
  pending_requested_by?: string | null;
  pending_requested_at?: string | null;
}

// ---------------------------------------------------------------------------------------- setting dual control
/** SEC-011: `bank_transfer_details` changes wait for a second finance user. */
export interface PendingSettingChange {
  id: string;
  value: unknown;
  requested_by: string;
  requested_by_name?: string | null;
  requested_at: string;
}

export interface SettingWithPending extends PlatformSettingOut {
  pending_change?: PendingSettingChange | null;
}

// --------------------------------------------------------------------------------------- hospital profile review
export interface AdminHospitalWithPending extends AdminHospitalDetail {
  /** SEC-020: identity / accreditation changes waiting for review (PAN masked) */
  pending_profile_values?: Record<string, unknown>;
}

// -------------------------------------------------------------------------------------------------- reviews
export type ReviewStatus = 'pending' | 'published' | 'hidden';
export const REVIEW_STATUSES = ['pending', 'published', 'hidden'] as const satisfies readonly ReviewStatus[];

export interface AdminReviewOut {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  patient_name: string | null;
  created_at: string;
  hospital_id: string;
  doctor_id: string | null;
  case_id: string | null;
  status: ReviewStatus;
  verified_patient: boolean;
  treatment_name: string | null;
  doctor_name: string | null;
  hospital_name: string | null;
  published_at: string | null;
  booking_id: string | null;
  booking_number: string | null;
  patient_id: string;
  moderation_reason: string | null;
  moderated_at: string | null;
  moderated_by_user_id: string | null;
  updated_at: string | null;
}

export interface AdminReviewListParams {
  page?: number;
  page_size?: number;
  status?: ReviewStatus;
  hospital_id?: string;
  doctor_id?: string;
}

// ------------------------------------------------------------------------------------------- accreditations
export interface AccreditationOut {
  id: string;
  hospital_id: string;
  /** body code: jci, nabh, nabl ... */
  body: string;
  certificate_number: string | null;
  valid_until: string | null;
  document_id: string | null;
  verified: boolean;
  verified_at: string | null;
  verified_by_admin_id: string | null;
  /** verified and not expired: shown publicly */
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccreditationIn {
  body: string;
  certificate_number?: string | null;
  valid_until?: string | null;
  document_id?: string | null;
}

// ---------------------------------------------------------------------------------------------------- visa
export type VisaRoute = 'e_visa' | 'regular_visa' | 'not_required';
export const VISA_ROUTES = ['e_visa', 'regular_visa', 'not_required'] as const satisfies readonly VisaRoute[];

export interface VisaCountryRuleOut {
  id: string;
  nationality: string;
  country_name: string | null;
  visa_route: VisaRoute;
  max_attendants: number;
  typical_processing_days: number | null;
  notes: string | null;
  official_url: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisaCountryRuleIn {
  nationality: string;
  country_name?: string | null;
  visa_route: VisaRoute;
  max_attendants?: number;
  typical_processing_days?: number | null;
  notes?: string | null;
  official_url?: string | null;
  source?: string | null;
}

export interface VisaChecklistItemOut {
  id: string;
  visa_route: VisaRoute;
  nationality: string | null;
  item_key: string;
  title: string;
  description: string | null;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VisaChecklistItemIn {
  visa_route: VisaRoute;
  nationality?: string | null;
  item_key: string;
  title: string;
  description?: string | null;
  required?: boolean;
  sort_order?: number;
}

export interface LoadDefaultsOut {
  rules_added: number;
  checklist_items_added: number;
}

// --------------------------------------------------------------------------------------- free intro calls
export type IntroStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled';
export const INTRO_STATUSES = ['requested', 'scheduled', 'completed', 'cancelled'] as const satisfies readonly IntroStatus[];

export interface IntroConsultationAdminOut {
  id: string;
  status: IntroStatus;
  kind: 'free_intro';
  full_name: string;
  contact_channel: 'email' | 'phone';
  contact_masked: string;
  contact: string;
  preferred_from: string | null;
  preferred_to: string | null;
  timezone: string | null;
  screening_id: string | null;
  document_ids: string[];
  scheduled_at: string | null;
  duration_min: number;
  meeting_url: string | null;
  coordinator_name: string | null;
  coordinator_user_id: string | null;
  coordinator_notes: string | null;
  user_id: string | null;
  patient_id: string | null;
  is_guest: boolean | null;
  question: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntroConsultationUpdate {
  status?: IntroStatus;
  scheduled_at?: string | null;
  meeting_url?: string | null;
  coordinator_user_id?: string | null;
  coordinator_notes?: string | null;
}

// ------------------------------------------------------------------------------------------------ endpoints
export const phase1AdminApi = {
  // FX (finance | super_admin); approve binds to the reviewed pending rate (409 request_changed)
  approveFxRate: (id: string, rate: string) => api.post<FxRateWithPending>(`/admin/fx-rates/${seg(id)}/approve`, { rate }),
  rejectFxRate: (id: string) => api.post<FxRateWithPending>(`/admin/fx-rates/${seg(id)}/reject`, {}),

  // dual-control settings (finance | super_admin)
  approveSettingChange: (key: string, requestId: string) =>
    api.post<SettingWithPending>(`/admin/settings/${seg(key)}/approve`, { request_id: requestId }),
  rejectSettingChange: (key: string, reason?: string | null) =>
    api.post<SettingWithPending>(`/admin/settings/${seg(key)}/reject`, reason ? { reason } : {}),

  // hospital profile changes (admin | super_admin)
  approveProfileChanges: (hospitalId: string) =>
    api.post<AdminHospitalWithPending>(`/admin/hospitals/${seg(hospitalId)}/profile-changes/approve`, {}),
  rejectProfileChanges: (hospitalId: string) =>
    api.post<AdminHospitalWithPending>(`/admin/hospitals/${seg(hospitalId)}/profile-changes/reject`, {}),

  // reviews (list: staff; moderate: admin | super_admin)
  listReviews: (params?: AdminReviewListParams) => api.get<Page<AdminReviewOut>>('/admin/reviews', params),
  moderateReview: (id: string, body: { status: 'published' | 'hidden'; reason?: string | null }) =>
    api.patch<AdminReviewOut>(`/admin/reviews/${seg(id)}`, body),

  // accreditations (list: staff; writes: admin | super_admin)
  listAccreditations: (hospitalId: string) =>
    api.get<AccreditationOut[]>(`/admin/hospitals/${seg(hospitalId)}/accreditations`),
  createAccreditation: (hospitalId: string, body: AccreditationIn) =>
    api.post<AccreditationOut>(`/admin/hospitals/${seg(hospitalId)}/accreditations`, body),
  updateAccreditation: (id: string, body: Partial<AccreditationIn>) =>
    api.patch<AccreditationOut>(`/admin/accreditations/${seg(id)}`, body),
  deleteAccreditation: (id: string) => api.delete(`/admin/accreditations/${seg(id)}`),
  verifyAccreditation: (id: string, verify: boolean) =>
    api.post<AccreditationOut>(`/admin/accreditations/${seg(id)}/${verify ? 'verify' : 'unverify'}`, {}),

  // visa rules & checklist (list: staff; writes: admin | super_admin)
  listVisaRules: (params?: { route?: VisaRoute; q?: string }) => api.get<VisaCountryRuleOut[]>('/admin/visa/rules', params),
  createVisaRule: (body: VisaCountryRuleIn) => api.post<VisaCountryRuleOut>('/admin/visa/rules', body),
  updateVisaRule: (nationality: string, body: Partial<VisaCountryRuleIn>) =>
    api.patch<VisaCountryRuleOut>(`/admin/visa/rules/${seg(nationality)}`, body),
  deleteVisaRule: (nationality: string) => api.delete(`/admin/visa/rules/${seg(nationality)}`),
  listChecklistItems: (params?: { route?: VisaRoute; nationality?: string }) =>
    api.get<VisaChecklistItemOut[]>('/admin/visa/checklist-items', params),
  createChecklistItem: (body: VisaChecklistItemIn) => api.post<VisaChecklistItemOut>('/admin/visa/checklist-items', body),
  updateChecklistItem: (id: string, body: Partial<VisaChecklistItemIn>) =>
    api.patch<VisaChecklistItemOut>(`/admin/visa/checklist-items/${seg(id)}`, body),
  deleteChecklistItem: (id: string) => api.delete(`/admin/visa/checklist-items/${seg(id)}`),
  loadVisaDefaults: () => api.post<LoadDefaultsOut>('/admin/visa/load-defaults', {}),

  // free intro calls (support | admin | super_admin)
  listIntroConsultations: (params?: { page?: number; page_size?: number; status?: IntroStatus; mine?: boolean }) =>
    api.get<Page<IntroConsultationAdminOut>>('/admin/intro-consultations', params),
  updateIntroConsultation: (id: string, body: IntroConsultationUpdate) =>
    api.patch<IntroConsultationAdminOut>(`/admin/intro-consultations/${seg(id)}`, body),
};

/** Query keys of the phase-1 admin pages (prefix-invalidated after writes). */
export const phase1Keys = {
  reviews: ['admin', 'reviews'] as const,
  accreditations: ['admin', 'accreditations'] as const,
  visaRules: ['admin', 'visa', 'rules'] as const,
  visaChecklist: ['admin', 'visa', 'checklist'] as const,
  intro: ['admin', 'intro-consultations'] as const,
};
