/**
 * Finance maker-checker and review building blocks (be-payments controls, INTEGRATION_BACKLOG #43):
 * bank-transfer mark-paid approval, amount-difference review, refund dual-approval threshold, payout
 * confirmation by a second finance user, and the "Awaiting finance review" tile.
 * The API is authoritative (403 `second_approver_required`); the UI only explains and pre-disables.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, ClipboardCheck, RotateCcw, ShieldAlert, X } from 'lucide-react';
import {
  isMarkFailedRequestChanged,
  isMarkPaidRequestChanged,
  isSecondApproverRequired,
  type AmountReviewOut,
  type OrderReviewKind,
  type PaymentOrderDetail,
  type PayoutOut,
  type RefundOut,
  type Uuid,
} from '@hig/shared/api';
import { formatDateTime, formatMoney } from '../lib/shared';
import {
  useAmountReview,
  useApproveMarkPaid,
  useApprovePayoutFailure,
  useApprovePayoutPaid,
  useFinanceReviewCounts,
  useRejectMarkPaid,
  useRejectPayoutFailure,
  useRejectPayoutPaid,
  useStaffDirectory,
  type FinanceReviewCounts,
} from '../api/queries';
import { useFinancePermissions, type FinancePermissions } from '../lib/permissions';
import { useSettings } from '../../ops/lib/settings';
import { opsPaths } from '../../ops/lib/paths';
import { financePath } from '../paths';
import { Mono, Money, notifyError, notifySuccess, ReasonDialog, StatusBadge } from './finance';
import { Badge, Button, Callout, Card, DescriptionList, Field, Modal, Textarea } from './ui';

// ---------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------
/** Resolves a staff user id to a display name ("you" for the signed-in user). */
export function useStaffName(): (id: Uuid | null | undefined) => string {
  const perms = useFinancePermissions();
  const { data } = useStaffDirectory();
  return (id) => {
    if (!id) return '—';
    if (perms.userId && id === perms.userId) return `you${perms.userName ? ` (${perms.userName})` : ''}`;
    const s = data?.get(id);
    return s ? s.full_name : `user ${id.slice(0, 8)}…`;
  };
}

/** Error toast that spells out the maker-checker rule for 403 `second_approver_required`. */
export function notifyApprovalError(error: unknown, fallback: string, what = 'this action'): void {
  if (isSecondApproverRequired(error)) {
    notifyError(
      new Error(`A different finance user must approve ${what}: you requested it, so you cannot also approve it.`),
    );
    return;
  }
  if (isMarkPaidRequestChanged(error) || isMarkFailedRequestChanged(error)) {
    notifyError(
      new Error('This request changed after you opened it. The latest details have been reloaded: please review it again.'),
    );
    return;
  }
  notifyError(error, fallback);
}

function SameUserNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export const REVIEW_KIND_LABELS: Record<OrderReviewKind, string> = {
  amount: 'Amount review',
  mark_paid: 'Awaiting 2nd approval',
};

/** Badge for `PaymentOrderOut.review_required`. */
export function ReviewBadge({ kind }: { kind: OrderReviewKind }) {
  return <Badge tone="warning">{REVIEW_KIND_LABELS[kind]}</Badge>;
}

