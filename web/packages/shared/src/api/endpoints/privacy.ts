import { api } from '../client';
import type { Page, PageParams, Uuid } from '../types';
import { seg } from './_util';

// ---------------------------------------------------------------------------------------------------------
// Types (backend: app/modules/privacy/schemas.py)
// ---------------------------------------------------------------------------------------------------------
export const DATA_RIGHTS_REQUEST_KINDS = [
  'access',
  'correction',
  'erasure',
  'nomination',
  'withdraw_consent',
  'complaint',
  'other',
] as const;
export type DataRightsRequestKind = (typeof DATA_RIGHTS_REQUEST_KINDS)[number];
export const DATA_RIGHTS_REQUEST_KIND_LABELS: Record<DataRightsRequestKind, string> = {
  access: 'Access to my data',
  correction: 'Correct my data',
  erasure: 'Erase my data',
  nomination: 'Nomination',
  withdraw_consent: 'Withdraw consent',
  complaint: 'Complaint',
  other: 'Other privacy question',
};

export const DATA_RIGHTS_REQUEST_STATUSES = [
  'received',
  'in_progress',
  'awaiting_requester',
  'completed',
  'rejected',
] as const;
export type DataRightsRequestStatus = (typeof DATA_RIGHTS_REQUEST_STATUSES)[number];
export const DATA_RIGHTS_REQUEST_STATUS_LABELS: Record<DataRightsRequestStatus, string> = {
  received: 'Received',
  in_progress: 'In progress',
  awaiting_requester: 'Waiting for requester',
  completed: 'Completed',
  rejected: 'Rejected',
};

export interface ContactPerson {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface PrivacyContactOut {
  grievance_officer: ContactPerson;
  data_protection_officer: ContactPerson;
  postal_address: string | null;
  response_days: number;
  request_kinds: DataRightsRequestKind[];
  data_protection_board_url: string;
}

export interface DataRightsRequestIn {
  kind: DataRightsRequestKind;
  details: string;
  requester_name?: string | null;
  requester_email?: string | null;
  requester_phone?: string | null;
  on_behalf_of?: string | null;
  channel?: 'web' | 'app';
}

export interface DataRightsRequestOut {
  id: Uuid;
  reference: string;
  kind: DataRightsRequestKind;
  status: DataRightsRequestStatus;
  channel: string;
  details: string;
  on_behalf_of: string | null;
  resolution: string | null;
  due_at: string;
  overdue: boolean;
  acknowledged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminDataRightsRequestOut extends DataRightsRequestOut {
  user_id: Uuid | null;
  requester_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  assigned_to_user_id: Uuid | null;
  internal_notes: string | null;
}

export interface DataRightsRequestUpdate {
  status?: DataRightsRequestStatus;
  assigned_to_user_id?: Uuid | null;
  resolution?: string | null;
  internal_notes?: string | null;
}

export interface AdminRequestListParams extends PageParams {
  status?: DataRightsRequestStatus;
  kind?: DataRightsRequestKind;
  open?: boolean;
  overdue?: boolean;
}

export interface NomineeIn {
  full_name: string;
  relationship: string;
  email?: string | null;
  phone?: string | null;
}

export interface NomineeOut {
  full_name: string;
  relationship: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessLogEntry {
  at: string;
  action: 'phi.view' | 'phi.download' | 'phi.list' | 'phi.break_glass' | string;
  resource_type: string | null;
  resource_id: string | null;
  viewer_role: string | null;
  viewer_name: string | null;
  reason: string | null;
}

export interface GuardianConsentOut {
  id: Uuid;
  patient_id: Uuid;
  guardian_name: string;
  relationship: string;
  guardian_email: string | null;
  guardian_phone: string | null;
  verification_method: string;
  verification_reference: string | null;
  verified_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface GuardianStatusOut {
  patient_id: Uuid | null;
  is_minor: boolean;
  date_of_birth_known: boolean;
  satisfied: boolean;
  consent: GuardianConsentOut | null;
  pending: GuardianConsentOut | null;
}

// ---------------------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------------------
/** Privacy and data rights (DPDP Act / GDPR): export, requests and grievances, nominee, access log. */
export const privacyApi = {
  /** public: Grievance Officer / DPO contact */
  contact: () => api.get<PrivacyContactOut>('/site-config/privacy-contact', null, { skipAuth: true }),
  /** "Download my data": ZIP with data.json + your files, saved by the browser */
  downloadMyData: (format: 'zip' | 'json' = 'zip') =>
    api.downloadAndSave('/auth/me/export', `my-data.${format}`, { format }),
  createRequest: (body: DataRightsRequestIn) => api.post<DataRightsRequestOut>('/privacy/requests', body),
  myRequests: () => api.get<DataRightsRequestOut[]>('/privacy/requests'),
  nominee: () => api.get<NomineeOut | null>('/privacy/nominee'),
  setNominee: (body: NomineeIn) => api.put<NomineeOut>('/privacy/nominee', body),
  removeNominee: () => api.delete<void>('/privacy/nominee'),
  /** who viewed or downloaded my health records */
  accessLog: () => api.get<AccessLogEntry[]>('/privacy/access-log'),
  guardianStatus: () => api.get<GuardianStatusOut>('/privacy/guardian-consent'),
};

/** Staff: the data-rights / grievance queue. */
export const privacyAdminApi = {
  requests: (params: AdminRequestListParams = {}) =>
    api.get<Page<AdminDataRightsRequestOut>>('/admin/privacy/requests', params),
  updateRequest: (id: Uuid, body: DataRightsRequestUpdate) =>
    api.patch<AdminDataRightsRequestOut>(`/admin/privacy/requests/${seg(id)}`, body),
  pendingGuardianConsents: () => api.get<GuardianConsentOut[]>('/admin/privacy/guardian-consents'),
  verifyGuardianConsent: (id: Uuid) =>
    api.post<GuardianConsentOut>(`/admin/privacy/guardian-consents/${seg(id)}/verify`, {}),
};
