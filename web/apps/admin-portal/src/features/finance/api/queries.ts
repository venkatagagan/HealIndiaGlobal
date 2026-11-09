/**
 * TanStack Query hooks for the finance console (PLAN 8.11, 8.12, 8.13 reports).
 * Query keys: ['finance', <resource>, params]. Every mutation invalidates the finance tree so balances,
 * queues and summaries stay consistent after an action.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  bookingsApi,
  catalogApi,
  financeApi,
  paymentsApi,
  type CommissionRuleIn,
  type CommissionRuleListParams,
  type ExportParams,
  type AmountReviewIn,
  type LedgerAdjustmentCreateIn,
  type LedgerAdjustmentListParams,
  type SettlementDocumentListParams,
  type StaffMemberOut,
  type PayoutOut,
  type LedgerAccountListParams,
  type LedgerTransactionListParams,
  type OrderListParams,
  type OrderMarkPaidIn,
  type MarkPaidApproveIn,
  type PayoutFailureApproveIn,
  type PageParams,
  type PayoutAccountListParams,
  type PayoutListParams,
  type RefundCreateIn,
  type RefundListParams,
  type RevenueReportParams,
  type SettlementBatchCreateIn,
  type SettlementBatchListParams,
  type SettlementItemListParams,
  type Uuid,
} from '@hig/shared/api';

/** Order list filters: the plan's params plus a created-at date window (`from`/`to`, YYYY-MM-DD). */
export type OrderFilters = OrderListParams & { from?: string; to?: string };

export const financeKeys = {
  all: ['finance'] as const,
  summary: () => ['finance', 'summary'] as const,
  orders: (params: OrderFilters) => ['finance', 'orders', params] as const,
  order: (id: Uuid) => ['finance', 'order', id] as const,
  refunds: (params: RefundListParams) => ['finance', 'refunds', params] as const,
  accounts: (params: LedgerAccountListParams) => ['finance', 'accounts', params] as const,
  accountEntries: (id: Uuid, params: PageParams) => ['finance', 'account-entries', id, params] as const,
  transactions: (params: LedgerTransactionListParams) => ['finance', 'transactions', params] as const,
  transaction: (id: Uuid) => ['finance', 'transaction', id] as const,
  trialBalance: () => ['finance', 'trial-balance'] as const,
  items: (params: SettlementItemListParams) => ['finance', 'settlement-items', params] as const,
  batches: (params: SettlementBatchListParams) => ['finance', 'batches', params] as const,
  batch: (id: Uuid) => ['finance', 'batch', id] as const,
  payouts: (params: PayoutListParams) => ['finance', 'payouts', params] as const,
  rules: (params: CommissionRuleListParams) => ['finance', 'commission-rules', params] as const,
  payoutAccounts: (params: PayoutAccountListParams) => ['finance', 'payout-accounts', params] as const,
  revenue: (params: RevenueReportParams) => ['finance', 'revenue-report', params] as const,
  booking: (id: Uuid) => ['finance', 'booking', id] as const,
  proofDocs: (orderId: Uuid) => ['finance', 'proof-docs', orderId] as const,
  adjustments: (params: LedgerAdjustmentListParams) => ['finance', 'adjustments', params] as const,
  documents: (params: SettlementDocumentListParams) => ['finance', 'settlement-documents', params] as const,
  reviewCounts: () => ['finance', 'review-counts'] as const,
};

/** Lookup lists (scope pickers) live outside the finance tree and change rarely. */
export const lookupKeys = {
  hospitals: (q: string) => ['finance-lookup', 'hospitals', q] as const,
  agents: (q: string) => ['finance-lookup', 'agents', q] as const,
  specialties: () => ['finance-lookup', 'specialties'] as const,
  procedures: (q: string) => ['finance-lookup', 'procedures', q] as const,
};

function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: financeKeys.all });
}

// ---------------------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------------------
export const useFinanceSummary = () =>
  useQuery({ queryKey: financeKeys.summary(), queryFn: () => financeApi.staffSummary() });

export const useOrders = (params: OrderFilters) =>
  useQuery({
    queryKey: financeKeys.orders(params),
    // the date window is an additive query filter; the shared typed endpoint accepts any params object
    queryFn: () => paymentsApi.listOrders(params as OrderListParams),
    placeholderData: keepPreviousData,
  });

export const useOrder = (id: Uuid | null | undefined) =>
  useQuery({
    queryKey: financeKeys.order(id ?? ''),
    queryFn: () => paymentsApi.getOrder(id as Uuid),
    enabled: Boolean(id),
  });

