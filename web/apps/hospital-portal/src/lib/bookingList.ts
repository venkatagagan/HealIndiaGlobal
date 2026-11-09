import { api, type BookingOut, type BookingStatus, type Page, type PageParams } from '@hig/shared/api';

/**
 * GET /bookings with the list filters the cases module added (search, several statuses, payment state, admission
 * window, total range, sort) and GET /bookings/status-counts. Kept local until `bookingsApi` in @hig/shared/api
 * gains them (another agent owns that file); switch over then.
 */
export const BOOKING_PAYMENT_STATES = ['paid', 'partial', 'unpaid'] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];
export const BOOKING_PAYMENT_LABELS: Record<BookingPaymentState, string> = {
  paid: 'Paid in full',
  partial: 'Partially paid',
  unpaid: 'Unpaid',
};

export interface BookingListFilters {
  status?: readonly BookingStatus[];
  hospital_id?: string;
  q?: string;
  payment?: readonly BookingPaymentState[];
  /** inclusive calendar dates (YYYY-MM-DD) */
  admission_from?: string;
  admission_to?: string;
  created_from?: string;
  created_to?: string;
  /** minor units */
  min_total?: number;
  max_total?: number;
}

export interface BookingListQuery extends BookingListFilters, PageParams {
  /** created_at | admission_date | booking_number | total_minor | status; '-' prefix = descending */
  sort?: string;
}

export interface BookingStatusCounts {
  counts: Partial<Record<BookingStatus, number>>;
  total: number;
}

export const bookingList = {
  list: (params: BookingListQuery) => api.get<Page<BookingOut>>('/bookings', params),
  statusCounts: (params: BookingListFilters) => api.get<BookingStatusCounts>('/bookings/status-counts', params),
};
