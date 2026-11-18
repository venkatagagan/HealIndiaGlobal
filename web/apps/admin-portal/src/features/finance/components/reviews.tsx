/**
 * Finance maker-checker and review building blocks (be-payments controls, INTEGRATION_BACKLOG #43):
 * bank-transfer mark-paid approval, amount-difference review, refund dual-approval threshold, payout
 * confirmation by a second finance user, and the "Awaiting finance review" tile.
 * The API is authoritative (403 `second_approver_required`); the UI only explains and pre-disables.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Trans } from 'react-i18next';
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
import { enumLabel, ft, useFinanceTranslation } from '../lib/i18n';
import { Mono, Money, notifyError, notifySuccess, ReasonDialog, StatusBadge } from './finance';
import { Badge, Button, Callout, Card, DescriptionList, Field, Modal, Textarea } from './ui';

// ---------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------
/** Resolves a staff user id to a display name ("you" for the signed-in user). */
export function useStaffName(): (id: Uuid | null | undefined) => string {
  const { t } = useFinanceTranslation();
  const perms = useFinancePermissions();
  const { data } = useStaffDirectory();
  return (id) => {
    if (!id) return '—';
    if (perms.userId && id === perms.userId)
      return perms.userName ? t('reviews.people.youNamed', { name: perms.userName }) : t('reviews.people.you');
    const s = data?.get(id);
    return s ? s.full_name : t('reviews.people.unknownUser', { id: id.slice(0, 8) });
  };
}

/** What a maker-checker error refers to (one full sentence per target in the catalog). */
export type ApprovalTarget = 'action' | 'bankTransfer' | 'payout' | 'request' | 'refund' | 'refundPayout' | 'adjustment';