export const useRefunds = (params: RefundListParams) =>
  useQuery({
    queryKey: financeKeys.refunds(params),
    queryFn: () => paymentsApi.listRefunds(params),
    placeholderData: keepPreviousData,
  });

export const useLedgerAccounts = (params: LedgerAccountListParams) =>
  useQuery({
    queryKey: financeKeys.accounts(params),
    queryFn: () => financeApi.listAccounts(params),
    placeholderData: keepPreviousData,
  });

export const useAccountEntries = (id: Uuid, params: PageParams) =>
  useQuery({
    queryKey: financeKeys.accountEntries(id, params),
    queryFn: () => financeApi.accountEntries(id, params),
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
  });

export const useTransactions = (params: LedgerTransactionListParams) =>
  useQuery({
    queryKey: financeKeys.transactions(params),
    queryFn: () => financeApi.listTransactions(params),
    placeholderData: keepPreviousData,
  });

export const useTransaction = (id: Uuid | null) =>
  useQuery({
    queryKey: financeKeys.transaction(id ?? ''),
    queryFn: () => financeApi.getTransaction(id as Uuid),
    enabled: Boolean(id),
  });

export const useTrialBalance = () =>
  useQuery({ queryKey: financeKeys.trialBalance(), queryFn: () => financeApi.trialBalance() });

export const useSettlementItems = (params: SettlementItemListParams) =>
  useQuery({
    queryKey: financeKeys.items(params),
    queryFn: () => financeApi.listItems(params),
    placeholderData: keepPreviousData,
  });

export const useBatches = (params: SettlementBatchListParams) =>
  useQuery({
    queryKey: financeKeys.batches(params),
    queryFn: () => financeApi.listBatches(params),
    placeholderData: keepPreviousData,
  });

export const useBatch = (id: Uuid) =>
  useQuery({ queryKey: financeKeys.batch(id), queryFn: () => financeApi.getBatch(id), enabled: Boolean(id) });

export const usePayouts = (params: PayoutListParams) =>
  useQuery({
    queryKey: financeKeys.payouts(params),
    queryFn: () => financeApi.listPayouts(params),
    placeholderData: keepPreviousData,
  });

export const useCommissionRules = (params: CommissionRuleListParams) =>
  useQuery({
    queryKey: financeKeys.rules(params),
    queryFn: async () => asList(await financeApi.listCommissionRules(params)),
  });

export const usePayoutAccounts = (params: PayoutAccountListParams) =>
  useQuery({
    queryKey: financeKeys.payoutAccounts(params),
    queryFn: async () => asList(await financeApi.listPayoutAccounts(params)),
  });

export const useRevenueReport = (params: RevenueReportParams) =>
  useQuery({
    queryKey: financeKeys.revenue(params),
    queryFn: () => adminApi.revenueReport(params),
    placeholderData: keepPreviousData,
  });

export const useBooking = (id: Uuid | null | undefined) =>
  useQuery({
    queryKey: financeKeys.booking(id ?? ''),
    queryFn: () => bookingsApi.get(id as Uuid),
    enabled: Boolean(id),
    staleTime: 60_000,
  });

/** Payment-proof documents attached to a case (bank-transfer reconciliation). */
/** Proofs for a bank-transfer order, resolved server-side (linked document, case uploads and the patient's
 *  unlinked `payment_proof` uploads since the order was created). */
export const useProofDocuments = (orderId: Uuid | null | undefined) =>
  useQuery({
    queryKey: financeKeys.proofDocs(orderId ?? ''),
    queryFn: async () => asList(await paymentsApi.proofDocuments(orderId as Uuid)),
    enabled: Boolean(orderId),
  });

export const useAdjustments = (params: LedgerAdjustmentListParams) =>
  useQuery({
    queryKey: financeKeys.adjustments(params),
    queryFn: () => financeApi.listAdjustments(params),
    placeholderData: keepPreviousData,
  });

export const useSettlementDocuments = (params: SettlementDocumentListParams) =>
  useQuery({
    queryKey: financeKeys.documents(params),
    queryFn: () => financeApi.listSettlementDocuments(params),
    placeholderData: keepPreviousData,
  });

export const useSettlementDocument = (id: Uuid | null | undefined) =>
  useQuery({
    queryKey: ['finance', 'settlement-document', id ?? ''] as const,
    queryFn: () => financeApi.getSettlementDocument(id as Uuid),
    enabled: Boolean(id),
  });

