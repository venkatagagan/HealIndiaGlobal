/**
 * Discharge summaries (backend `modules/discharge`): hospital drafts / versions / finalize, patient view,
 * PDF + HL7 FHIR R4 downloads, home-doctor share links and medication reminders, plus the public (no login)
 * share view. Types live next to the endpoints so this file can be added without touching `types.ts`.
 */
import { api, saveBlob } from '../client';
import type { IsoDate, IsoDateTime, Uuid } from '../types';
import { seg } from './_util';

export type DischargeSummaryStatus = 'draft' | 'final';
export const DISCHARGE_SUMMARY_STATUSES = ['draft', 'final'] as const satisfies readonly DischargeSummaryStatus[];

/** Languages a home-doctor share email / page can use. */
export const DISCHARGE_SHARE_LANGUAGES = ['en', 'ar', 'fr', 'bn', 'ru'] as const;
export type DischargeShareLanguage = (typeof DISCHARGE_SHARE_LANGUAGES)[number];

/** Fields the server requires before a summary can be finalized (`discharge_incomplete` details). */
export const DISCHARGE_REQUIRED_FIELDS = ['diagnosis', 'discharge_date', 'doctor_name', 'follow_up_instructions'] as const;

export interface DischargeMedication {
  name: string;
  dose?: string | null;
  frequency?: string | null;
  /** empty = ongoing */
  duration_days?: number | null;
  /** e.g. oral, topical */
  route?: string | null;
  instructions?: string | null;
}

export interface DischargeAttachment {
  id: Uuid;
  file_name: string;
  content_type: string;
  size_bytes: number;
  kind: string;
}

/** Editable fields (all optional on a draft). */
export interface DischargeSummaryFields {
  doctor_id?: Uuid | null;
  doctor_name?: string | null;
  doctor_registration?: string | null;
  admission_date?: IsoDate | null;
  discharge_date?: IsoDate | null;
  diagnosis?: string | null;
  /** ICD-10 style code: letters, digits, "." and "-" */
  diagnosis_code?: string | null;
  procedure_name?: string | null;
  procedure_code?: string | null;
  procedure_date?: IsoDate | null;
  hospital_course?: string | null;
  medications?: DischargeMedication[] | null;
  follow_up_instructions?: string | null;
  red_flag_symptoms?: string | null;
  allergies?: string | null;
  investigations_summary?: string | null;
  attachment_document_ids?: Uuid[] | null;
}

export interface DischargeSummaryCreateIn extends DischargeSummaryFields {
  case_id: Uuid;
  booking_id?: Uuid | null;
}

