/** PLAN 7.1 endpoints - thin wrappers over the shared API client. */
import { api } from '../api/client';
import { seg } from '../api/endpoints/_util';
import type { DocumentOut, DocumentUploadIn, Page, Uuid } from '../api/types';
import type {
  DocumentAnalysisConfirmIn,
  DocumentAnalysisCreateIn,
  DocumentAnalysisListParams,
  DocumentAnalysisOut,
  DocumentAnalysisPatchIn,
} from './types';

export const docaiApi = {
  /** POST /documents (multipart) - one page of a report */
  uploadDocument: (input: DocumentUploadIn, signal?: AbortSignal) => {
    const form = new FormData();
    if (input.file instanceof File) form.append('file', input.file);
    else form.append('file', input.file, input.file_name ?? 'upload');
    form.append('kind', input.kind);
    if (input.case_id) form.append('case_id', input.case_id);
    if (input.patient_id) form.append('patient_id', input.patient_id);
    if (input.hospital_id) form.append('hospital_id', input.hospital_id);
    return api.upload<DocumentOut>('/documents', form, { signal });
  },
  /** POST /documents/analyses -> 202 (status `queued`); records the `ai_processing` consent */
  create: (body: DocumentAnalysisCreateIn) => api.post<DocumentAnalysisOut>('/documents/analyses', body),
  list: (params?: DocumentAnalysisListParams) => api.get<Page<DocumentAnalysisOut>>('/documents/analyses', params),
  get: (id: Uuid) => api.get<DocumentAnalysisOut>(`/documents/analyses/${seg(id)}`),
  retry: (id: Uuid) => api.post<DocumentAnalysisOut>(`/documents/analyses/${seg(id)}/retry`, {}),
  /** latest analysis containing that page (404 when there is none) */
  forDocument: (documentId: Uuid) => api.get<DocumentAnalysisOut>(`/documents/${seg(documentId)}/analysis`),
  /** edit draft fields (only while `pending_review`) */
  update: (id: Uuid, body: DocumentAnalysisPatchIn) =>
    api.patch<DocumentAnalysisOut>(`/documents/analyses/${seg(id)}`, body),
  /** body = the final, reviewed data -> review_status `confirmed` */
  confirm: (id: Uuid, body: DocumentAnalysisConfirmIn) =>
    api.post<DocumentAnalysisOut>(`/documents/analyses/${seg(id)}/confirm`, body),
  reject: (id: Uuid) => api.post<DocumentAnalysisOut>(`/documents/analyses/${seg(id)}/reject`, {}),
};

export const docaiKeys = {
  all: ['docai'] as const,
  list: (params?: DocumentAnalysisListParams) => ['docai', 'list', params ?? {}] as const,
  detail: (id: Uuid) => ['docai', 'analysis', id] as const,
  forDocument: (documentId: Uuid) => ['docai', 'document', documentId] as const,
};
