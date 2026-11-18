/**
 * Privacy compliance tools for admins (DPDP Act / GDPR): legal holds, the personal-data breach register and the
 * per-patient PHI access log. Shapes follow backend/app/modules/privacy/schemas.py (LegalHoldIn/Out, BreachIn,
 * BreachUpdate, BreachOut, AccessLogEntry); every route is `admin | super_admin` only (`PrivacyAdmin`).
 *
 * Break-glass document reads (support staff, documents outside their cases) send `X-Break-Glass-Reason`;
 * see `breakGlassDocumentsApi` below and components/DocumentList.tsx.
 */
import { api, ApiError, type AccessLogEntry, type DocumentOut } from '@hig/shared/api';

const seg = (value: string): string => encodeURIComponent(value);

// --------------------------------------------------------------------------------------------- legal holds
export type LegalHoldEntity = 'user' | 'case';

export interface LegalHoldOut {
  entity_type: LegalHoldEntity;
  entity_id: string;
  label: string;
  legal_hold: boolean;
  reason: string | null;
  set_at: string | null;
  set_by: string | null;
}

export interface LegalHoldIn {
  legal_hold: boolean;
  /** required (5+ characters) when placing a hold */
  reason?: string | null;
}

/** Minimum reason length the API accepts when placing a hold. */
export const LEGAL_HOLD_MIN_REASON = 5;

// ------------------------------------------------------------------------------------------ breach register
export const BREACH_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type BreachSeverity = (typeof BREACH_SEVERITIES)[number];
export const BREACH_STATUSES = ['open', 'contained', 'notified', 'closed'] as const;
export type BreachStatus = (typeof BREACH_STATUSES)[number];

export interface BreachIn {
  title: string;
  description: string;
  severity: BreachSeverity;
  detected_at?: string | null;
  occurred_at?: string | null;
  data_categories?: string[];
  affected_subjects_estimate?: number | null;
  likely_consequences?: string | null;
  measures_taken?: string | null;
  notes?: string | null;
}

export interface BreachUpdate {
  status?: BreachStatus | null;
  severity?: BreachSeverity | null;
  contained_at?: string | null;
  data_categories?: string[] | null;
  affected_subjects_estimate?: number | null;
  likely_consequences?: string | null;
  measures_taken?: string | null;
  dpb_notified_at?: string | null;
  supervisory_authority_notified_at?: string | null;
  subjects_notified_at?: string | null;
  notes?: string | null;
}

export interface BreachOut {
  id: string;
  reference: string;
  title: string;
  description: string;
  severity: BreachSeverity;
  status: BreachStatus;
  occurred_at: string | null;
  detected_at: string;
  /** detected_at + 72 h */
  notification_deadline_at: string;
  contained_at: string | null;
  data_categories: string[];
  affected_subjects_estimate: number | null;
  likely_consequences: string | null;
  measures_taken: string | null;
  dpb_notified_at: string | null;
  supervisory_authority_notified_at: string | null;
  subjects_notified_at: string | null;
  reported_by_user_id: string | null;
  notes: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  /** deadline passed and the Data Protection Board / supervisory authority were not both notified */
  notification_overdue: boolean;
}

/** Field limits of BreachIn (backend validation). */
export const BREACH_LIMITS = { titleMin: 5, titleMax: 200, descriptionMin: 10, descriptionMax: 10_000, text: 5000, categories: 20 } as const;

export const privacyToolsApi = {
  legalHolds: () => api.get<LegalHoldOut[]>('/admin/privacy/legal-holds'),
  setLegalHold: (entity: LegalHoldEntity, id: string, body: LegalHoldIn) =>
    api.put<LegalHoldOut>(`/admin/privacy/legal-holds/${entity === 'user' ? 'users' : 'cases'}/${seg(id)}`, body),
  breaches: (status?: BreachStatus) => api.get<BreachOut[]>('/admin/privacy/breaches', status ? { status } : undefined),
  recordBreach: (body: BreachIn) => api.post<BreachOut>('/admin/privacy/breaches', body),
  updateBreach: (id: string, body: BreachUpdate) => api.patch<BreachOut>(`/admin/privacy/breaches/${seg(id)}`, body),
  /** `patient_id` = patient profile id (UserOut.patient_profile_id) */
  accessLog: (patientId: string) => api.get<AccessLogEntry[]>('/admin/privacy/access-log', { patient_id: patientId }),
};

export const privacyToolsKeys = {
  holds: ['admin', 'privacy', 'legal-holds'] as const,
  breaches: ['admin', 'privacy', 'breaches'] as const,
  accessLog: (patientId: string) => ['admin', 'privacy', 'access-log', patientId] as const,
};

// --------------------------------------------------------------------------------------- break-glass reads
/** Minimum reason length for a break-glass read (documents/service.py BREAK_GLASS_MIN_REASON). */
export const BREAK_GLASS_MIN_REASON = 10;
export const BREAK_GLASS_MAX_REASON = 500;

const breakGlassHeaders = (reason: string | null | undefined) =>
  reason ? { 'X-Break-Glass-Reason': reason } : undefined;

export const breakGlassDocumentsApi = {
  /** authorized binary download; with `reason` the read is a break-glass read (support only, audited) */
  download: (id: string, reason?: string | null) =>
    api.download(`/documents/${seg(id)}/download`, null, { headers: breakGlassHeaders(reason) }),
  get: (id: string, reason?: string | null) =>
    api.get<DocumentOut>(`/documents/${seg(id)}`, null, { headers: breakGlassHeaders(reason) }),
};

/**
 * True when a support user's document read failed because the document is outside their cases: the API then
 * answers 404 (it never confirms that the document exists) and a break-glass read with a reason may work.
 */
export function isBreakGlassCandidate(error: unknown, role: string | null | undefined): boolean {
  return role === 'support' && error instanceof ApiError && error.status === 404;
}