/** Error toast that spells out the maker-checker rule for 403 `second_approver_required`. */
export function notifyApprovalError(error: unknown, fallback: string, what: ApprovalTarget = 'action'): void {
  if (isSecondApproverRequired(error)) {
    notifyError(new Error(ft(`reviews.approval.differentUser.${what}`)));
    return;
  }
  if (isMarkPaidRequestChanged(error) || isMarkFailedRequestChanged(error)) {
    notifyError(new Error(ft('reviews.approval.requestChanged')));
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

/** "Amount review" / "Awaiting 2nd approval" in the current UI language (call at render time). */
export function reviewKindLabel(kind: OrderReviewKind): string {
  return enumLabel('reviewKind', kind);
}

/** Badge for `PaymentOrderOut.review_required`. */
export function ReviewBadge({ kind }: { kind: OrderReviewKind }) {
  useFinanceTranslation(); // re-render on language change
  return <Badge tone="warning">{reviewKindLabel(kind)}</Badge>;
}

// ---------------------------------------------------------------------------------------------------------
// Bank-transfer mark-paid (maker-checker)
// ---------------------------------------------------------------------------------------------------------
export function MarkPaidRequestPanel({ order }: { order: PaymentOrderDetail }) {
  const { t } = useFinanceTranslation();
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
          {t('reviews.markPaid.title')} <StatusBadge status={pending ? 'pending_approval' : req.status} />
        </span>
      }
    >
      <div className="space-y-3 p-4">
        {pending && (
          <Callout tone="warning" title={t('reviews.markPaid.awaitingTitle')}>
            <Trans t={t} i18nKey="reviews.markPaid.awaitingBody" components={{ 0: <strong /> }} />
          </Callout>
        )}
        <DescriptionList
          columns={3}
          items={[
            { label: t('reviews.markPaid.reference'), value: <Mono>{req.reference}</Mono> },
            { label: t('reviews.markPaid.amountReceived'), value: <Money minor={req.amount_minor} currency={order.currency} /> },
            { label: t('reviews.requestedBy'), value: t('reviews.byAt', { name: nameOf(req.requested_by), at: formatDateTime(req.requested_at) }) },
            ...(req.decided_by
              ? [
                  {
                    label: req.status === 'approved' ? t('reviews.markPaid.approvedBy') : t('reviews.markPaid.rejectedBy'),
                    value: t('reviews.byAt', { name: nameOf(req.decided_by), at: formatDateTime(req.decided_at) }),
                  },
                ]
              : []),
            ...(req.reason ? [{ label: t('common.reason'), value: req.reason }] : []),
          ]}
        />
        {canDecide && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setConfirming(true)}
                disabled={isRequester}
                title={isRequester ? t('reviews.requesterCannotApprove') : undefined}
                icon={<Check className="size-4" aria-hidden />}
              >
                {t('reviews.markPaid.approve')}
              </Button>
              <Button variant="secondary" onClick={() => setRejecting(true)} icon={<X className="size-4" aria-hidden />}>
                {t('reviews.rejectRequest')}
              </Button>
            </div>
            {isRequester && <SameUserNote>{t('reviews.markPaid.sameUser')}</SameUserNote>}
          </div>
        )}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('reviews.markPaid.approveTitle')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={approve.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approve.mutate(
                  // echo the reviewed request (SEC-063): 409 mark_paid_request_changed if the maker replaced it
                  { id: order.id, body: { request_id: req.id ?? null, reference: req.reference, amount_minor: req.amount_minor } },
                  {
                  onSuccess: () => {
                    notifySuccess(ft('reviews.markPaid.approved', { number: order.order_number }));
                    setConfirming(false);
                  },
                  onError: (e) => notifyApprovalError(e, ft('reviews.markPaid.approveFailed'), 'bankTransfer'),
                })
              }
            >
              {t('reviews.markPaid.approve')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <Trans
            t={t}
            i18nKey="reviews.markPaid.approveBody"
            values={{ amount: formatMoney(req.amount_minor, order.currency), reference: req.reference }}
            components={{ 0: <strong />, 1: <strong /> }}
          />
        </p>
      </Modal>

      <ReasonDialog
        open={rejecting}
        title={t('reviews.markPaid.rejectTitle')}
        description={`${req.reference} · ${formatMoney(req.amount_minor, order.currency)}`}
        confirmLabel={t('reviews.rejectRequest')}
        required={false}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: order.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess(ft('reviews.markPaid.rejected'));
                setRejecting(false);
              },
              onError: (e) => notifyError(e, ft('reviews.rejectRequestFailed')),
            },
          )
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('reviews.markPaid.rejectBody')}</p>
      </ReasonDialog>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Amount-difference review
// ---------------------------------------------------------------------------------------------------------
/** Catalog keys per decision: reviews.amount.<decision>.{title,button,explain} */
type ReviewDecision = 'accept' | 'return';