/** Counts behind the "Awaiting finance review" tile. `null` = not visible to this role / not available. */
export interface FinanceReviewCounts {
  amountReviews: number | null;
  markPaidApprovals: number | null;
  refunds: number | null;
  batches: number | null;
  /** payouts with a recorded UTR awaiting a second finance user */
  payoutConfirmations: number | null;
  /** payouts whose gateway outcome is unknown (needs_reconciliation) */
  payoutReconciliations: number | null;
  /** payout failure / reversal requests awaiting a second finance user */
  payoutReversals: number | null;
  adjustments: number | null;
}

async function totalOf(p: Promise<{ total: number }>): Promise<number | null> {
  try {
    return (await p).total;
  } catch {
    return null;
  }
}

/** Payout counts from the staff finance summary; null when the summary is unavailable (non-finance roles). */
async function payoutSummaryCounts(): Promise<{ confirm: number | null; reconcile: number | null; reversal: number | null }> {
  try {
    const s = await financeApi.staffSummary();
    return {
      confirm: s.payouts_awaiting_confirmation ?? null,
      reconcile: s.payouts_needs_reconciliation ?? null,
      reversal: s.payout_reversals_pending ?? null,
    };
  } catch {
    return { confirm: null, reconcile: null, reversal: null };
  }
}

export const useFinanceReviewCounts = (enabled = true) =>
  useQuery({
    queryKey: financeKeys.reviewCounts(),
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<FinanceReviewCounts> => {
      const [amountReviews, markPaidApprovals, refunds, batches, payouts, adjustments] = await Promise.all([
        totalOf(paymentsApi.listOrders({ review: 'amount', page_size: 1 })),
        totalOf(paymentsApi.listOrders({ review: 'mark_paid', page_size: 1 })),
        totalOf(paymentsApi.listRefunds({ status: 'requested', page_size: 1 })),
        totalOf(financeApi.listBatches({ status: 'pending_approval', page_size: 1 })),
        payoutSummaryCounts(),
        totalOf(financeApi.listAdjustments({ status: 'pending_approval', page_size: 1 })),
      ]);
      return {
        amountReviews,
        markPaidApprovals,
        refunds,
        batches,
        payoutConfirmations: payouts.confirm,
        payoutReconciliations: payouts.reconcile,
        payoutReversals: payouts.reversal,
        adjustments,
      };
    },
  });

/** Staff directory (GET /admin/staff) to show who requested / approved a maker-checker action. */
export const useStaffDirectory = () =>
  useQuery({
    queryKey: ['finance-lookup', 'staff'] as const,
    queryFn: async () => {
      const list = await adminApi.listStaff();
      return new Map<string, StaffMemberOut>(list.map((s) => [s.id, s]));
    },
    staleTime: 10 * 60_000,
  });

// lookups ----------------------------------------------------------------------------------------------
export const useHospitalLookup = (q: string, enabled = true) =>
  useQuery({
    queryKey: lookupKeys.hospitals(q),
    queryFn: () => adminApi.listHospitals({ q: q || undefined, page_size: 50 }),
    enabled,
    staleTime: 5 * 60_000,
  });

export const useAgentLookup = (q: string, enabled = true) =>
  useQuery({
    queryKey: lookupKeys.agents(q),
    queryFn: () => adminApi.listAgents({ q: q || undefined, page_size: 50 }),
    enabled,
    staleTime: 5 * 60_000,
  });

export const useSpecialtyLookup = (enabled = true) =>
  useQuery({
    queryKey: lookupKeys.specialties(),
    queryFn: () => catalogApi.listSpecialties(),
    enabled,
    staleTime: 10 * 60_000,
  });

export const useProcedureLookup = (q: string, enabled = true) =>
  useQuery({
    queryKey: lookupKeys.procedures(q),
    queryFn: () => catalogApi.listProcedures({ q: q || undefined }),
    enabled,
    staleTime: 5 * 60_000,
  });

// ---------------------------------------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------------------------------------
export function useMarkOrderPaid() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, body }: { id: Uuid; body: OrderMarkPaidIn }) => paymentsApi.markPaid(id, body),
    onSuccess: invalidate,
  });
}

export function useApproveMarkPaid() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, body }: { id: Uuid; body: MarkPaidApproveIn }) => paymentsApi.approveMarkPaid(id, body),
    // settle either way: on 409 mark_paid_request_changed the checker must review the refreshed request
    onSettled: invalidate,
  });
}

export function useRejectMarkPaid() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason?: string }) =>
      paymentsApi.rejectMarkPaid(id, reason ? { reason } : {}),
    onSuccess: invalidate,
  });
}

export function useAmountReview() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, body }: { id: Uuid; body: AmountReviewIn }) => paymentsApi.amountReview(id, body),
    onSuccess: invalidate,
  });
}

