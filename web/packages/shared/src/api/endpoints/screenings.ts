import { api } from '../client';
import type {
  MatchOut,
  Page,
  ScreeningCreateIn,
  ScreeningListParams,
  ScreeningOut,
  ScreeningSubmitIn,
  ScreeningUpdateIn,
  Uuid,
} from '../types';
import { seg } from './_util';

/**
 * PLAN 8.6 - /screenings. Flow: create (draft) -> update per step -> submit (processing) ->
 * poll get() until completed/failed (or listen to ws `screening.completed`) -> matches().
 */
export const screeningsApi = {
  create: (body: ScreeningCreateIn = {}) => api.post<ScreeningOut>('/screenings', body),
  /** only while status = draft */
  update: (id: Uuid, body: ScreeningUpdateIn) => api.patch<ScreeningOut>(`/screenings/${seg(id)}`, body),
  submit: (id: Uuid, body: ScreeningSubmitIn) => api.post<ScreeningOut>(`/screenings/${seg(id)}/submit`, body),
  get: (id: Uuid) => api.get<ScreeningOut>(`/screenings/${seg(id)}`),
  list: (params?: ScreeningListParams) => api.get<Page<ScreeningOut>>('/screenings', params),
  matches: (id: Uuid) => api.get<MatchOut[]>(`/screenings/${seg(id)}/matches`),
  rerun: (id: Uuid) => api.post<ScreeningOut>(`/screenings/${seg(id)}/rerun`, {}),
};