export function AmountReviewPanel({ order }: { order: PaymentOrderDetail }) {
  const { t } = useFinanceTranslation();
  const reviews = order.amount_reviews ?? [];
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const [deciding, setDeciding] = useState<{ review: AmountReviewOut; decision: ReviewDecision } | null>(null);
  if (reviews.length === 0) return null;

  return (
    <Card title={t('reviews.amount.cardTitle', { count: reviews.length })}>
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
                    <Trans
                      t={t}
                      i18nKey="reviews.amount.expectedReceivedRich"
                      values={{ expected: formatMoney(r.expected_minor, r.currency), received: formatMoney(r.received_minor, r.currency) }}
                      components={{ 0: <strong />, 1: <strong /> }}
                    />
                  </span>
                  <Badge tone={diff < 0 ? 'danger' : 'warning'}>
                    {diff < 0
                      ? t('reviews.amount.shortBy', { amount: formatMoney(Math.abs(diff), r.currency) })
                      : t('reviews.amount.overBy', { amount: formatMoney(Math.abs(diff), r.currency) })}
                  </Badge>
                </div>
                <span className="text-xs text-slate-500">
                  <Trans
                    t={t}
                    i18nKey="reviews.amount.held"
                    values={{ held: formatDateTime(r.held_at), id: r.payment_id.slice(0, 8) }}
                    components={{ 0: <Mono /> }}
                  />
                </span>
              </div>
              {r.decided_by && (
                <p className="text-xs text-slate-500">
                  {t('reviews.amount.decidedBy', { name: nameOf(r.decided_by), at: formatDateTime(r.decided_at) })}
                  {r.note && <> · “{r.note}”</>}
                </p>
              )}
              {r.status === 'returning' && <Callout tone="warning">{t('reviews.amount.returningNote')}</Callout>}
              {open && perms.finance && (
                <div className="flex flex-wrap gap-2">
                  {r.status === 'pending' && (
                    <Button size="sm" onClick={() => setDeciding({ review: r, decision: 'accept' })} icon={<Check className="size-3.5" aria-hidden />}>
                      {t('reviews.amount.accept.button')}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setDeciding({ review: r, decision: 'return' })}
                    icon={<RotateCcw className="size-3.5" aria-hidden />}>
                    {r.status === 'returning' ? t('reviews.amount.retryReturn') : t('reviews.amount.returnInFull')}
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
  target: { review: AmountReviewOut; decision: ReviewDecision } | null;
  onClose: () => void;
}) {
  const { t } = useFinanceTranslation();
  return (
    <Modal open={target !== null} onClose={onClose} title={target ? t(`reviews.amount.${target.decision}.title`) : ''} size="sm">
      {target && <AmountReviewForm key={`${target.review.payment_id}-${target.decision}`} orderId={orderId} target={target} onDone={onClose} />}
    </Modal>
  );
}

function AmountReviewForm({ orderId, target, onDone }: {
  orderId: Uuid;
  target: { review: AmountReviewOut; decision: ReviewDecision };
  onDone: () => void;
}) {
  const { t } = useFinanceTranslation();
  const mutation = useAmountReview();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
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
              notifySuccess(target.decision === 'accept' ? ft('reviews.amount.accepted') : ft('reviews.amount.returned'));
              onDone();
            },
            onError: (err) => notifyError(err, ft('reviews.amount.decisionFailed')),
          },
        );
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('reviews.amount.expectedReceived', {
          expected: formatMoney(r.expected_minor, r.currency),
          received: formatMoney(r.received_minor, r.currency),
        })}
      </p>
      <Callout tone={target.decision === 'accept' ? 'info' : 'warning'}>{t(`reviews.amount.${target.decision}.explain`)}</Callout>
      <Field
        label={t('reviews.amount.noteLabel')}
        required
        error={touched && !trimmed ? t('reviews.amount.noteRequired') : null}
        hint={t('common.charCount', { count: trimmed.length, max: 1000 })}
      >
        {(p) => <Textarea {...p} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} onBlur={() => setTouched(true)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant={target.decision === 'accept' ? 'primary' : 'danger'} loading={mutation.isPending}>
          {t(`reviews.amount.${target.decision}.button`)}
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
  const { t } = useFinanceTranslation();
  const { minor, isDefault } = useRefundDualApprovalThreshold();
  return (
    <Callout tone="info" title={t('reviews.refundThreshold.title')}>
      {minor === 0 ? (
        t('reviews.refundThreshold.every')
      ) : (
        <Trans t={t} i18nKey="reviews.refundThreshold.above" values={{ amount: formatMoney(minor, 'INR') }} components={{ 0: <strong /> }} />
      )}{' '}
      <span className="text-xs">
        <Trans
          t={t}
          i18nKey={isDefault ? 'reviews.refundThreshold.defaultSetting' : 'reviews.refundThreshold.customSetting'}
          components={{ 0: <Link to={opsPaths.settings} className="underline" /> }}
        />
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
  const { t } = useFinanceTranslation();
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const approve = useApprovePayoutPaid();
  const reject = useRejectPayoutPaid();
  const [rejecting, setRejecting] = useState(false);
  const isRequester = Boolean(perms.userId && payout.paid_requested_by === perms.userId);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs text-slate-500">
        <Trans
          t={t}
          i18nKey="reviews.payoutPaid.utrBy"
          values={{ utr: payout.utr ?? '—', name: nameOf(payout.paid_requested_by) }}
          components={{ 0: <Mono /> }}
        />
      </span>
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          disabled={isRequester}
          loading={approve.isPending}
          title={isRequester ? t('reviews.payoutPaid.requesterCannotConfirm') : undefined}
          onClick={() =>
            approve.mutate(payout, {
              onSuccess: () => notifySuccess(ft('reviews.payoutPaid.confirmed')),
              onError: (e) => notifyApprovalError(e, ft('reviews.payoutPaid.confirmFailed'), 'payout'),
            })
          }
        >
          {t('reviews.payoutPaid.confirm')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
          {t('reviews.reject')}
        </Button>
      </div>
      {isRequester && <SameUserNote>{t('reviews.payoutPaid.sameUser')}</SameUserNote>}
      <ReasonDialog
        open={rejecting}
        title={t('reviews.payoutPaid.rejectTitle')}
        description={`${payout.payee_name ?? t('reviews.payeeFallback')} · ${formatMoney(payout.amount_minor, payout.currency)}`}
        confirmLabel={t('reviews.reject')}
        required={false}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: payout.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess(ft('reviews.payoutPaid.rejected'));
                setRejecting(false);
              },
              onError: (e) => notifyError(e, ft('reviews.payoutPaid.rejectFailed')),
            },
          )
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('reviews.payoutPaid.rejectBody')}</p>
      </ReasonDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Payout failure / reversal (two-person, SEC-003)
