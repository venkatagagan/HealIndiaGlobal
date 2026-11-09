import { api } from '../client';
import type {
  AccommodationBookingIn,
  AccommodationBookingOut,
  AccommodationBookingUpdateIn,
  Page,
  ServiceBookingIn,
  ServiceBookingOut,
  ServiceBookingUpdateIn,
  SosAlertOut,
  SosIn,
  SosStatus,
  SosUpdateIn,
  StatusCounts,
  TravelBookingIn,
  TravelBookingOut,
  TravelBookingUpdateIn,
  TravelKindListParams,
  TravelListParams,
  TravelResource,
  Uuid,
  VisaRequestIn,
  VisaRequestOut,
  VisaRequestUpdateIn,
} from '../types';
import { seg } from './_util';

/** PLAN 8.8 - /travel. List endpoints return Page<T>. Patients create (`requested`); staff/hospital update. */
export const travelApi = {
  listVisaRequests: (params?: TravelListParams) => api.get<Page<VisaRequestOut>>('/travel/visa-requests', params),
  createVisaRequest: (body: VisaRequestIn) => api.post<VisaRequestOut>('/travel/visa-requests', body),
  updateVisaRequest: (id: Uuid, body: VisaRequestUpdateIn) =>
    api.patch<VisaRequestOut>(`/travel/visa-requests/${seg(id)}`, body),

  listTravelBookings: (params?: TravelKindListParams) =>
    api.get<Page<TravelBookingOut>>('/travel/travel-bookings', params),
  createTravelBooking: (body: TravelBookingIn) => api.post<TravelBookingOut>('/travel/travel-bookings', body),
  updateTravelBooking: (id: Uuid, body: TravelBookingUpdateIn) =>
    api.patch<TravelBookingOut>(`/travel/travel-bookings/${seg(id)}`, body),

  listAccommodationBookings: (params?: TravelListParams) =>
    api.get<Page<AccommodationBookingOut>>('/travel/accommodation-bookings', params),
  createAccommodationBooking: (body: AccommodationBookingIn) =>
    api.post<AccommodationBookingOut>('/travel/accommodation-bookings', body),
  updateAccommodationBooking: (id: Uuid, body: AccommodationBookingUpdateIn) =>
    api.patch<AccommodationBookingOut>(`/travel/accommodation-bookings/${seg(id)}`, body),

  listServiceBookings: (params?: TravelKindListParams) =>
    api.get<Page<ServiceBookingOut>>('/travel/service-bookings', params),
  createServiceBooking: (body: ServiceBookingIn) => api.post<ServiceBookingOut>('/travel/service-bookings', body),
  updateServiceBooking: (id: Uuid, body: ServiceBookingUpdateIn) =>
    api.patch<ServiceBookingOut>(`/travel/service-bookings/${seg(id)}`, body),

  /** notifies the coordinator + support staff */
  sos: (body: SosIn = {}) => api.post<SosAlertOut>('/travel/sos', body),
  listSos: (
    params?: { status?: SosStatus | readonly SosStatus[]; q?: string; from?: string; to?: string; case_id?: Uuid; page?: number; page_size?: number },
  ) =>
    api.get<Page<SosAlertOut>>('/travel/sos', params),
  updateSos: (id: Uuid, body: SosUpdateIn) => api.patch<SosAlertOut>(`/travel/sos/${seg(id)}`, body),
  /** rows per status of one travel-desk list for the same filters */
  statusCounts: (params: Omit<TravelKindListParams, 'status' | 'page' | 'page_size'> & { resource: TravelResource }) =>
    api.get<StatusCounts>('/travel/status-counts', params),
};
