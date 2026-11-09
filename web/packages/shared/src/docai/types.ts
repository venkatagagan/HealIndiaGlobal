/**
 * Document intelligence (PLAN 7.1) - types shared by the docai endpoints and components.
 * AI output is a DRAFT: only `confirmed_data` (review_status `confirmed`) may be used for screening or shown to hospitals.
 */
import type { DocumentKind, IsoDate, IsoDateTime, Uuid } from '../api/types';

export const ANALYSIS_STATUSES = ['queued', 'processing', 'completed', 'failed', 'unsupported'] as const;
export type DocumentAnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_REVIEW_STATUSES = ['pending_review', 'confirmed', 'rejected'] as const;
export type AnalysisReviewStatus = (typeof ANALYSIS_REVIEW_STATUSES)[number];

export const ANALYSIS_DOC_TYPES = [
  'lab_report',
  'imaging_report',
  'discharge_summary',
  'prescription',
  'consultation_note',
  'pathology_report',
  'insurance_document',
  'other',
] as const;
export type AnalysisDocType = (typeof ANALYSIS_DOC_TYPES)[number];

export const FINDING_SIGNIFICANCES = ['normal', 'attention', 'urgent'] as const;
export type FindingSignificance = (typeof FINDING_SIGNIFICANCES)[number];

export const LAB_FLAGS = ['low', 'high', 'normal', 'critical', 'unknown'] as const;
export type LabFlag = (typeof LAB_FLAGS)[number];

/** Document kinds a report can be uploaded as (subset of DocumentKind). */
export const REPORT_DOCUMENT_KINDS = ['medical_report', 'lab_result', 'imaging', 'prescription'] as const;
export type ReportDocumentKind = (typeof REPORT_DOCUMENT_KINDS)[number] & DocumentKind;

export interface KeyFinding {
  finding: string;
  significance: FindingSignificance;
}

export interface LabValue {
  test: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  flag: LabFlag;
}

export interface Medication {
  name: string;
  dose: string | null;
  frequency: string | null;
}

export interface AnalysisQuality {
  legible?: boolean;
  issues?: string[];
  pages_analyzed?: number;
}

/** The patient-reviewable part of an extraction (PLAN 7.1 `confirmed_data`). */
export interface AnalysisEditableData {
  doc_type: AnalysisDocType | null;
  report_date: IsoDate | null;
  facility_name: string | null;
  summary_patient: string | null;
  key_findings: KeyFinding[];
  lab_values: LabValue[];
  diagnoses_mentioned: string[];
  medications: Medication[];
  procedures_mentioned: string[];
  recommendations: string[];
}

/** What the AI returned (immutable copy); a superset of the editable data. */
export interface AnalysisAiOutput extends Partial<AnalysisEditableData> {
  language?: string | null;
  summary_clinical?: string | null;
  red_flags?: string[];
  quality?: AnalysisQuality;
  suggested_specialties?: string[];
  confidence?: number | null;
  [key: string]: unknown;
}

export interface DocumentAnalysisOut {
  id: Uuid;
  document_ids: Uuid[];
  primary_document_id: Uuid;
  patient_id: Uuid;
  case_id: Uuid | null;
  requested_by_user_id?: Uuid | null;
  summary_language?: string | null;
  status: DocumentAnalysisStatus;
  engine?: string | null;
  model?: string | null;
  error: string | null;
  completed_at: IsoDateTime | null;
  // working draft (equals the confirmed version once confirmed). Hospitals may receive only confirmed_data.
  doc_type?: AnalysisDocType | null;
  language?: string | null;
  report_date?: IsoDate | null;
  facility_name?: string | null;
  summary_patient?: string | null;
  summary_clinical?: string | null;
  key_findings?: KeyFinding[];
  lab_values?: LabValue[];
  diagnoses_mentioned?: string[];
  medications?: Medication[];
  procedures_mentioned?: string[];
  recommendations?: string[];
  red_flags?: string[];
  quality?: AnalysisQuality | null;
  suggested_specialties?: string[];
  /** Decimal 0..1 serialised as a string by the API */
  confidence?: number | string | null;
  // review -> edit -> confirm
  ai_output?: AnalysisAiOutput | null;
  review_status: AnalysisReviewStatus | null;
  confirmed_data: AnalysisEditableData | null;
  confirmed_by_user_id?: Uuid | null;
  confirmed_at: IsoDateTime | null;
  /** editable fields whose confirmed (or current) value differs from the AI output - computed by the server */
  edited_fields?: string[];
  edited_by_patient?: boolean;
  /** what the server tailored this payload for: the patient side (`owner`) or hospital/staff (`clinical`) */
  audience?: 'owner' | 'clinical';
  created_at: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface DocumentAnalysisCreateIn {
  document_ids: Uuid[];
  /** agents/staff acting for a patient; a patient may only name themself */
  patient_id?: Uuid;
  case_id?: Uuid;
  consent_ai: true;
}

export interface DocumentAnalysisListParams {
  patient_id?: Uuid;
  case_id?: Uuid;
  status?: DocumentAnalysisStatus;
  review_status?: AnalysisReviewStatus;
  page?: number;
  page_size?: number;
}

export type DocumentAnalysisPatchIn = Partial<AnalysisEditableData>;
export type DocumentAnalysisConfirmIn = AnalysisEditableData;

export type AnalysisAudience = 'patient' | 'clinical';