// ---------------------------------------------------------------------------------------------------------
// Bank-transfer mark-paid (maker-checker)
// ---------------------------------------------------------------------------------------------------------
export function MarkPaidRequestPanel({ order }: { order: PaymentOrderDetail }) {
  const req = order.mark_paid_request;
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const approve = useApproveMarkPaid();
  const reject = useRejectMarkPaid();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  if (!req) return null;

  const pending = req.status === 'pending';
  const isRequester = Boolean(perms.userId && req.requested_by === perms.userId);
  const canDecide = perms.finance && pending;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Bank transfer confirmation <StatusBadge status={pending ? 'pending_approval' : req.status} />
        </span>
      }
    >
      <div className="space-y-3 p-4">
        {pending && (
          <Callout tone="warning" title="Awaiting a second finance user">
            The order stays <strong>pending</strong> until a different finance user checks the bank statement and
            approves this request. Approving applies the capture (escrow, receipt, booking); rejecting discards it.
          </Callout>
        )}
        <DescriptionList
          columns={3}
          items={[
            { label: 'Bank reference / UTR', value: <Mono>{req.reference}</Mono> },
            { label: 'Amount received', value: <Money minor={req.amount_minor} currency={order.currency} /> },
            { label: 'Requested by', value: `${nameOf(req.requested_by)} · ${formatDateTime(req.requested_at)}` },
            ...(req.decided_by
              ? [
                  {
                    label: req.status === 'approved' ? 'Approved by' : 'Rejected by',
                    value: `${nameOf(req.decided_by)} · ${formatDateTime(req.decided_at)}`,
                  },
                ]
              : []),
            ...(req.reason ? [{ label: 'Reason', value: req.reason }] : []),
          ]}
        />
        {canDecide && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setConfirming(true)}
                disabled={isRequester}
                title={isRequester ? 'You requested this; a different finance user must approve it' : undefined}
                icon={<Check className="size-4" aria-hidden />}
              >
                Approve payment
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(true)} icon={<X className="size-4" aria-hidden />}>
                Reject request
              </Button>
            </div>
            {isRequester && (
              <SameUserNote>
                You recorded this request, so you cannot approve it (maker-checker). Ask another finance user to
                approve it; you can still reject it if it was entered by mistake.
              </SameUserNote>
            )}
          </div>
        )}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Approve bank transfer"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={approve.isPending}>
              Cancel
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approve.mutate(
                  // echo the reviewed request (SEC-063): 409 mark_paid_request_changed if the maker replaced it
                  { id: order.id, body: { request_id: req.id ?? null, reference: req.reference, amount_minor: req.amount_minor } },
                  {
                  onSuccess: () => {
                    notifySuccess(`${order.order_number} marked as paid`);
                    setConfirming(false);
                  },
                  onError: (e) => notifyApprovalError(e, 'Could not approve the payment', 'this bank transfer'),
                })
              }
            >
              Approve payment
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Confirm that <strong>{formatMoney(req.amount_minor, order.currency)}</strong> with reference{' '}
          <strong>{req.reference}</strong> has been credited to the platform bank account. The order is captured and
          posted to the ledger; this cannot be undone except by a refund.
        </p>
      </Modal>

      <ReasonDialog
        open={rejecting}
        title="Reject mark-paid request"
        description={`${req.reference} · ${formatMoney(req.amount_minor, order.currency)}`}
        confirmLabel="Reject request"
        required={false}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: order.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess('Mark-paid request rejected; the order stays pending');
                setRejecting(false);
              },
              onError: (e) => notifyError(e, 'Could not reject the request'),
            },
          )
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The order stays pending and nothing is posted. A finance user can record a new request once the transfer
          is confirmed.
        </p>
      </ReasonDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Amount-difference review
// ---------------------------------------------------------------------------------------------------------
const REVIEW_OUTCOMES = {
  accept: {
    title: 'Accept the received amount',
    button: 'Accept amount',
    explain:
      'The payment is captured for the amount actually received and applied pro rata: the booking is credited with that amount only, and the remaining balance stays due from the patient.',
  },
  return: {
    title: 'Return the payment in full',
    button: 'Return payment',
    explain:
      'The whole payment is refunded to the payer through the gateway. Nothing is posted to the books and the order stays unpaid, so the patient has to pay the correct amount again.',
  },
} as const;

