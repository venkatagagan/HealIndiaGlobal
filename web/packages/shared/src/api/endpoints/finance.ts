import { api, isApiError } from '../client';
import type {
  CommissionRuleIn,
  CommissionRuleListParams,
  CommissionRuleOut,
  FinanceSummary,
  LedgerAdjustmentCreateIn,
  LedgerAdjustmentListParams,
  LedgerAdjustmentOut,
  LedgerAccountListParams,
  LedgerAccountOut,
  AccountEntryListParams,
  AccountEntryOut,
  LedgerAccountSummaryOut,
  LedgerAdjustmentStatusCounts,
  LedgerTransactionListParams,
  LedgerTransactionOut,
  Page,
  PayeeFinanceSummary,
  PayoutAccountIn,
  PayoutAccountListParams,
  PayoutAccountOut,
  PayoutAccountUpdateIn,
  PayoutListParams,
  PayoutMarkFailedIn,
  PayoutMarkPaidApproveIn,
  PayoutMarkPaidIn,
  PayoutFailureApproveIn,
  PayoutOut,
  ReasonIn,
  SettlementBatchCreateIn,
  SettlementBatchListParams,
  SettlementBatchOut,
  SettlementDocumentListParams,
  SettlementDocumentOut,
  SettlementItemListParams,
  SettlementItemOut,
  SettlementListCounts,
  StaffFinanceSummary,
  StatementParams,
  StatementRow,
  TrialBalanceOut,
  Uuid,
} from '../types';
import { seg } from './_util';

/** 403 `maker_checker`: the same user may not do both steps (batch maker/approver, payout-account submitter/verifier). */
export function isMakerChecker(error: unknown): boolean {
  return isApiError(error) && error.code === 'maker_checker';
}

/** 400 `reference_required`: failing a processed / needs_reconciliation payout needs a bank or gateway reference. */
export function isReferenceRequired(error: unknown): boolean {
  return isApiError(error) && error.code === 'reference_required';
}

/** 409 `mark_failed_request_changed` (SEC-063): the pending payout failure / reversal request changed since it was reviewed. */
export function isMarkFailedRequestChanged(error: unknown): boolean {
  return isApiError(error) && error.code === 'mark_failed_request_changed';
}

/** 409 `mark_paid_request_changed` (SEC-063): the pending mark-paid request changed since it was reviewed. */
export function isMarkPaidRequestChanged(error: unknown): boolean {
  return isApiError(error) && error.code === 'mark_paid_request_changed';
}

