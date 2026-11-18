/**
 * SEC-010 bank-transfer refunds. After approval a manual (bank transfer) refund waits in `awaiting_payout`:
 * one finance user pays it from the bank and records the payout (reference / UTR, value date, optional proof,
 * note); a DIFFERENT finance user checks it against the bank statement and confirms it (the refund becomes
 * processed and is posted to the ledger), or rejects the record (cleared; the refund keeps waiting).
 */
import { useState } from 'react';
import { Trans } from 'react-i18next';
import { BadgeCheck, FileUp, Landmark, Paperclip, X } from 'lucide-react';
import { documentsApi, isApiError, saveBlob, type RefundOut } from '@hig/shared/api';
import { formatDate, formatDateTime, formatMoney, todayIsoDate } from '../lib/shared';
import { ft, useFinanceTranslation } from '../lib/i18n';
import { useConfirmRefundPayout, useRecordRefundPayout, useRejectRefundPayout } from '../api/queries';
import { useFinancePermissions } from '../lib/permissions';
import { Mono, notifyError, notifySuccess, ReasonDialog } from './finance';
import { notifyApprovalError } from './reviews';
import { Button, Callout, DescriptionList, Field, Input, Modal, Textarea } from './ui';

const REFERENCE_MAX = 100;
const NOTE_MAX = 1000;

/** Case- and space-insensitive comparison (the API normalises bank references the same way). */
function sameReference(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, '').toUpperCase();
  return norm(a) !== '' && norm(a) === norm(b);
}

/** Specific messages for the payout error codes; falls back to the API message. */
function notifyPayoutError(error: unknown, fallback: string): void {
  const code = isApiError(error) ? error.code : null;
  const key =
    code === 'reference_already_used'
      ? 'refundPayout.errors.referenceUsed'
      : code === 'invalid_payout_date'
        ? 'refundPayout.errors.futureDate'
        : code === 'payout_changed'
          ? 'refundPayout.errors.changed'
          : code === 'no_payout_recorded'
            ? 'refundPayout.errors.notRecorded'
            : code === 'invalid_refund_state'
              ? 'refundPayout.errors.state'
              : null;
  if (key) notifyError(new Error(ft(key)));
  else notifyApprovalError(error, fallback, 'refundPayout');
}

function refundLabel(r: RefundOut): string {
  return `${formatMoney(r.amount_minor, r.currency)} · ${r.order_number ?? r.order_id.slice(0, 8)}`;
}

/** Row actions for an `awaiting_payout` refund (finance roles only; renders nothing otherwise). */
export function RefundPayoutActions({ refund }: { refund: RefundOut }) {
  const { t } = useFinanceTranslation();
  const perms = useFinancePermissions();
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const reject = useRejectRefundPayout();
  if (!perms.finance || refund.status !== 'awaiting_payout') return null;

  const recorded = Boolean(refund.payout_reference);
  const isRecorder = Boolean(perms.userId && refund.payout_recorded_by === perms.userId);
  return (
    <span className="flex flex-col items-end gap-1">
      {recorded && (
        <span className="text-xs text-muted">
          <Trans
            t={t}
            i18nKey="refundPayout.recordedBy"
            values={{ reference: refund.payout_reference ?? '', name: refund.payout_recorded_by_name ?? t('refundPayout.someone') }}
            components={{ 0: <Mono /> }}
          />
        </span>
      )}
      <span className="flex flex-wrap justify-end gap-1.5">
        {recorded && !isRecorder && (
          <Button size="sm" onClick={() => setConfirming(true)} icon={<BadgeCheck className="size-3.5" aria-hidden />}>
            {t('refundPayout.confirm')}
          </Button>
        )}
        <Button
          size="sm"
          variant={recorded ? 'secondary' : 'primary'}
          onClick={() => setRecording(true)}
          icon={<Landmark className="size-3.5" aria-hidden />}
        >
          {recorded ? t('refundPayout.edit') : t('refundPayout.record')}
        </Button>
        {recorded && (
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)} icon={<X className="size-3.5" aria-hidden />}>
            {t('refundPayout.reject')}
          </Button>
        )}
      </span>
      {recorded && isRecorder && <span className="text-xs text-warning-ink">{t('refundPayout.sameUser')}</span>}

      <RecordPayoutDialog refund={refund} open={recording} onClose={() => setRecording(false)} />
      <ConfirmPayoutDialog refund={refund} open={confirming} onClose={() => setConfirming(false)} />
      <ReasonDialog
        open={rejecting}
        title={t('refundPayout.rejectTitle')}
        description={refundLabel(refund)}
        confirmLabel={t('refundPayout.reject')}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: refund.id, reason },
            {
              onSuccess: () => {
                notifySuccess(ft('refundPayout.rejected'));
                setRejecting(false);
              },
              onError: (e) => notifyPayoutError(e, ft('refundPayout.rejectFailed')),
            },
          )
        }
      >
        <p className="text-sm text-muted">{t('refundPayout.rejectBody')}</p>
      </ReasonDialog>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Maker: record the bank payout
// ---------------------------------------------------------------------------------------------------------
function RecordPayoutDialog({ refund, open, onClose }: { refund: RefundOut; open: boolean; onClose: () => void }) {
  const { t } = useFinanceTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('refundPayout.recordTitle')} description={refundLabel(refund)}>
      {open && <RecordPayoutForm refund={refund} onDone={onClose} />}
    </Modal>
  );
}

