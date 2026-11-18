/**
 * Pre-travel video tele-consultations: request (case + `POST /consultations`), list/detail, cancel and the
 * consultation-fee payment state (orders with purpose `consultation_fee`).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  authApi,
  catalogApi,
  consultationsApi,
  paymentsApi,
  requestVideoConsultation,
  type ConsultationListParams,
  type ConsultationOut,
  type PaymentOrderOut,
  type Uuid,
  type VideoConsultationRequest,
} from '@hig/shared/api';
import { SHARE_CONSENT_VERSION } from '../pages/screening/RequestQuoteDialog';

export const ck = {
  all: ['consultations'] as const,
  list: (params?: ConsultationListParams) => ['consultations', 'list', params ?? {}] as const,
  one: (id: Uuid) => ['consultations', 'one', id] as const,
  orders: (id: Uuid) => ['consultations', 'orders', id] as const,
  doctorSlots: (doctorId: Uuid, params: object) => ['availability', 'doctor', doctorId, params] as const,
};

export function useConsultations(params?: ConsultationListParams) {
  return useQuery({
    queryKey: ck.list(params),
    queryFn: () => consultationsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useConsultation(id: Uuid | undefined, options: { pollMs?: number | false } = {}) {
  return useQuery({
    queryKey: ck.one(id ?? ''),
    queryFn: () => consultationsApi.get(id as Uuid),
    enabled: !!id,
    refetchInterval: options.pollMs ?? false,
  });
}

/** Fee orders of one consultation (the order list has no consultation filter, so it is matched here). */
export function useConsultationOrders(consultation: ConsultationOut | undefined, options: { pollMs?: number | false } = {}) {
  const id = consultation?.id;
  return useQuery({
    queryKey: ck.orders(id ?? ''),
    queryFn: async () => {
      const page = await paymentsApi.listOrders({ purpose: 'consultation_fee', page_size: 100 });
      return page.items.filter((o) => o.consultation_id === id);
    },
    enabled: !!id && (consultation?.fee_minor ?? 0) > 0,
    refetchInterval: options.pollMs ?? false,
  });
}

const PAID_ORDER_STATUSES = new Set(['paid', 'partially_refunded', 'refunded']);
const OPEN_ORDER_STATUSES = new Set(['created', 'pending']);

export type FeeState = 'free' | 'paid' | 'pending' | 'unpaid';

export function feeState(consultation: ConsultationOut, orders: PaymentOrderOut[] | undefined): FeeState {
  if (!consultation.fee_minor) return 'free';
  if ((orders ?? []).some((o) => PAID_ORDER_STATUSES.has(o.status))) return 'paid';
  if ((orders ?? []).some((o) => OPEN_ORDER_STATUSES.has(o.status) && o.gateway === 'bank_transfer')) return 'pending';
  return 'unpaid';
}

export function canPayFee(consultation: ConsultationOut, state: FeeState): boolean {
  return (state === 'unpaid' || state === 'pending') && (consultation.status === 'requested' || consultation.status === 'scheduled');
}

export function useDoctorSlots(doctorId: Uuid | undefined, params: { from: string; to: string }) {
  return useQuery({
    queryKey: ck.doctorSlots(doctorId ?? '', params),
    queryFn: () => catalogApi.doctorAvailability(doctorId as Uuid, params),
    enabled: !!doctorId,
    staleTime: 60_000,
  });
}

/** Patients record their own share consent first; the shared helper reuses or opens the case. */
async function bookConsultation(input: VideoConsultationRequest): Promise<ConsultationOut> {
  await authApi.giveConsent({ kind: 'share_with_hospitals', version: SHARE_CONSENT_VERSION, granted: true });
  return requestVideoConsultation(input);
}

export function useBookConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bookConsultation,
    onSuccess: (data) => {
      qc.setQueryData(ck.one(data.id), data);
      void qc.invalidateQueries({ queryKey: ck.all });
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCancelConsultation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: Uuid) => consultationsApi.update(id, { status: 'cancelled' }),
    onSuccess: (data) => {
      qc.setQueryData(ck.one(data.id), data);
      void qc.invalidateQueries({ queryKey: ck.all });
    },
  });
}

/** Error codes of `POST /consultations` and `POST /cases` that get their own message. */
export const CONSULTATION_ERROR_CODES = [
  'consultation_exists',
  'teleconsult_unavailable',
  'doctor_required',
  'invalid_doctor',
  'invalid_state',
] as const;