// ---------------------------------------------------------------------------------------------------------
export function PayoutReversalActions({ payout }: { payout: PayoutOut }) {
  const { t } = useFinanceTranslation();
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const approve = useApprovePayoutFailure();
  const reject = useRejectPayoutFailure();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const isRequester = Boolean(perms.userId && payout.reversal_requested_by === perms.userId);
  const label = `${payout.payee_name ?? t('reviews.payeeFallback')} · ${formatMoney(payout.amount_minor, payout.currency)}`;
  const bounced = payout.status === 'processed';
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="max-w-64 text-end text-xs text-slate-500">
        <Trans
          t={t}
          i18nKey={bounced ? 'reviews.payoutFailure.reversalRequestedBy' : 'reviews.payoutFailure.failureRequestedBy'}
          values={{ name: nameOf(payout.reversal_requested_by), reference: payout.reversal_reference ?? '—' }}
          components={{ 0: <Mono /> }}
        />
      </span>
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="danger"
          disabled={isRequester}
          title={isRequester ? t('reviews.requesterCannotApprove') : undefined}
          onClick={() => setConfirming(true)}
        >
          {bounced ? t('reviews.payoutFailure.approveReversal') : t('reviews.payoutFailure.approveFailure')}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
          {t('reviews.reject')}
        </Button>
      </div>
      {isRequester && <SameUserNote>{t('reviews.payoutFailure.sameUser')}</SameUserNote>}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={bounced ? t('reviews.payoutFailure.approveReversalTitle') : t('reviews.payoutFailure.approveFailureTitle')}
        description={label}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={approve.isPending}>
              {t('common.cancel')}
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
                    notifySuccess(bounced ? ft('reviews.payoutFailure.reversed') : ft('reviews.payoutFailure.failed'));
                    setConfirming(false);
                  },
                  onError: (e) => notifyApprovalError(e, ft('reviews.approveRequestFailed'), 'request'),
                })
              }
            >
              {t('reviews.approve')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <DescriptionList
            columns={1}
            items={[
              {
                label: t('reviews.requestedBy'),
                value: t('reviews.byAt', { name: nameOf(payout.reversal_requested_by), at: formatDateTime(payout.reversal_requested_at) }),
              },
              { label: t('reviews.payoutFailure.reference'), value: <Mono>{payout.reversal_reference ?? '—'}</Mono> },
              { label: t('common.reason'), value: payout.reversal_reason ?? '—' },
            ]}
          />
          <p>
            {bounced ? t('reviews.payoutFailure.reversalEffect') : t('reviews.payoutFailure.failureEffect')}{' '}
            {t('reviews.payoutFailure.checkReference')}
          </p>
        </div>
      </Modal>
      <ReasonDialog
        open={rejecting}
        title={t('reviews.payoutFailure.rejectTitle')}
        description={label}
        confirmLabel={t('reviews.rejectRequest')}
        required={false}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: payout.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess(ft('reviews.payoutFailure.rejected'));
                setRejecting(false);
              },
              onError: (e) => notifyError(e, ft('reviews.rejectRequestFailed')),
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
const REVIEW_ROWS: { key: keyof FinanceReviewCounts; labelKey: string; to: string }[] = [
  { key: 'amountReviews', labelKey: 'reviews.queue.amountReviews', to: `${financePath('orders')}?review=amount` },
  { key: 'markPaidApprovals', labelKey: 'reviews.queue.markPaidApprovals', to: `${financePath('reconciliation')}?status=approval` },
  { key: 'refunds', labelKey: 'reviews.queue.refunds', to: `${financePath('refunds')}?status=requested` },
  { key: 'refundPayouts', labelKey: 'reviews.queue.refundPayouts', to: `${financePath('refunds')}?status=awaiting_payout` },
  { key: 'batches', labelKey: 'reviews.queue.batches', to: `${financePath('settlements/batches')}?status=pending_approval` },
  { key: 'payoutConfirmations', labelKey: 'reviews.queue.payoutConfirmations', to: `${financePath('settlements/payouts')}?queue=confirm` },
  { key: 'payoutReconciliations', labelKey: 'reviews.queue.payoutReconciliations', to: `${financePath('settlements/payouts')}?queue=reconcile` },
  { key: 'payoutReversals', labelKey: 'reviews.queue.payoutReversals', to: `${financePath('settlements/payouts')}?queue=reversal` },
  { key: 'adjustments', labelKey: 'reviews.queue.adjustments', to: `${financePath('ledger/adjustments')}?status=pending_approval` },
];