function RecordPayoutForm({ refund, onDone }: { refund: RefundOut; onDone: () => void }) {
  const { t } = useFinanceTranslation();
  const record = useRecordRefundPayout();
  const [today] = useState(() => todayIsoDate());
  const [reference, setReference] = useState(refund.payout_reference ?? '');
  const [paidOn, setPaidOn] = useState(refund.payout_date ?? today);
  const [note, setNote] = useState(refund.payout_note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  const referenceError = touched && !reference.trim() ? t('refundPayout.referenceRequired') : null;
  const dateError = touched && (!paidOn || paidOn > today) ? t('refundPayout.errors.futureDate') : null;

  const submit = async () => {
    setTouched(true);
    if (!reference.trim() || !paidOn || paidOn > today) return;
    let proofId = refund.payout_proof_document_id ?? null;
    if (file) {
      setUploading(true);
      try {
        proofId = (await documentsApi.upload({ file, kind: 'payment_proof' })).id;
      } catch (e) {
        notifyError(e, ft('refundPayout.uploadFailed'));
        return;
      } finally {
        setUploading(false);
      }
    }
    record.mutate(
      { id: refund.id, reference: reference.trim(), paid_on: paidOn, proof_document_id: proofId, note: note.trim() || null },
      {
        onSuccess: () => {
          notifySuccess(ft('refundPayout.recorded'));
          onDone();
        },
        onError: (e) => notifyPayoutError(e, ft('refundPayout.recordFailed')),
      },
    );
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Callout tone="info">{t('refundPayout.recordHint')}</Callout>
      <Field label={t('refundPayout.reference')} hint={t('refundPayout.referenceHint')} required error={referenceError}>
        {(p) => <Input {...p} value={reference} maxLength={REFERENCE_MAX} onChange={(e) => setReference(e.target.value)} autoFocus />}
      </Field>
      <Field label={t('refundPayout.paidOn')} required error={dateError}>
        {(p) => <Input {...p} type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />}
      </Field>
      <Field
        label={t('refundPayout.proof')}
        hint={refund.payout_proof_document_id && !file ? t('refundPayout.proofKept') : t('refundPayout.proofHint')}
      >
        {(p) => (
          <Input
            {...p}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        )}
      </Field>
      <Field label={t('refundPayout.note')}>
        {(p) => <Textarea {...p} rows={2} value={note} maxLength={NOTE_MAX} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={record.isPending || uploading}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={record.isPending || uploading} icon={file ? <FileUp className="size-4" aria-hidden /> : undefined}>
          {t('refundPayout.recordSubmit')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Checker: confirm the recorded payout
// ---------------------------------------------------------------------------------------------------------
function ConfirmPayoutDialog({ refund, open, onClose }: { refund: RefundOut; open: boolean; onClose: () => void }) {
  const { t } = useFinanceTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('refundPayout.confirmTitle')} description={refundLabel(refund)}>
      {open && <ConfirmPayoutForm refund={refund} onDone={onClose} />}
    </Modal>
  );
}

function ConfirmPayoutForm({ refund, onDone }: { refund: RefundOut; onDone: () => void }) {
  const { t } = useFinanceTranslation();
  const confirm = useConfirmRefundPayout();
  const [typed, setTyped] = useState('');
  const [touched, setTouched] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const matches = sameReference(typed, refund.payout_reference);

  const downloadProof = async () => {
    if (!refund.payout_proof_document_id) return;
    setDownloading(true);
    try {
      const file = await documentsApi.download(refund.payout_proof_document_id);
      saveBlob(file.blob, file.filename ?? `refund-payout-${refund.payout_reference ?? refund.id}`);
    } catch (e) {
      notifyError(e, ft('refundPayout.proofFailed'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!matches) return;
        confirm.mutate(
          { id: refund.id, reference: typed.trim() },
          {
            onSuccess: () => {
              notifySuccess(ft('refundPayout.confirmed'));
              onDone();
            },
            onError: (e) => notifyPayoutError(e, ft('refundPayout.confirmFailed')),
          },
        );
      }}
    >
      <DescriptionList
        columns={1}
        items={[
          { label: t('refundPayout.amount'), value: formatMoney(refund.amount_minor, refund.currency) },
          { label: t('refundPayout.patient'), value: refund.patient_name ?? t('refunds.unknownPatient') },
          { label: t('refundPayout.reference'), value: <Mono>{refund.payout_reference ?? '—'}</Mono> },
          { label: t('refundPayout.paidOn'), value: refund.payout_date ? formatDate(refund.payout_date) : '—' },
          {
            label: t('refundPayout.recordedByLabel'),
            value: `${refund.payout_recorded_by_name ?? t('refundPayout.someone')}${refund.payout_recorded_at ? ` · ${formatDateTime(refund.payout_recorded_at)}` : ''}`,
          },
          ...(refund.payout_note ? [{ label: t('refundPayout.note'), value: refund.payout_note }] : []),
          {
            label: t('refundPayout.proof'),
            value: refund.payout_proof_document_id ? (
              <Button type="button" size="sm" variant="secondary" loading={downloading} onClick={() => void downloadProof()} icon={<Paperclip className="size-3.5" aria-hidden />}>
                {t('refundPayout.downloadProof')}
              </Button>
            ) : (
              t('refundPayout.noProof')
            ),
          },
        ]}
      />
      <Callout tone="warning">{t('refundPayout.confirmHint')}</Callout>
      <Field
        label={t('refundPayout.retypeReference')}
        required
        error={touched && !matches ? t('refundPayout.referenceMismatch') : null}
      >
        {(p) => <Input {...p} value={typed} maxLength={REFERENCE_MAX} autoComplete="off" onChange={(e) => setTyped(e.target.value)} autoFocus />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={confirm.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={confirm.isPending} disabled={!matches}>
          {t('refundPayout.confirmSubmit')}
        </Button>
      </div>
    </form>
  );
}
