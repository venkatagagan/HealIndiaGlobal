import { api } from '../client';
import type {
  CompanionIn,
  CompanionOut,
  PatientDashboard,
  PatientProfileIn,
  PatientProfileOut,
  SavedEntityType,
  SavedItemIn,
  SavedItemOut,
  Uuid,
} from '../types';
import { seg } from './_util';

/** PLAN 8.2 - /patient (patients only). */
export const patientApi = {
  getProfile: () => api.get<PatientProfileOut>('/patient/profile'),
  updateProfile: (body: PatientProfileIn) => api.put<PatientProfileOut>('/patient/profile', body),
  dashboard: () => api.get<PatientDashboard>('/patient/dashboard'),

  listCompanions: () => api.get<CompanionOut[]>('/patient/companions'),
  getCompanion: (id: Uuid) => api.get<CompanionOut>(`/patient/companions/${seg(id)}`),
  createCompanion: (body: CompanionIn) => api.post<CompanionOut>('/patient/companions', body),
  updateCompanion: (id: Uuid, body: Partial<CompanionIn>) =>
    api.put<CompanionOut>(`/patient/companions/${seg(id)}`, body),
  deleteCompanion: (id: Uuid) => api.delete(`/patient/companions/${seg(id)}`),

  listSaved: (params?: { entity_type?: SavedEntityType }) => api.get<SavedItemOut[]>('/patient/saved', params),
  save: (body: SavedItemIn) => api.post<SavedItemOut>('/patient/saved', body),
  /** DELETE /patient/saved?entity_type=&entity_id= */
  unsave: (body: SavedItemIn) => api.delete('/patient/saved', { query: body }),
};