export interface DischargeSummaryOut {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  booking_id: Uuid | null;
  booking_number: string | null;
  patient_id: Uuid;
  patient_name: string | null;
  hospital_id: Uuid;
  hospital_name: string | null;
  doctor_id: Uuid | null;
  doctor_name: string | null;
  doctor_registration: string | null;
  version: number;
  supersedes_id: Uuid | null;
  status: DischargeSummaryStatus;
  is_latest: boolean;
  admission_date: IsoDate | null;
  discharge_date: IsoDate | null;
  diagnosis: string | null;
  diagnosis_code: string | null;
  procedure_name: string | null;
  procedure_code: string | null;
  procedure_date: IsoDate | null;
  hospital_course: string | null;
  medications: DischargeMedication[];
  follow_up_instructions: string | null;
  red_flag_symptoms: string | null;
  allergies: string | null;
  investigations_summary: string | null;
  attachments: DischargeAttachment[];
  pdf_document_id: Uuid | null;
  finalized_at: IsoDateTime | null;
  finalized_by_user_id: Uuid | null;
  superseded_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface DischargeSummaryListItem {
  id: Uuid;
  case_id: Uuid;
  case_number: string | null;
  booking_id: Uuid | null;
  patient_name: string | null;
  hospital_name: string | null;
  version: number;
  status: DischargeSummaryStatus;
  is_latest: boolean;
  discharge_date: IsoDate | null;
  pdf_document_id: Uuid | null;
  finalized_at: IsoDateTime | null;
  updated_at: IsoDateTime;
}

export interface DischargeSummaryListParams {
  case_id?: Uuid;
  booking_id?: Uuid;
  status?: DischargeSummaryStatus;
  limit?: number;
}

/** GET /discharge-summaries/prefill: values to start a draft (nothing is saved). */
export interface DischargePrefillOut {
  case_id: Uuid;
  booking_id: Uuid | null;
  doctor_id: Uuid | null;
  doctor_name: string | null;
  doctor_registration: string | null;
  admission_date: IsoDate | null;
  discharge_date: IsoDate | null;
  procedure_name: string | null;
  procedure_date: IsoDate | null;
  allergies: string | null;
  diagnosis: string | null;
  hospital_course: string | null;
  available_documents: DischargeAttachment[];
}

export interface DischargeShareIn {
  doctor_email: string;
  doctor_name?: string | null;
  document_ids: Uuid[];
  /** 1-30 days (server default 14) */
  expires_in_days?: number | null;
  language?: DischargeShareLanguage | null;
  /** the patient agrees to share the summary with this doctor */
  consent: boolean;
}

export interface DischargeShareOut {
  id: Uuid;
  discharge_summary_id: Uuid;
  doctor_email_masked: string;
  doctor_name: string | null;
  document_ids: Uuid[];
  language: string;
  expires_at: IsoDateTime;
  revoked_at: IsoDateTime | null;
  view_count: number;
  last_viewed_at: IsoDateTime | null;
  created_at: IsoDateTime;
  active: boolean;
}

/** POST response: `url` is returned ONCE (only a hash of the token is stored). */
export interface DischargeShareCreatedOut extends DischargeShareOut {
  url: string;
}

export interface MedicationReminderOut {
  id: Uuid;
  discharge_summary_id: Uuid;
  name: string;
  dose: string | null;
  frequency: string | null;
  start_on: IsoDate;
  end_on: IsoDate | null;
  enabled: boolean;
  /** local hour 0-23 */
  remind_hour: number;
  timezone: string;
  last_sent_on: IsoDate | null;
}

export interface MedicationRemindersIn {
  enabled: boolean;
  remind_hour: number;
  /** IANA zone ("Africa/Lagos") or "UTC" */
  timezone: string;
}

/** What the home doctor sees at /share/{token} (read-only, no login). */
export interface PublicDischargeShareOut {
  patient_name: string;
  patient_date_of_birth: IsoDate | null;
  patient_sex: string | null;
  hospital_name: string;
  hospital_address: string | null;
  hospital_phone: string | null;
  hospital_email: string | null;
  summary: DischargeSummaryOut;
  documents: DischargeAttachment[];
  expires_at: IsoDateTime;
  shared_by_name: string | null;
}

const P = '/discharge-summaries';
const one = (id: Uuid) => `${P}/${seg(id)}`;
const PUBLIC = (token: string) => `/public/discharge-shares/${seg(token)}`;

/** The browser's IANA time zone (falls back to "UTC"). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function downloadPublic(path: string, fallbackName: string): Promise<void> {
  const out = await api.download(path, null, { skipAuth: true, skipRefresh: true });
  saveBlob(out.blob, out.filename ?? fallbackName);
}

export const dischargeApi = {
  list: (params?: DischargeSummaryListParams) => api.get<DischargeSummaryListItem[]>(P, params),
  prefill: (caseId: Uuid, bookingId?: Uuid | null) =>
    api.get<DischargePrefillOut>(`${P}/prefill`, { case_id: caseId, booking_id: bookingId || undefined }),
  create: (body: DischargeSummaryCreateIn) => api.post<DischargeSummaryOut>(P, body),
  get: (id: Uuid) => api.get<DischargeSummaryOut>(one(id)),
  update: (id: Uuid, body: DischargeSummaryFields) => api.patch<DischargeSummaryOut>(one(id), body),
  /** discard a draft */
  discard: (id: Uuid) => api.delete(one(id)),
  finalize: (id: Uuid) => api.post<DischargeSummaryOut>(`${one(id)}/finalize`),
  /** a new draft copy of a final summary (the final one stays unchanged) */
  newVersion: (id: Uuid) => api.post<DischargeSummaryOut>(`${one(id)}/new-version`),
  /** authorized PDF download (blob, e.g. for an inline preview) */
  pdf: (id: Uuid) => api.download(`${one(id)}/pdf`),
  downloadPdf: (id: Uuid, version = 1) => api.downloadAndSave(`${one(id)}/pdf`, `discharge-summary-v${version}.pdf`),
  downloadFhir: (id: Uuid, version = 1) =>
    api.downloadAndSave(`${one(id)}/fhir`, `discharge-summary-v${version}.fhir.json`),

  shares: (id: Uuid) => api.get<DischargeShareOut[]>(`${one(id)}/shares`),
  createShare: (id: Uuid, body: DischargeShareIn) => api.post<DischargeShareCreatedOut>(`${one(id)}/shares`, body),
  revokeShare: (id: Uuid, shareId: Uuid) => api.delete<DischargeShareOut>(`${one(id)}/shares/${seg(shareId)}`),

  reminders: (id: Uuid) => api.get<MedicationReminderOut[]>(`${one(id)}/medication-reminders`),
  setReminders: (id: Uuid, body: MedicationRemindersIn) =>
    api.put<MedicationReminderOut[]>(`${one(id)}/medication-reminders`, body),
};

/** Public share (no login): never sends the session token. */
export const publicDischargeApi = {
  get: (token: string) =>
    api.get<PublicDischargeShareOut>(PUBLIC(token), null, { skipAuth: true, skipRefresh: true }),
  downloadPdf: (token: string) => downloadPublic(`${PUBLIC(token)}/pdf`, 'discharge-summary.pdf'),
  downloadFhir: (token: string) => downloadPublic(`${PUBLIC(token)}/fhir`, 'discharge-summary.fhir.json'),
  downloadDocument: (token: string, doc: Pick<DischargeAttachment, 'id' | 'file_name'>) =>
    downloadPublic(`${PUBLIC(token)}/documents/${seg(doc.id)}`, doc.file_name),
};

/** `details` of a `discharge_incomplete` error: the missing field names. */
export function dischargeMissingFields(details: unknown): string[] {
  return Array.isArray(details) ? details.filter((d): d is string => typeof d === 'string') : [];
}

/** `details.discharge_summary_id` of a `discharge_draft_exists` error. */
export function existingDraftId(details: unknown): Uuid | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const id = (details as Record<string, unknown>).discharge_summary_id;
  return typeof id === 'string' && id ? id : null;
}
