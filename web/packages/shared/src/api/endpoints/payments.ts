import { api, isApiError } from '../client';
import type {
  AmountReviewIn,
  BankTransferProofIn,
  CheckoutOut,
  DocumentOut,
  InstallmentOut,
  InvoiceListParams,
  InvoiceOut,
  MarkPaidApproveIn,
  MarkPaidDecisionIn,
  MockCompleteIn,
  OrderCreateIn,
  OrderListParams,
  OrderMarkPaidIn,
  OrderStatusCounts,
  Page,
  PaymentOrderDetail,
  PaymentOrderOut,
  RazorpayVerifyIn,
  ReasonIn,
  RefundCreateIn,
  RefundListParams,
  RefundOut,
  RefundStatusCounts,
  Uuid,
} from '../types';
import { seg } from './_util';

/** Unique Idempotency-Key for POST /payments/orders (reuse the same key when retrying one attempt). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** 503 `fx_rate_unavailable`: the order currency has no fresh FX rate (production fails closed); retry later. */
export function isFxRateUnavailable(error: unknown): boolean {
  return isApiError(error) && error.code === 'fx_rate_unavailable';
}

/** 403 `second_approver_required`: maker-checker - a different finance user must approve this action. */
export function isSecondApproverRequired(error: unknown): boolean {
  return isApiError(error) && error.code === 'second_approver_required';
}

/** PLAN 8.11 - /payments. Amounts are always computed server-side (never send amounts for orders). */
export const paymentsApi = {
  /** create an order + gateway checkout payload; pass a stable idempotencyKey per user attempt.
   *  503 `fx_rate_unavailable` (see isFxRateUnavailable) when a foreign-currency rate is missing/stale. */
  createOrder: (body: OrderCreateIn, idempotencyKey: string = newIdempotencyKey()) =>
    api.post<CheckoutOut>('/payments/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
  /** staff: `review=amount|mark_paid` lists the finance review queues */
  listOrders: (params?: OrderListParams) => api.get<Page<PaymentOrderOut>>('/payments/orders', params),
  /** staff: orders per status + review queues for the same filters (`status` / `review` ignored) */
  orderStatusCounts: (params?: Omit<OrderListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<OrderStatusCounts>('/payments/orders/status-counts', params),
  getOrder: (id: Uuid) => api.get<PaymentOrderDetail>(`/payments/orders/${seg(id)}`),
  /** Razorpay Checkout.js handler response -> server HMAC verification + capture */
  verifyRazorpay: (id: Uuid, body: RazorpayVerifyIn) =>
    api.post<PaymentOrderOut>(`/payments/orders/${seg(id)}/verify`, body),
  submitBankTransferProof: (id: Uuid, body: BankTransferProofIn) =>
    api.post<PaymentOrderOut>(`/payments/orders/${seg(id)}/bank-transfer-proof`, body),
  /** staff: proof documents for a bank-transfer order (the submitted one plus `payment_proof` uploads for the
   *  order's case / patient since the order was created), newest first */
  proofDocuments: (id: Uuid) => api.get<DocumentOut[]>(`/payments/orders/${seg(id)}/proof-documents`),
  /** finance (maker): record a bank-transfer mark-paid request; the order stays `pending` until a second
   *  finance user approves it. `amount_minor` must equal the order amount (400 `amount_mismatch`). */
  markPaid: (id: Uuid, body: OrderMarkPaidIn) =>
    api.post<PaymentOrderOut>(`/payments/orders/${seg(id)}/mark-paid`, body),
  /** finance (checker): apply the pending mark-paid; 403 `second_approver_required` for the requester */
  approveMarkPaid: (id: Uuid, body: MarkPaidApproveIn) =>
    api.post<PaymentOrderOut>(`/payments/orders/${seg(id)}/mark-paid/approve`, body),
  rejectMarkPaid: (id: Uuid, body: MarkPaidDecisionIn = {}) =>
    api.post<PaymentOrderOut>(`/payments/orders/${seg(id)}/mark-paid/reject`, body),
  /** finance: decide on a payment held because the captured amount differed from the order amount */
  amountReview: (id: Uuid, body: AmountReviewIn) =>
    api.post<PaymentOrderOut>(`/payments/orders/${seg(id)}/amount-review`, body),
  /** non-production only: simulate the gateway webhook */
  completeMock: (orderId: Uuid, body: MockCompleteIn) =>
    api.post<PaymentOrderOut>(`/payments/mock/${seg(orderId)}/complete`, body),

  createRefund: (body: RefundCreateIn) => api.post<RefundOut>('/payments/refunds', body),
  listRefunds: (params?: RefundListParams) => api.get<Page<RefundOut>>('/payments/refunds', params),
  /** refunds per status + the second-approver queue (`status` / `awaiting_second_approval` ignored) */
  refundStatusCounts: (params?: Omit<RefundListParams, 'page' | 'page_size' | 'sort'>) =>
    api.get<RefundStatusCounts>('/payments/refunds/status-counts', params),
  /** 403 `second_approver_required` when the requester approves a refund above the dual-approval threshold */
  approveRefund: (id: Uuid) => api.post<RefundOut>(`/payments/refunds/${seg(id)}/approve`, {}),
  rejectRefund: (id: Uuid, body: ReasonIn) => api.post<RefundOut>(`/payments/refunds/${seg(id)}/reject`, body),

  listInvoices: (params?: InvoiceListParams) => api.get<Page<InvoiceOut>>('/payments/invoices', params),
  getInvoice: (id: Uuid) => api.get<InvoiceOut>(`/payments/invoices/${seg(id)}`),
  downloadInvoicePdf: (invoice: Pick<InvoiceOut, 'id' | 'invoice_number'>) =>
    api.downloadAndSave(
      `/payments/invoices/${seg(invoice.id)}/pdf`,
      `${invoice.invoice_number.replace(/[^\w.-]+/g, '_')}.pdf`,
    ),

  installments: (bookingId: Uuid) =>
    api.get<InstallmentOut[]>(`/payments/bookings/${seg(bookingId)}/installments`),
};
