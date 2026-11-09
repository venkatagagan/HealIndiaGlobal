import { api } from '../client';
import type {
  BookingCancelIn,
  BookingCreateIn,
  BookingListParams,
  BookingOut,
  BookingStatus,
  BookingTransitionIn,
  ChecklistItemOut,
  ChecklistUpdateIn,
  ItineraryItemIn,
  ItineraryItemOut,
  Page,
  StatusCounts,
  Uuid,
} from '../types';
import { seg } from './_util';

/** PLAN 8.7 - /bookings (+ checklist, itinerary). */
export const bookingsApi = {
  create: (body: BookingCreateIn) => api.post<BookingOut>('/bookings', body),
  list: (params?: BookingListParams) => api.get<Page<BookingOut>>('/bookings', params),
  /** bookings per status for the same filters as `list` (status ignored) */
  statusCounts: (params?: Omit<BookingListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<StatusCounts<BookingStatus>>('/bookings/status-counts', params),
  get: (id: Uuid) => api.get<BookingOut>(`/bookings/${seg(id)}`),
  /** computes refundable amount per refund_policy */
  cancel: (id: Uuid, body: BookingCancelIn) => api.post<BookingOut>(`/bookings/${seg(id)}/cancel`, body),
  admit: (id: Uuid, body: Omit<BookingTransitionIn, 'discharge_date'> = {}) =>
    api.post<BookingOut>(`/bookings/${seg(id)}/admit`, body),
  complete: (id: Uuid, body: BookingTransitionIn = {}) =>
    api.post<BookingOut>(`/bookings/${seg(id)}/complete`, body),

  checklist: (id: Uuid) => api.get<ChecklistItemOut[]>(`/bookings/${seg(id)}/checklist`),
  updateChecklistItem: (id: Uuid, itemId: Uuid, body: ChecklistUpdateIn) =>
    api.patch<ChecklistItemOut>(`/bookings/${seg(id)}/checklist/${seg(itemId)}`, body),

  itinerary: (id: Uuid) => api.get<ItineraryItemOut[]>(`/bookings/${seg(id)}/itinerary`),
  /** `status` is set via PATCH only (ItineraryItemCreate forbids it) */
  addItineraryItem: (id: Uuid, body: Omit<ItineraryItemIn, 'status'>) =>
    api.post<ItineraryItemOut>(`/bookings/${seg(id)}/itinerary`, body),
  updateItineraryItem: (id: Uuid, itemId: Uuid, body: Partial<ItineraryItemIn>) =>
    api.patch<ItineraryItemOut>(`/bookings/${seg(id)}/itinerary/${seg(itemId)}`, body),
  deleteItineraryItem: (id: Uuid, itemId: Uuid) => api.delete(`/bookings/${seg(id)}/itinerary/${seg(itemId)}`),
};