/** Checker: echoes the reviewed UTR + amount (SEC-063 binding; 409 `mark_paid_request_changed` -> refetch). */
export function useApprovePayoutPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payout: PayoutOut) =>
      financeApi.approvePayoutPaid(payout.id, {
        request_id: payout.paid_request_id ?? '',
        reference: payout.utr ?? '',
        amount_minor: payout.amount_minor,
      }),
    // settle either way: on 409 the list must be refetched so the checker reviews the new request
    onSettled: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

/** Checker: applies a pending failure / reversal request (403 `second_approver_required` for the requester). */
export function useApprovePayoutFailure() {
  const qc = useQueryClient();
  return useMutation({
    // body = the reviewed reversal request (payout.reversal_request_id + reversal_reference), SEC-063
    mutationFn: ({ id, body }: { id: Uuid; body: PayoutFailureApproveIn }) => financeApi.approvePayoutFailure(id, body),
    // settle either way: on 409 mark_failed_request_changed the checker must review the refreshed request
    onSettled: () => qc.invalidateQueries({ queryKey: financeKeys.all }),
  });
}

export function useRejectPayoutFailure() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason?: string }) =>
      financeApi.rejectPayoutFailure(id, reason ? { reason } : {}),
    onSuccess: invalidate,
  });
}

export function useRejectPayoutPaid() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason?: string }) =>
      financeApi.rejectPayoutPaid(id, reason ? { reason } : {}),
    onSuccess: invalidate,
  });
}

export function useCreateAdjustment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: LedgerAdjustmentCreateIn) => financeApi.createAdjustment(body),
    onSuccess: invalidate,
  });
}

export function useApproveAdjustment() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: Uuid) => financeApi.approveAdjustment(id), onSuccess: invalidate });
}

export function useRejectAdjustment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason: string }) => financeApi.rejectAdjustment(id, { reason }),
    onSuccess: invalidate,
  });
}

export function useCreateRefund() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (body: RefundCreateIn) => paymentsApi.createRefund(body), onSuccess: invalidate });
}

export function useApproveRefund() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: Uuid) => paymentsApi.approveRefund(id), onSuccess: invalidate });
}

export function useRejectRefund() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason: string }) => paymentsApi.rejectRefund(id, { reason }),
    onSuccess: invalidate,
  });
}

export function useHoldItem() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason: string }) => financeApi.holdItem(id, { reason }),
    onSuccess: invalidate,
  });
}

export function useReleaseItem() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason?: string }) =>
      financeApi.releaseItem(id, reason ? { reason } : {}),
    onSuccess: invalidate,
  });
}

export function useCreateBatch() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: (body: SettlementBatchCreateIn) => financeApi.createBatch(body),
    onSuccess: invalidate,
  });
}

export function useApproveBatch() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: Uuid) => financeApi.approveBatch(id), onSuccess: invalidate });
}

export function useRejectBatch() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: Uuid; reason: string }) => financeApi.rejectBatch(id, { reason }),
    onSuccess: invalidate,
  });
}

export function useProcessBatch() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: Uuid) => financeApi.processBatch(id), onSuccess: invalidate });
}

export function useMarkPayoutPaid() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, utr }: { id: Uuid; utr: string }) => financeApi.markPayoutPaid(id, { utr }),
    onSuccess: invalidate,
  });
}

export function useMarkPayoutFailed() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, reason, reference }: { id: Uuid; reason: string; reference?: string }) =>
      financeApi.markPayoutFailed(id, reference ? { reason, reference } : { reason }),
    onSuccess: invalidate,
  });
}

export function useSaveCommissionRule() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, body }: { id?: Uuid; body: CommissionRuleIn }) =>
      id
        ? // CommissionRulePatch accepts only these (scope/targets are fixed at creation; extra fields -> 422)
          financeApi.updateCommissionRule(id, {
            rate_bps: body.rate_bps,
            effective_from: body.effective_from,
            effective_to: body.effective_to,
            is_active: body.is_active,
          })
        : financeApi.createCommissionRule(body),
    onSuccess: invalidate,
  });
}

export function useToggleCommissionRule() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, is_active }: { id: Uuid; is_active: boolean }) =>
      financeApi.updateCommissionRule(id, { is_active }),
    onSuccess: invalidate,
  });
}

export function useVerifyPayoutAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: Uuid) => financeApi.verifyPayoutAccount(id), onSuccess: invalidate });
}

export function useExportCsv() {
  return useMutation({ mutationFn: (params: ExportParams) => adminApi.exportCsv(params) });
}

/** Plain-array endpoints tolerate a paginated envelope too (`{items: [...]}`), so tables never break. */
function asList<T>(value: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value?.items ?? [];
}
