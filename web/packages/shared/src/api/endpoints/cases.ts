import { api } from '../client';
import type {
  AssignCoordinatorIn,
  CaseCreateIn,
  CaseDetail,
  CaseListParams,
  CaseOut,
  CaseStatusCounts,
  CaseStatus,
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
  get: (id: Uuid) => api.get<ConsultationOut>(`/consultations/${seg(id)}`),
  update: (id: Uuid, body: ConsultationUpdateIn) => api.patch<ConsultationOut>(`/consultations/${seg(id)}`, body),
};

/** Case statuses that can still take a consultation request (the backend refuses closed cases). */
export const CONSULTATION_OPEN_CASE_STATUSES: readonly CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment'];

export interface VideoConsultationRequest {
  hospitalId: Uuid;
  doctorId: Uuid;
  specialtyId?: Uuid;
  screeningId?: Uuid;
  /** agents: the managed patient's profile id */
  patientId?: Uuid;
  /** the patient's preferred slot (ISO date-time) */
  preferredAt: string | null;
  question: string;
  /** reports shared with the hospital when a new case is opened */
  documentIds: Uuid[];
}

/**
 * Pre-travel video consultation (kind `standard`, mode `video`). A consultation hangs off a case at the doctor's
 * hospital: the newest open case of the patient there is reused, otherwise a new case is opened (share consent
 * and the chosen reports included), then `POST /consultations`.
 */
export async function requestVideoConsultation(input: VideoConsultationRequest): Promise<ConsultationOut> {
  const existing = await casesApi.list({
    hospital_id: input.hospitalId,
    status: CONSULTATION_OPEN_CASE_STATUSES,
    page_size: 1,
    sort: '-created_at',
    ...(input.patientId ? { patient_id: input.patientId } : {}),
  });
  const question = input.question.trim();
  let caseId = existing.items[0]?.id;
  if (!caseId) {
    const created = await casesApi.create({
      hospital_id: input.hospitalId,
      doctor_id: input.doctorId,
      ...(input.specialtyId ? { specialty_id: input.specialtyId } : {}),
      ...(input.screeningId ? { screening_id: input.screeningId } : {}),
      ...(input.patientId ? { patient_id: input.patientId } : {}),
      ...(question ? { patient_notes: question } : {}),
      ...(input.documentIds.length ? { document_ids: input.documentIds } : {}),
      consent_share: true,
    });
    caseId = created.id;
  }
  return consultationsApi.create({
    case_id: caseId,
    kind: 'standard',
    mode: 'video',
    doctor_id: input.doctorId,
    preferred_at: input.preferredAt,
    ...(question ? { notes: question } : {}),
  });
}
