/**
 * SEC-044 commission changes: a hospital/agent commission rate, a commission rule (rate, dates, activation; a
 * new rule starts inactive) is applied only after an admin or finance user OTHER than the requester approves
 * it. The requester may withdraw. Used by the commission-changes queue, the commission rules page, the
 * hospital detail page and the agent drawer. The API is the authority (403 `second_approver_required`,
 * 409 `request_changed` / `target_changed`).
 */
import { useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, ShieldAlert, Undo2, XCircle } from 'lucide-react';
import { isApiError, type CommissionChangeOut, type UserRole } from '@hig/shared/api';
import { formatBps, formatDate, formatDateTime } from '../lib/shared';
import { ft, useFinanceTranslation } from '../lib/i18n';
import { useApproveCommissionChange, useRejectCommissionChange } from '../api/queries';
import { useFinancePermissions } from '../lib/permissions';
import { notifyError, notifySuccess, ReasonDialog } from './finance';
import { Badge, Button } from './ui';

/** Roles that may approve / reject commission changes (the API also refuses the requester). */
const APPROVER_ROLES: readonly UserRole[] = ['admin', 'finance', 'super_admin'];

const FIELD_ORDER = ['commission_rate_bps', 'rate_bps', 'is_active', 'effective_from', 'effective_to'];

/** Field name in the current UI language. */
function fieldLabel(field: string): string {
  return ft(`commissionChanges.fields.${field}`, { defaultValue: field });
}

/** A changed value for display (rates as %, dates, yes/no; `null` rate = the platform default). */
function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    if (field === 'commission_rate_bps') return ft('commissionChanges.platformDefault');
    if (field === 'effective_to') return ft('commissionChanges.openEnded');
    return '—';
  }
  if (field.endsWith('_bps') && typeof value === 'number') return formatBps(value);
  if (field === 'is_active') return value ? ft('commissionChanges.active') : ft('commissionChanges.inactive');
  if ((field === 'effective_from' || field === 'effective_to') && typeof value === 'string') return formatDate(value);
  return String(value);
}

/** "Rate: 12% → 15%" lines for every changed field. */
export function CommissionChangeDiff({ change }: { change: CommissionChangeOut }) {
  useFinanceTranslation(); // re-render on language change
  const fields = Object.keys(change.changes ?? {}).sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b));
  return (
    <ul className="space-y-0.5 text-sm">
      {fields.map((f) => (
        <li key={f} className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted">{fieldLabel(f)}:</span>
          <span className="tabular-nums">{formatValue(f, change.before?.[f])}</span>
          <ArrowRight className="size-3.5 text-muted rtl:-scale-x-100" aria-hidden />
          <span className="font-semibold tabular-nums">{formatValue(f, change.changes[f])}</span>
        </li>
      ))}
    </ul>
  );
}

/** Small "Awaiting 2nd approval" badge for list cells. */
export function PendingCommissionBadge({ newRule = false }: { newRule?: boolean }) {
  const { t } = useFinanceTranslation();
  return <Badge tone="warning">{newRule ? t('commissionChanges.pendingActivation') : t('commissionChanges.pendingBadge')}</Badge>;
}

function notifyDecisionError(error: unknown, fallback: string): void {
  const code = isApiError(error) ? error.code : null;
  if (code === 'second_approver_required') notifyError(new Error(ft('commissionChanges.errors.differentUser')));
  else if (code === 'request_changed') notifyError(new Error(ft('commissionChanges.errors.requestChanged')));
  else if (code === 'target_changed') notifyError(new Error(ft('commissionChanges.errors.targetChanged')));
  else notifyError(error, fallback);
}

/** Approve / reject (withdraw for the requester) buttons; renders the "needs another user" hint for the requester. */
export function CommissionChangeActions({ change, size = 'sm' }: { change: CommissionChangeOut; size?: 'sm' | 'md' }) {
  const { t } = useFinanceTranslation();
  const perms = useFinancePermissions();
  const approve = useApproveCommissionChange();
  const reject = useRejectCommissionChange();
  const [rejecting, setRejecting] = useState(false);
  if (change.status !== 'pending' || !perms.role || !APPROVER_ROLES.includes(perms.role)) return null;
  const mine = Boolean(perms.userId && change.requested_by === perms.userId);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {!mine && (
          <Button
            size={size}
            icon={<CheckCircle2 className="size-3.5" aria-hidden />}
            loading={approve.isPending}
            disabled={reject.isPending}
            onClick={() =>
              approve.mutate(change.id, {
                onSuccess: () => notifySuccess(ft('commissionChanges.approved')),
                onError: (e) => notifyDecisionError(e, ft('commissionChanges.approveFailed')),
              })
            }
          >
            {t('commissionChanges.approve')}
          </Button>
        )}
        <Button
          size={size}
          variant="secondary"
          icon={mine ? <Undo2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
          disabled={approve.isPending}
          onClick={() => setRejecting(true)}
        >
          {mine ? t('commissionChanges.withdraw') : t('commissionChanges.reject')}
        </Button>
      </div>
      {mine && <span className="text-xs text-warning-ink">{t('commissionChanges.sameUser')}</span>}
      <ReasonDialog
        open={rejecting}
        required={false}
        title={mine ? t('commissionChanges.withdrawTitle') : t('commissionChanges.rejectTitle')}
        description={change.target_name ?? undefined}
        label={t('commissionChanges.reasonOptional')}
        confirmLabel={mine ? t('commissionChanges.withdraw') : t('commissionChanges.reject')}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          reject.mutate(
            { id: change.id, reason: reason || undefined },
            {
              onSuccess: () => {
                notifySuccess(mine ? ft('commissionChanges.withdrawn') : ft('commissionChanges.rejected'));
                setRejecting(false);
              },
              onError: (e) => notifyDecisionError(e, ft('commissionChanges.rejectFailed')),
            },
          )
        }
      >
        <p className="text-sm text-muted">{t('commissionChanges.rejectBody')}</p>
      </ReasonDialog>
    </div>
  );
}

/** Warning block for a pending change on a detail page: who asked, what changes, approve / reject. */
export function PendingCommissionChange({ change }: { change: CommissionChangeOut | null | undefined }) {
  const { t } = useFinanceTranslation();
  const perms = useFinancePermissions();
  if (!change || change.status !== 'pending') return null;
  const mine = Boolean(perms.userId && change.requested_by === perms.userId);
  const who = mine ? t('commissionChanges.you') : (change.requested_by_name ?? t('commissionChanges.someone'));
  return (
    <div className="rounded-xl border border-warning/40 bg-warning-soft/50 p-3 text-fg" role="status">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <ShieldAlert className="hidden size-5 shrink-0 text-warning-ink sm:block" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold">{t('commissionChanges.pendingTitle')}</p>
          <CommissionChangeDiff change={change} />
          <p className="flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3" aria-hidden />
            {t('commissionChanges.requestedAtBy', { name: who, when: formatDateTime(change.created_at) })}
          </p>
        </div>
        <CommissionChangeActions change={change} />
      </div>
    </div>
  );
}
