import { api } from '../client';
import type {
  AssignCoordinatorIn,
  CaseCreateIn,
  CaseDetail,
  CaseListParams,
  CaseOut,
  CaseStatusCounts,
  CaseStatusIn,
  ConsultationCreateIn,
  ConsultationListParams,
  ConsultationOut,
  ConsultationUpdateIn,
  EmergencyAckIn,
  Page,
  QuoteCreateIn,
  QuoteOut,
  QuoteRejectIn,
  Uuid,
} from '../types';
import { seg } from './_util';

/** PLAN 8.7 - /cases (+ quotes). Scoped by role server-side. */
export const casesApi = {
  create: (body: CaseCreateIn) => api.post<CaseOut>('/cases', body),
  list: (params?: CaseListParams) => api.get<Page<CaseOut>>('/cases', params),
  /** visible cases per status for the same filters as `list` (`status` itself is ignored) - drives status tabs */
  statusCounts: (params?: Omit<CaseListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<CaseStatusCounts>('/cases/status-counts', params),
  get: (id: Uuid) => api.get<CaseDetail>(`/cases/${seg(id)}`),
  changeStatus: (id: Uuid, body: CaseStatusIn) => api.post<CaseOut>(`/cases/${seg(id)}/status`, body),
  /** patient (or their agent): acknowledge the emergency guidance on an emergency-screened case (unblocks booking) */
  emergencyAck: (id: Uuid) =>
    api.post<CaseOut>(`/cases/${seg(id)}/emergency-ack`, { acknowledged: true } satisfies EmergencyAckIn),
  assignCoordinator: (id: Uuid, body: AssignCoordinatorIn) =>
    api.post<CaseOut>(`/cases/${seg(id)}/assign-coordinator`, body),
  /** hospital: send an itemized quote (case -> quoted) */
  sendQuote: (id: Uuid, body: QuoteCreateIn) => api.post<QuoteOut>(`/cases/${seg(id)}/quotes`, body),
  /** patient/agent: accept (case -> accepted) */
  acceptQuote: (id: Uuid, quoteId: Uuid) =>
    api.post<QuoteOut>(`/cases/${seg(id)}/quotes/${seg(quoteId)}/accept`, {}),
  rejectQuote: (id: Uuid, quoteId: Uuid, body: QuoteRejectIn = {}) =>
    api.post<QuoteOut>(`/cases/${seg(id)}/quotes/${seg(quoteId)}/reject`, body),
};

/** PLAN 8.7 - /consultations (tele-consult requests). P/A create; H/S schedule. */
export const consultationsApi = {
  create: (body: ConsultationCreateIn) => api.post<ConsultationOut>('/consultations', body),
  list: (params?: ConsultationListParams) => api.get<Page<ConsultationOut>>('/consultations', params),
  update: (id: Uuid, body: ConsultationUpdateIn) => api.patch<ConsultationOut>(`/consultations/${seg(id)}`, body),
};