/** PLAN 8.12 - /finance (ledger, settlements, payouts, commission rules, payout accounts, statements). */
export const financeApi = {
  /** staff get StaffFinanceSummary; hospital/agent get PayeeFinanceSummary (narrow with isStaffFinanceSummary) */
  summary: () => api.get<FinanceSummary>('/finance/summary'),
  staffSummary: () => api.get<StaffFinanceSummary>('/finance/summary'),
  payeeSummary: () => api.get<PayeeFinanceSummary>('/finance/summary'),

  // ledger (F)
  listAccounts: (params?: LedgerAccountListParams) =>
    api.get<Page<LedgerAccountOut>>('/finance/ledger/accounts', params),
  /** accounts + summed balances per type for the account-list filters (`type` ignored) */
  accountsSummary: (params?: Omit<LedgerAccountListParams, 'page' | 'page_size' | 'sort' | 'type'>) =>
    api.get<LedgerAccountSummaryOut>('/finance/ledger/accounts/summary', params),
  getAccount: (id: Uuid) => api.get<LedgerAccountOut>(`/finance/ledger/accounts/${seg(id)}`),
  accountEntries: (accountId: Uuid, params?: AccountEntryListParams) =>
    api.get<Page<AccountEntryOut>>(`/finance/ledger/accounts/${seg(accountId)}/entries`, params),
  listTransactions: (params?: LedgerTransactionListParams) =>
    api.get<Page<LedgerTransactionOut>>('/finance/ledger/transactions', params),
  getTransaction: (id: Uuid) => api.get<LedgerTransactionOut>(`/finance/ledger/transactions/${seg(id)}`),
  trialBalance: () => api.get<TrialBalanceOut>('/finance/ledger/trial-balance'),

  // ledger adjustments (F; maker-checker: a different finance user approves; 403 second_approver_required)
  listAdjustments: (params?: LedgerAdjustmentListParams) =>
    api.get<Page<LedgerAdjustmentOut>>('/finance/ledger/adjustments', params),
  /** adjustments per status for the list filters (`status` ignored) */
  adjustmentStatusCounts: (params?: Omit<LedgerAdjustmentListParams, 'page' | 'page_size' | 'sort' | 'status'>) =>
    api.get<LedgerAdjustmentStatusCounts>('/finance/ledger/adjustments/status-counts', params),
  getAdjustment: (id: Uuid) => api.get<LedgerAdjustmentOut>(`/finance/ledger/adjustments/${seg(id)}`),
  createAdjustment: (body: LedgerAdjustmentCreateIn) =>
    api.post<LedgerAdjustmentOut>('/finance/ledger/adjustments', body),
  approveAdjustment: (id: Uuid) =>
    api.post<LedgerAdjustmentOut>(`/finance/ledger/adjustments/${seg(id)}/approve`, {}),
  rejectAdjustment: (id: Uuid, body: ReasonIn) =>
    api.post<LedgerAdjustmentOut>(`/finance/ledger/adjustments/${seg(id)}/reject`, body),

  // settlement items (F; H/A see own)
  listItems: (params?: SettlementItemListParams) =>
    api.get<Page<SettlementItemOut>>('/finance/settlements/items', params),
  holdItem: (id: Uuid, body: ReasonIn) =>
    api.post<SettlementItemOut>(`/finance/settlements/items/${seg(id)}/hold`, body),
  releaseItem: (id: Uuid, body: Partial<ReasonIn> = {}) =>
    api.post<SettlementItemOut>(`/finance/settlements/items/${seg(id)}/release`, body),
  /** items per status for the list filters (`status` ignored) */
  itemStatusCounts: (params?: Omit<SettlementItemListParams, 'page' | 'page_size' | 'sort' | 'status'>) =>
    api.get<SettlementListCounts>('/finance/settlements/items/status-counts', params),

  // batches (maker-checker: approver must differ from creator)
  createBatch: (body: SettlementBatchCreateIn) =>
    api.post<SettlementBatchOut>('/finance/settlements/batches', body),
  listBatches: (params?: SettlementBatchListParams) =>
    api.get<Page<SettlementBatchOut>>('/finance/settlements/batches', params),
  /** batches per status for the list filters (`status` ignored) + `auto_pending_approval` */
  batchStatusCounts: (params?: Omit<SettlementBatchListParams, 'page' | 'page_size' | 'sort' | 'status'>) =>
    api.get<SettlementListCounts>('/finance/settlements/batches/status-counts', params),
  getBatch: (id: Uuid) => api.get<SettlementBatchOut>(`/finance/settlements/batches/${seg(id)}`),
  approveBatch: (id: Uuid) => api.post<SettlementBatchOut>(`/finance/settlements/batches/${seg(id)}/approve`, {}),
  rejectBatch: (id: Uuid, body: Partial<ReasonIn> = {}) =>
    api.post<SettlementBatchOut>(`/finance/settlements/batches/${seg(id)}/reject`, body),
  processBatch: (id: Uuid) => api.post<SettlementBatchOut>(`/finance/settlements/batches/${seg(id)}/process`, {}),

  // payouts (F; H/A own)
  listPayouts: (params?: PayoutListParams) => api.get<Page<PayoutOut>>('/finance/settlements/payouts', params),
  /** payouts per status for the list filters (`status` / queue flags ignored) + the second-approver queue sizes */
  payoutStatusCounts: (
    params?: Omit<PayoutListParams, 'page' | 'page_size' | 'sort' | 'status' | 'awaiting_confirmation' | 'reversal_pending'>,
  ) => api.get<SettlementListCounts>('/finance/settlements/payouts/status-counts', params),
  getPayout: (id: Uuid) => api.get<PayoutOut>(`/finance/settlements/payouts/${seg(id)}`),
  /** maker: records the UTR (paid_requested_by); a different finance user confirms via approvePayoutPaid */
  markPayoutPaid: (id: Uuid, body: PayoutMarkPaidIn) =>
    api.post<PayoutOut>(`/finance/settlements/payouts/${seg(id)}/mark-paid`, body),
  /** checker: completes the payout; 403 `second_approver_required` for the requester; echoes the reviewed
   *  request (409 `mark_paid_request_changed` if it changed, see isMarkPaidRequestChanged) */
  approvePayoutPaid: (id: Uuid, body: PayoutMarkPaidApproveIn) =>
    api.post<PayoutOut>(`/finance/settlements/payouts/${seg(id)}/mark-paid/approve`, body),
  rejectPayoutPaid: (id: Uuid, body: Partial<ReasonIn> = {}) =>
    api.post<PayoutOut>(`/finance/settlements/payouts/${seg(id)}/mark-paid/reject`, body),
  /** queued/processing: fails at once. processed / needs_reconciliation: records a request (reference required,
   *  400 `reference_required`) that a different finance user applies via approvePayoutFailure */
  markPayoutFailed: (id: Uuid, body: PayoutMarkFailedIn) =>
    api.post<PayoutOut>(`/finance/settlements/payouts/${seg(id)}/mark-failed`, body),
  /** checker: applies a pending failure/reversal; 403 `second_approver_required` for the requester */
  approvePayoutFailure: (id: Uuid, body: PayoutFailureApproveIn) =>
    api.post<PayoutOut>(`/finance/settlements/payouts/${seg(id)}/mark-failed/approve`, body),
  rejectPayoutFailure: (id: Uuid, body: Partial<ReasonIn> = {}) =>
    api.post<PayoutOut>(`/finance/settlements/payouts/${seg(id)}/mark-failed/reject`, body),

  // commission rules (F, AD)
  listCommissionRules: (params?: CommissionRuleListParams) =>
    api.get<CommissionRuleOut[]>('/finance/commission-rules', params),
  /** the same endpoint typed as the page it returns */
  listCommissionRulesPage: (params?: CommissionRuleListParams) =>
    api.get<Page<CommissionRuleOut>>('/finance/commission-rules', params),
  createCommissionRule: (body: CommissionRuleIn) => api.post<CommissionRuleOut>('/finance/commission-rules', body),
  /** CommissionRulePatch: scope and targets are fixed at creation */
  updateCommissionRule: (id: Uuid, body: Partial<Pick<CommissionRuleIn, 'rate_bps' | 'effective_from' | 'effective_to' | 'is_active'>>) =>
    api.patch<CommissionRuleOut>(`/finance/commission-rules/${seg(id)}`, body),

  // payout accounts (H/A own; F all) - account number is write-only, returned masked
  listPayoutAccounts: (params?: PayoutAccountListParams) =>
    api.get<PayoutAccountOut[]>('/finance/payout-accounts', params),
  /** the same endpoint typed as the page it returns */
  listPayoutAccountsPage: (params?: PayoutAccountListParams) =>
    api.get<Page<PayoutAccountOut>>('/finance/payout-accounts', params),
  /** counts.unverified / verified (active accounts) / disabled for the list filters */
  payoutAccountVerificationCounts: (params?: Omit<PayoutAccountListParams, 'page' | 'page_size' | 'sort' | 'status' | 'is_verified'>) =>
    api.get<SettlementListCounts>('/finance/payout-accounts/verification-counts', params),
  createPayoutAccount: (body: PayoutAccountIn) => api.post<PayoutAccountOut>('/finance/payout-accounts', body),
  updatePayoutAccount: (id: Uuid, body: PayoutAccountUpdateIn) =>
    api.patch<PayoutAccountOut>(`/finance/payout-accounts/${seg(id)}`, body),
  verifyPayoutAccount: (id: Uuid) =>
    api.post<PayoutAccountOut>(`/finance/payout-accounts/${seg(id)}/verify`, {}),

  // statements (H, A)
  statements: (params?: StatementParams) => api.get<StatementRow[]>('/finance/statements', params),

  // settlement documents: commission invoices / credit notes (hospitals), commission statements (agents)
  listSettlementDocuments: (params?: SettlementDocumentListParams) =>
    api.get<Page<SettlementDocumentOut>>('/finance/settlements/invoices', params),
  /** documents per kind for the list filters (`kind` ignored) */
  settlementDocumentKindCounts: (params?: Omit<SettlementDocumentListParams, 'page' | 'page_size' | 'sort' | 'kind'>) =>
    api.get<SettlementListCounts>('/finance/settlements/invoices/kind-counts', params),
  getSettlementDocument: (id: Uuid) =>
    api.get<SettlementDocumentOut>(`/finance/settlements/invoices/${seg(id)}`),
  downloadSettlementDocumentPdf: (doc: Pick<SettlementDocumentOut, 'id' | 'invoice_number'>) =>
    api.downloadAndSave(
      `/finance/settlements/invoices/${seg(doc.id)}/pdf`,
      `${doc.invoice_number.replace(/[^\w.-]+/g, '_')}.pdf`,
    ),
};
