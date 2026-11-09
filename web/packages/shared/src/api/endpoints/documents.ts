import { api } from '../client';
import type { DocumentListParams, DocumentOut, DocumentUploadIn, DocumentVerifyIn, Uuid } from '../types';
import { seg } from './_util';

/** PLAN 8.3 - /documents */
export const documentsApi = {
  /** multipart upload: `file`, `kind`, optional `case_id`, `patient_id`, `hospital_id` */
  upload: (input: DocumentUploadIn, signal?: AbortSignal) => {
    const form = new FormData();
    if (input.file instanceof File) form.append('file', input.file);
    else form.append('file', input.file, input.file_name ?? 'upload');
    form.append('kind', input.kind);
    if (input.case_id) form.append('case_id', input.case_id);
    if (input.patient_id) form.append('patient_id', input.patient_id);
    if (input.hospital_id) form.append('hospital_id', input.hospital_id);
    return api.upload<DocumentOut>('/documents', form, { signal });
  },
  list: (params?: DocumentListParams) => api.get<DocumentOut[]>('/documents', params),
  get: (id: Uuid) => api.get<DocumentOut>(`/documents/${seg(id)}`),
  /** authorized binary download (blob + filename) - e.g. to preview an image */
  download: (id: Uuid) => api.download(`/documents/${seg(id)}/download`),
  /** download and trigger the browser "save as" */
  downloadAndSave: (doc: Pick<DocumentOut, 'id' | 'file_name'>) =>
    api.downloadAndSave(`/documents/${seg(doc.id)}/download`, doc.file_name),
  delete: (id: Uuid) => api.delete(`/documents/${seg(id)}`),
  verify: (id: Uuid, body: DocumentVerifyIn) => api.post<DocumentOut>(`/documents/${seg(id)}/verify`, body),
};