export function AmountReviewPanel({ order }: { order: PaymentOrderDetail }) {
  const reviews = order.amount_reviews ?? [];
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const [deciding, setDeciding] = useState<{ review: AmountReviewOut; decision: 'accept' | 'return' } | null>(null);
  if (reviews.length === 0) return null;

  return (
    <Card title={`Amount reviews (${reviews.length})`}>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {reviews.map((r) => {
          const open = r.status === 'pending' || r.status === 'returning';
          const diff = r.received_minor - r.expected_minor;
          return (
            <li key={r.payment_id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={r.status === 'pending' ? 'pending_approval' : r.status} />
                  <span className="text-slate-600 dark:text-slate-300">
                    Expected <strong>{formatMoney(r.expected_minor, r.currency)}</strong>, received{' '}
                    <strong>{formatMoney(r.received_minor, r.currency)}</strong>
                  </span>
                  <Badge tone={diff < 0 ? 'danger' : 'warning'}>
                    {diff < 0 ? 'Short by ' : 'Over by '}
                    {formatMoney(Math.abs(diff), r.currency)}
                  </Badge>
                </div>
                <span className="text-xs text-slate-500">
                  Held {formatDateTime(r.held_at)} · payment <Mono>{r.payment_id.slice(0, 8)}</Mono>
                </span>
              </div>
              {r.decided_by && (
                <p className="text-xs text-slate-500">
                  Decided by {nameOf(r.decided_by)} · {formatDateTime(r.decided_at)}
                  {r.note && <> · “{r.note}”</>}
                </p>
              )}
              {r.status === 'returning' && (
                <Callout tone="warning">
                  A full return was started but the gateway did not confirm it. Retry the return (it is idempotent).
                </Callout>
              )}
              {open && perms.finance && (
                <div className="flex flex-wrap gap-2">
                  {r.status === 'pending' && (
                    <Button size="sm" onClick={() => setDeciding({ review: r, decision: 'accept' })} icon={<Check className="size-3.5" aria-hidden />}>
                      Accept amount
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setDeciding({ review: r, decision: 'return' })}
                    icon={<RotateCcw className="size-3.5" aria-hidden />}>
                    {r.status === 'returning' ? 'Retry return' : 'Return in full'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <AmountReviewDialog
        orderId={order.id}
        target={deciding}
        onClose={() => setDeciding(null)}
      />
    </Card>
  );
}

function AmountReviewDialog({ orderId, target, onClose }: {
  orderId: Uuid;
  target: { review: AmountReviewOut; decision: 'accept' | 'return' } | null;
  onClose: () => void;
}) {
  const outcome = target ? REVIEW_OUTCOMES[target.decision] : null;
  return (
    <Modal open={target !== null} onClose={onClose} title={outcome?.title ?? ''} size="sm">
      {target && outcome && <AmountReviewForm key={`${target.review.payment_id}-${target.decision}`} orderId={orderId} target={target} onDone={onClose} />}
    </Modal>
  );
}

function AmountReviewForm({ orderId, target, onDone }: {
  orderId: Uuid;
  target: { review: AmountReviewOut; decision: 'accept' | 'return' };
  onDone: () => void;
}) {
  const mutation = useAmountReview();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const outcome = REVIEW_OUTCOMES[target.decision];
  const r = target.review;
  const trimmed = note.trim();
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!trimmed) return;
        mutation.mutate(
          { id: orderId, body: { payment_id: r.payment_id, decision: target.decision, note: trimmed } },
          {
            onSuccess: () => {
              notifySuccess(target.decision === 'accept' ? 'Received amount accepted' : 'Payment returned to the payer');
              onDone();
            },
            onError: (err) => notifyError(err, 'Could not record the decision'),
          },
        );
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Expected {formatMoney(r.expected_minor, r.currency)}, received {formatMoney(r.received_minor, r.currency)}.
      </p>
      <Callout tone={target.decision === 'accept' ? 'info' : 'warning'}>{outcome.explain}</Callout>
      <Field label="Note (kept in the audit log)" required error={touched && !trimmed ? 'A note is required' : null} hint={`${trimmed.length}/1000`}>
        {(p) => <Textarea {...p} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} onBlur={() => setTouched(true)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant={target.decision === 'accept' ? 'primary' : 'danger'} loading={mutation.isPending}>
          {outcome.button}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Refund dual approval
// ---------------------------------------------------------------------------------------------------------
export const REFUND_THRESHOLD_SETTING = 'refund_dual_approval_threshold_minor';
const DEFAULT_REFUND_THRESHOLD_MINOR = 5_000_000;

/** Platform setting (INR minor units); 0 = every refund needs a second approver. */
export function useRefundDualApprovalThreshold(): { minor: number; isDefault: boolean } {
  const { data } = useSettings();
  const setting = data?.find((s) => s.key === REFUND_THRESHOLD_SETTING);
  return typeof setting?.value === 'number'
    ? { minor: setting.value, isDefault: Boolean(setting.is_default) }
    : { minor: DEFAULT_REFUND_THRESHOLD_MINOR, isDefault: true };
}

/** true when the API would refuse this approver (requester approving above the threshold). */
export function needsSecondRefundApprover(refund: RefundOut, perms: Pick<FinancePermissions, 'userId'>, thresholdMinor: number): boolean {
  return Boolean(perms.userId && refund.requested_by === perms.userId && refund.base_amount_minor > thresholdMinor);
}

export function RefundThresholdNote() {
  const { minor, isDefault } = useRefundDualApprovalThreshold();
  return (
    <Callout tone="info" title="Dual approval">
      {minor === 0 ? (
        <>Every refund must be approved by a finance user other than the one who requested it.</>
      ) : (
        <>
          Refunds above <strong>{formatMoney(minor, 'INR')}</strong> (converted to INR) must be approved by a finance user
          other than the one who requested them. Smaller refunds can be approved by the requester.
        </>
      )}{' '}
      <span className="text-xs">
        {isDefault ? 'Default threshold; finance can change it in ' : 'Threshold set in '}
        <Link to={opsPaths.settings} className="underline">
          Settings
        </Link>
        .
      </span>
    </Callout>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Payout manual mark-paid confirmation
// ---------------------------------------------------------------------------------------------------------
/** A UTR has been recorded and waits for a different finance user to confirm. */
export function isPayoutAwaitingConfirmation(p: PayoutOut): boolean {
  if (typeof p.awaiting_confirmation === 'boolean') return p.awaiting_confirmation;
  return (
    Boolean(p.paid_requested_by) &&
    !p.paid_confirmed_by &&
    (p.status === 'queued' || p.status === 'processing' || p.status === 'needs_reconciliation')
  );
}

/** A failure / reversal request (processed or needs_reconciliation payout) waits for a second finance user. */
export function isPayoutReversalPending(p: PayoutOut): boolean {
  return Boolean(p.reversal_requested_by) && (p.status === 'processed' || p.status === 'needs_reconciliation');
}

export function PayoutConfirmationActions({ payout }: { payout: PayoutOut }) {
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const approve = useApprovePayoutPaid();
  const reject = useRejectPayoutPaid();
  const [rejecting, setRejecting] = useState(false);
  const isRequester = Boolean(perms.userId && payout.paid_requested_by === perms.userId);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs text-slate-500">
        UTR <Mono>{payout.utr ?? '—'}</Mono> by {nameOf(payout.paid_requested_by)}
      </span>
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          disabled={isRequester}
          loading={approve.isPending}
          title={isRequester ? 'You recorded this UTR; a different finance user must confirm it' : undefined}
          onClick={() =>
            approve.mutate(payout, {
              onSuccess: () => notifySuccess('Payout confirmed as paid'),
              onError: (e) => notifyApprovalError(e, 'Could not confirm the payout', 'this payout'),
            })
          }
        >
          Confirm paid
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
          Reject
        </Button>
      </div>
      {isRequester && <SameUserNote>Another finance user must confirm.</SameUserNote>}
      <ReasonDialog
        open={rejecting}
        title="Reject recorded UTR"
        description={`${payout.payee_name ?? 'Payee'} · ${formatMoney(payout.amount_minor, payout.currency)}`}
        confirmLabel="Reject"
        required={false}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: payout.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess('UTR rejected; the payout is back in the queue');
                setRejecting(false);
              },
              onError: (e) => notifyError(e, 'Could not reject the UTR'),
            },
          )
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The recorded UTR is cleared and the payout stays unpaid. Nothing is posted to the ledger.
        </p>
      </ReasonDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Payout failure / reversal (two-person, SEC-003)
// ---------------------------------------------------------------------------------------------------------
export function PayoutReversalActions({ payout }: { payout: PayoutOut }) {
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const approve = useApprovePayoutFailure();
  const reject = useRejectPayoutFailure();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const isRequester = Boolean(perms.userId && payout.reversal_requested_by === perms.userId);
  const label = `${payout.payee_name ?? 'Payee'} · ${formatMoney(payout.amount_minor, payout.currency)}`;
  const bounced = payout.status === 'processed';
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="max-w-64 text-right text-xs text-slate-500">
        {bounced ? 'Reversal' : 'Failure'} requested by {nameOf(payout.reversal_requested_by)} · ref{' '}
        <Mono>{payout.reversal_reference ?? '—'}</Mono>
      </span>
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="danger"
          disabled={isRequester}
          title={isRequester ? 'You requested this; a different finance user must approve it' : undefined}
          onClick={() => setConfirming(true)}
        >
          {bounced ? 'Approve reversal' : 'Approve failure'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
          Reject
        </Button>
      </div>
      {isRequester && <SameUserNote>You requested this, so another finance user must approve it.</SameUserNote>}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={bounced ? 'Approve payout reversal' : 'Approve payout failure'}
        description={label}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={approve.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={approve.isPending}
              disabled={isRequester}
              onClick={() =>
                approve.mutate(
                  // SEC-063: echo the reviewed reversal request (MarkFailedApproveIn requires both)
                  {
                    id: payout.id,
                    body: { request_id: payout.reversal_request_id ?? '', reference: payout.reversal_reference ?? '' },
                  },
                  {
                  onSuccess: () => {
                    notifySuccess(bounced ? 'Payout reversed; its items are eligible again' : 'Payout marked as failed');
                    setConfirming(false);
                  },
                  onError: (e) => notifyApprovalError(e, 'Could not approve the request', 'this request'),
                })
              }
            >
              Approve
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <DescriptionList
            columns={1}
            items={[
              {
                label: 'Requested by',
                value: `${nameOf(payout.reversal_requested_by)} · ${formatDateTime(payout.reversal_requested_at)}`,
              },
              { label: 'Bank / gateway reference', value: <Mono>{payout.reversal_reference ?? '—'}</Mono> },
              { label: 'Reason', value: payout.reversal_reason ?? '—' },
            ]}
          />
          <p>
            {bounced
              ? 'The payout becomes reversed, its ledger posting is reversed and its items return to eligible for the next batch.'
              : 'The payout fails and its items return to eligible for the next batch.'}{' '}
            Check the reference against the bank statement or the gateway dashboard first.
          </p>
        </div>
      </Modal>
      <ReasonDialog
        open={rejecting}
        title="Reject failure request"
        description={label}
        confirmLabel="Reject request"
        required={false}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: payout.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess('Failure request rejected; the payout is unchanged');
                setRejecting(false);
              },
              onError: (e) => notifyError(e, 'Could not reject the request'),
            },
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// "Awaiting finance review" tile
// ---------------------------------------------------------------------------------------------------------
const REVIEW_ROWS: { key: keyof FinanceReviewCounts; label: string; to: string }[] = [
  { key: 'amountReviews', label: 'Amount differences to review', to: `${financePath('orders')}?review=amount` },
  { key: 'markPaidApprovals', label: 'Bank transfers awaiting 2nd approval', to: `${financePath('reconciliation')}?status=approval` },
  { key: 'refunds', label: 'Refunds awaiting approval', to: `${financePath('refunds')}?status=requested` },
  { key: 'batches', label: 'Settlement batches to approve', to: `${financePath('settlements/batches')}?status=pending_approval` },
  { key: 'payoutConfirmations', label: 'Payouts awaiting UTR confirmation', to: `${financePath('settlements/payouts')}?queue=confirm` },
  { key: 'payoutReconciliations', label: 'Payouts needing reconciliation', to: `${financePath('settlements/payouts')}?queue=reconcile` },
  { key: 'payoutReversals', label: 'Payout failures awaiting 2nd approval', to: `${financePath('settlements/payouts')}?queue=reversal` },
  { key: 'adjustments', label: 'Ledger adjustments to approve', to: `${financePath('ledger/adjustments')}?status=pending_approval` },
];

/** Compact badge for non-finance pages (ops dashboard): finance roles only, hidden when nothing is waiting. */
export function FinanceReviewBanner() {
  const perms = useFinancePermissions();
  const q = useFinanceReviewCounts(perms.finance);
  if (!perms.finance || !q.data) return null;
  const total = REVIEW_ROWS.reduce((n, r) => n + (q.data?.[r.key] ?? 0), 0);
  if (!total) return null;
  return (
    <Link
      to={financePath()}
      className="mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <ClipboardCheck className="size-5 shrink-0" aria-hidden />
      <span className="font-semibold">Awaiting finance review</span>
      <Badge tone="warning">{total}</Badge>
      <span className="ml-auto text-xs underline">Open finance overview</span>
    </Link>
  );
}

export function FinanceReviewTile({ className }: { className?: string }) {
  const q = useFinanceReviewCounts();
  const rows = REVIEW_ROWS.filter((r) => q.data?.[r.key] !== null);
  const total = rows.reduce((n, r) => n + (q.data?.[r.key] ?? 0), 0);
  return (
    <Card
      className={className}
      title={
        <span className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-slate-400" aria-hidden /> Awaiting finance review
          {q.data && <Badge tone={total ? 'warning' : 'success'}>{total}</Badge>}
        </span>
      }
    >
      {q.isLoading ? (
        <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
      ) : q.isError ? (
        <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400">Could not load the review queues.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => {
            const count = q.data?.[r.key] ?? 0;
            return (
              <li key={r.key}>
                <Link
                  to={r.to}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800/60"
                >
                  <span>{r.label}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={count ? 'warning' : 'neutral'}>{count}</Badge>
                    <ArrowRight className="size-4 text-slate-400" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
