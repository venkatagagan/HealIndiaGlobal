/**
 * Agent CRM: leads, activity timeline, pipeline, convert-to-patient, CSV import/export (role agent, scoped to the
 * agency). Backend: backend/app/modules/crm. Types live next to the endpoints (like phase1.ts).
 */
import { api } from '../client';
import type {
  AgentPatientCreateIn,
  AgentPatientOut,
  CountryCode,
  CurrencyCode,
  IsoDateTime,
  Page,
  PageParams,
  Uuid,
} from '../types';
import { seg } from './_util';

/** pipeline order */
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'screening', 'quote_requested', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'screening', 'quote_requested'] as const satisfies readonly LeadStatus[];
export type OpenLeadStatus = (typeof OPEN_LEAD_STATUSES)[number];
export const LEAD_SOURCES = ['walk_in', 'whatsapp', 'facebook', 'referral', 'event', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_ACTIVITY_KINDS = ['call', 'message', 'meeting', 'note', 'status_change'] as const;
export type LeadActivityKind = (typeof LEAD_ACTIVITY_KINDS)[number];
/** kinds an agent can log (status changes are recorded by updating the lead) */
export const LOGGABLE_ACTIVITY_KINDS = ['call', 'message', 'meeting', 'note'] as const satisfies readonly LeadActivityKind[];
export type LoggableActivityKind = (typeof LOGGABLE_ACTIVITY_KINDS)[number];
export const LEAD_FOLLOW_UP_FILTERS = ['due', 'overdue', 'none'] as const;
export type LeadFollowUpFilter = (typeof LEAD_FOLLOW_UP_FILTERS)[number];
export const LEAD_SORT_FIELDS = ['created_at', 'updated_at', 'next_follow_up_at', 'full_name', 'status', 'last_activity_at'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export interface LeadOut {
  id: Uuid;
  full_name: string;
  country: CountryCode | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferred_language: string | null;
  source: LeadSource;
  source_detail: string | null;
  interested_specialty_id: Uuid | null;
  interested_specialty_name: string | null;
  interested_procedure_id: Uuid | null;
  interested_procedure_name: string | null;
  /** short text, NOT medical history */
  interest: string | null;
  budget_minor: number | null;
  budget_currency: CurrencyCode | null;
  status: LeadStatus;
  status_changed_at: IsoDateTime | null;
  lost_reason: string | null;
  next_follow_up_at: IsoDateTime | null;
  follow_up_due: boolean;
  last_activity_at: IsoDateTime | null;
  owner_user_id: Uuid | null;
  owner_name: string | null;
  tags: string[];
  converted_patient_id: Uuid | null;
  converted_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface LeadActivityOut {
  id: Uuid;
  kind: LeadActivityKind;
  body: string | null;
  from_status: LeadStatus | null;
  to_status: LeadStatus | null;
  actor_user_id: Uuid | null;
  actor_name: string | null;
  occurred_at: IsoDateTime;
  created_at: IsoDateTime;
}

export interface LeadDetailOut extends LeadOut {
  activities: LeadActivityOut[];
}

interface LeadFieldsIn {
  country?: CountryCode | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferred_language?: string | null;
  source?: LeadSource | null;
  source_detail?: string | null;
  interested_specialty_id?: Uuid | null;
  interested_procedure_id?: Uuid | null;
  interest?: string | null;
  budget_minor?: number | null;
  /** required with a budget */
  budget_currency?: CurrencyCode | null;
  next_follow_up_at?: IsoDateTime | null;
  owner_user_id?: Uuid | null;
  tags?: string[] | null;
}

/** POST /agent-portal/leads */
export interface LeadCreateIn extends LeadFieldsIn {
  full_name: string;
  /** open stages only */
  status?: OpenLeadStatus;
  /** first timeline note */
  note?: string | null;
}

/** PATCH /agent-portal/leads/{id}: only sent fields change (`null` clears). "lost" needs `lost_reason`. */
export interface LeadUpdateIn extends LeadFieldsIn {
  full_name?: string;
  status?: Exclude<LeadStatus, 'won'>;
  lost_reason?: string | null;
}

/** POST /agent-portal/leads/{id}/activities */
export interface LeadActivityIn {
  kind: LoggableActivityKind;
  body?: string | null;
  occurred_at?: IsoDateTime | null;
  next_follow_up_at?: IsoDateTime | null;
}

export interface LeadFilters {
  status?: LeadStatus[];
  source?: LeadSource[];
  q?: string;
  tag?: string;
  owner_user_id?: Uuid;
  follow_up?: LeadFollowUpFilter;
  country?: CountryCode;
}

export interface LeadListParams extends LeadFilters, PageParams {
  /** `created_at` or `-created_at` etc. */
  sort?: string;
}

export interface LeadStageCount {
  status: LeadStatus;
  count: number;
}

export interface LeadSourceStats {
  source: LeadSource;
  total: number;
  won: number;
  lost: number;
  /** won / (won + lost); null when nothing closed yet */
  conversion_rate: number | null;
}

/** GET /agent-portal/leads/pipeline */
export interface LeadPipelineOut {
  total: number;
  open: number;
  /** all 7 stages in pipeline order */
  stages: LeadStageCount[];
  sources: LeadSourceStats[];
  won: number;
  lost: number;
  /** 0..1, null when nothing closed yet */
  conversion_rate: number | null;
  /** open leads due by the end of today (IST), incl. overdue */
  follow_ups_due_today: number;
  follow_ups_overdue: number;
  new_this_month: number;
}

/** POST /agent-portal/leads/{id}/convert -> same body as POST /agent-portal/patients */
export type LeadConvertIn = AgentPatientCreateIn;

export interface LeadConvertOut {
  lead: LeadDetailOut;
  patient: AgentPatientOut;
}

export interface LeadImportRowError {
  /** 1-based data row (the header is row 0) */
  row: number;
  field: string | null;
  message: string;
}

export interface LeadImportResultOut {
  dry_run: boolean;
  total_rows: number;
  created: number;
  skipped_duplicates: number;
  errors: LeadImportRowError[];
}

export const crmApi = {
  list: (params?: LeadListParams) => api.get<Page<LeadOut>>('/agent-portal/leads', params),
  /** status filter ignored */
  pipeline: (params?: LeadFilters) => api.get<LeadPipelineOut>('/agent-portal/leads/pipeline', params),
  create: (body: LeadCreateIn) => api.post<LeadDetailOut>('/agent-portal/leads', body),
  get: (id: Uuid) => api.get<LeadDetailOut>(`/agent-portal/leads/${seg(id)}`),
  /** 400 `lost_reason_required` / `lead_convert_required`; 409 `lead_converted` */
  update: (id: Uuid, body: LeadUpdateIn) => api.patch<LeadDetailOut>(`/agent-portal/leads/${seg(id)}`, body),
  remove: (id: Uuid) => api.delete(`/agent-portal/leads/${seg(id)}`),
  addActivity: (id: Uuid, body: LeadActivityIn) =>
    api.post<LeadDetailOut>(`/agent-portal/leads/${seg(id)}/activities`, body),
  /** 409 `lead_converted` / `email_taken`; 403 `agent_not_active` */
  convert: (id: Uuid, body: LeadConvertIn) => api.post<LeadConvertOut>(`/agent-portal/leads/${seg(id)}/convert`, body),
  /** UTF-8 CSV with a header row (max 1000 rows / 1 MB); nothing is created when any row has errors; 429 when rate limited */
  importCsv: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<LeadImportResultOut>(`/agent-portal/leads/import?dry_run=${dryRun ? 'true' : 'false'}`, form);
  },
  /** downloads leads.csv (same filters as the list) */
  exportCsv: (params?: LeadFilters) => api.downloadAndSave('/agent-portal/leads/export', 'leads.csv', params),
};