/** Compact badge for non-finance pages (ops dashboard): finance roles only, hidden when nothing is waiting. */
export function FinanceReviewBanner() {
  const { t } = useFinanceTranslation();
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
      <span className="font-semibold">{t('reviews.queue.title')}</span>
      <Badge tone="warning">{total}</Badge>
      <span className="ms-auto text-xs underline">{t('reviews.queue.openOverview')}</span>
    </Link>
  );
}

export function FinanceReviewTile({ className }: { className?: string }) {
  const { t } = useFinanceTranslation();
  const q = useFinanceReviewCounts();
  const rows = REVIEW_ROWS.filter((r) => q.data?.[r.key] !== null);
  const total = rows.reduce((n, r) => n + (q.data?.[r.key] ?? 0), 0);
  return (
    <Card
      className={className}
      title={
        <span className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-slate-400" aria-hidden /> {t('reviews.queue.title')}
          {q.data && <Badge tone={total ? 'warning' : 'success'}>{total}</Badge>}
        </span>
      }
    >
      {q.isLoading ? (
        <p className="px-4 py-3 text-sm text-slate-500">{t('ui.loading')}</p>
      ) : q.isError ? (
        <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400">{t('reviews.queue.loadFailed')}</p>
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
                  <span>{t(r.labelKey)}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={count ? 'warning' : 'neutral'}>{count}</Badge>
                    <ArrowRight className="size-4 text-slate-400 rtl:-scale-x-100" aria-hidden />
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
