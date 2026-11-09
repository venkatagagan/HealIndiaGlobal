import { api } from '../client';
import type {
  AgentCommissionListParams,
  AgentCommissionOut,
  AgentCommissionStatusCounts,
  AgentDashboard,
  AgentConsentAttestationIn,
  AgentPatientCounts,
  AgentPatientCreateIn,
  AgentPatientListParams,
  AgentPatientOut,
  AgentPatientUpdateIn,
  AgentProfileIn,
  AgentProfileOut,
  Page,
  ReferralOut,
  Uuid,
} from '../types';
import { seg } from './_util';

/** PLAN 8.10 - /agent-portal (agents). */
export const agentPortalApi = {
  getProfile: () => api.get<AgentProfileOut>('/agent-portal/profile'),
  updateProfile: (body: AgentProfileIn) => api.put<AgentProfileOut>('/agent-portal/profile', body),
  submitKyc: () => api.post<AgentProfileOut>('/agent-portal/submit-kyc', {}),
  dashboard: () => api.get<AgentDashboard>('/agent-portal/dashboard'),

  listPatients: (params?: AgentPatientListParams) =>
    api.get<Page<AgentPatientOut>>('/agent-portal/patients', params),
  /** patients per consent state / nationality for the listPatients filters (each facet ignores its own filter) */
  patientCounts: (params?: Omit<AgentPatientListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<AgentPatientCounts>('/agent-portal/patients/counts', params),
  /** creates a patient user + profile managed by this agent (emails an invite when email is given) */
  createPatient: (body: AgentPatientCreateIn) => api.post<AgentPatientOut>('/agent-portal/patients', body),
  getPatient: (id: Uuid) => api.get<AgentPatientOut>(`/agent-portal/patients/${seg(id)}`),
  /** POST /agent-portal/patients/{id}/consent - (re-)attest the patient's consent */
  attestPatientConsent: (id: Uuid, body: AgentConsentAttestationIn) =>
    api.post<AgentPatientOut>(`/agent-portal/patients/${seg(id)}/consent`, body),
  updatePatient: (id: Uuid, body: AgentPatientUpdateIn) =>
    api.patch<AgentPatientOut>(`/agent-portal/patients/${seg(id)}`, body),

  referral: () => api.get<ReferralOut>('/agent-portal/referral'),
  commissions: (params?: AgentCommissionListParams) =>
    api.get<Page<AgentCommissionOut>>('/agent-portal/commissions', params),
  /** items + net amount per status for the commissions filters (status itself ignored) */
  commissionStatusCounts: (params?: Omit<AgentCommissionListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<AgentCommissionStatusCounts>('/agent-portal/commissions/status-counts', params),
};
