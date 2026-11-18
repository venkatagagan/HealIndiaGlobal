import { api, type BookingOut, type BookingStatus, type Page, type PageParams } from '@hig/shared/api';
import { i18n } from '@hig/shared/lib';

/**
 * GET /bookings with the list filters the cases module added (search, several statuses, payment state, admission
 * window, total range, sort) and GET /bookings/status-counts. Kept local until `bookingsApi` in @hig/shared/api
 * gains them (another agent owns that file); switch over then.
 */
export const BOOKING_PAYMENT_STATES = ['paid', 'partial', 'unpaid'] as const;
export type BookingPaymentState = (typeof BOOKING_PAYMENT_STATES)[number];
/** Labels in the current UI language (getters: translated when read, never at import time). */
export const BOOKING_PAYMENT_LABELS: Readonly<Record<BookingPaymentState, string>> = {
  get paid() {
    return i18n.t('hospital:bookings.payment.paidInFull');
  },
  get partial() {
    return i18n.t('hospital:bookings.payment.partiallyPaid');
  },
  get unpaid() {
    return i18n.t('hospital:bookings.payment.unpaid');
  },
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
