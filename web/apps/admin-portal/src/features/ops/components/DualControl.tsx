/**
 * Maker-checker reviews (security controls SEC-008 / SEC-011 / SEC-020):
 *  - FX rates: a change of more than 10% waits for a second finance user (approve binds to the reviewed rate);
 *  - `bank_transfer_details`: every change waits for a second finance user;
 *  - hospital identity / accreditation fields changed by an approved hospital wait for an admin.
 * The API is the authority (403 `second_approver_required`, 409 `request_changed`); this UI only explains and
 * hides what the signed-in role cannot do.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock, ShieldAlert, Undo2, XCircle } from 'lucide-react';
import { adminApi } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { Badge, Button, ConfirmDialog, ReasonDialog } from '../ui';
import { Banner } from '../ui/detail';
import { formatDateTime, formatNumber, formatRelative } from '../lib/format';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';
import {
  phase1AdminApi,
  type AdminHospitalWithPending,
  type FxRateWithPending,
  type PendingSettingChange,
  type SettingWithPending,
} from '../lib/phase1Api';

/** id -> name of staff users (to say who asked for a change); empty until loaded. */
function useStaffNames(): Map<string, string> {
  const staff = useQuery({ queryKey: [...opsKeys.staff, 'names'], queryFn: () => adminApi.listStaff(), staleTime: 5 * 60_000 });
  return useMemo(() => new Map((staff.data ?? []).map((s) => [s.id, s.full_name])), [staff.data]);
}

// ---------------------------------------------------------------------------------------------------------
// FX rates
// ---------------------------------------------------------------------------------------------------------
/** Same cache entry as the FX CrudSection list (`[...queryKey, listParams ?? {}]`). */
export const fxRatesQueryKey = [...opsKeys.content, 'fx-rates'] as const;

function changePct(current: string | number, pending: string | number): number | null {
  const a = Number(current);
  const b = Number(pending);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return ((b - a) / a) * 100;
}

/** Pending large FX changes with approve / reject (second finance user) above the FX table. */
export function FxPendingPanel() {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const names = useStaffNames();
  const rates = useQuery({
    queryKey: [...fxRatesQueryKey, {}],
    queryFn: () => adminApi.fxRates.list() as Promise<FxRateWithPending[]>,
  });
  const pending = (rates.data ?? []).filter((r) => r.pending_rate != null && r.id);
  const approve = useOpsMutation({
    mutationFn: (r: FxRateWithPending) => phase1AdminApi.approveFxRate(r.id!, String(r.pending_rate)),
    success: (r) => t('security.fx.approved', { currency: r.quote_currency }),
    invalidate: [fxRatesQueryKey],
  });
  const reject = useOpsMutation({
    mutationFn: (r: FxRateWithPending) => phase1AdminApi.rejectFxRate(r.id!),
    success: (r) => t('security.fx.rejected', { currency: r.quote_currency }),
    invalidate: [fxRatesQueryKey],
  });
  if (pending.length === 0) return null;
  const busy = approve.isPending || reject.isPending;
  return (
    <div className="mb-4">
      <Banner
        tone="warning"
        icon={<ShieldAlert className="size-5" aria-hidden />}
        title={t('security.fx.pendingTitle', { count: pending.length })}
      >
        <p>{t('security.fx.pendingBody')}</p>
        <ul className="mt-3 space-y-2">
          {pending.map((r) => {
            const mine = !!perms.user && r.pending_requested_by === perms.user.id;
            const pct = changePct(r.rate, r.pending_rate!);
            const requester = r.pending_requested_by
              ? mine
                ? t('security.requestedByYou')
                : (names.get(r.pending_requested_by) ?? t('security.requestedByOther'))
              : t('security.requestedByOther');
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-surface px-3 py-2 text-fg sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Badge tone="violet">{r.quote_currency}</Badge>
                    <span className="tabular-nums" dir="ltr">
                      ₹{formatNumber(Number(r.rate), { maximumFractionDigits: 6 })}
                    </span>
                    <ArrowRight className="size-3.5 text-muted rtl:-scale-x-100" aria-hidden />
                    <span className="tabular-nums font-semibold" dir="ltr">
                      ₹{formatNumber(Number(r.pending_rate), { maximumFractionDigits: 6 })}
                    </span>
                    {pct !== null && (
                      <Badge tone={Math.abs(pct) > 10 ? 'red' : 'amber'}>
                        <span dir="ltr">
                          {pct > 0 ? '+' : ''}
                          {formatNumber(pct, { maximumFractionDigits: 1 })}%
                        </span>
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3" aria-hidden />
                    {r.pending_requested_at
                      ? t('security.requestedAtBy', { when: formatRelative(r.pending_requested_at), name: requester })
                      : requester}
                  </p>
                </div>
                {perms.editFinanceSettings ? (
                  <div className="flex flex-wrap gap-2">
                    {!mine && (
                      <Button
                        size="sm"
                        icon={<CheckCircle2 className="size-3.5" aria-hidden />}
                        loading={approve.isPending && approve.variables?.id === r.id}
                        disabled={busy}
                        onClick={() => approve.mutate(r)}
                      >
                        {t('security.approve')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      icon={mine ? <Undo2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                      loading={reject.isPending && reject.variables?.id === r.id}
                      disabled={busy}
                      onClick={() => reject.mutate(r)}
                    >
                      {mine ? t('security.withdraw') : t('security.reject')}
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted">{t('security.financeOnly')}</span>
                )}
                {mine && perms.editFinanceSettings && <span className="text-xs text-muted sm:hidden">{t('security.needsSecondApprover')}</span>}
              </li>
            );
          })}
        </ul>
        {pending.some((r) => perms.user && r.pending_requested_by === perms.user.id) && (
          <p className="mt-2 hidden text-xs sm:block">{t('security.needsSecondApprover')}</p>
        )}
      </Banner>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Dual-control settings (bank transfer details)
// ---------------------------------------------------------------------------------------------------------
function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]));
}

/** Field-by-field comparison of the current and the proposed value (string maps; other values as JSON). */
function ValueDiff({ current, proposed }: { current: unknown; proposed: unknown }) {
  const { t } = useAppTranslation();
  const a = asStringMap(current);
  const b = asStringMap(proposed);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  if (keys.length === 0) {
    return (
      <pre dir="ltr" className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs text-fg">
        {JSON.stringify(proposed, null, 2)}
      </pre>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[28rem] text-start text-xs text-fg">
        <caption className="sr-only">{t('security.diff.caption')}</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col" className="py-1 pe-3 text-start font-medium">{t('security.diff.field')}</th>
            <th scope="col" className="py-1 pe-3 text-start font-medium">{t('security.diff.current')}</th>
            <th scope="col" className="py-1 text-start font-medium">{t('security.diff.proposed')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const changed = (a[k] ?? '') !== (b[k] ?? '');
            return (
              <tr key={k} className={changed ? 'bg-warning-soft/60' : undefined}>
                <th scope="row" className="py-1 pe-3 text-start font-mono font-normal">{k}</th>
                <td className="py-1 pe-3 break-all">{a[k] || <span className="text-muted">—</span>}</td>
                <td className={changed ? 'py-1 break-all font-semibold' : 'py-1 break-all'}>
                  {b[k] || <span className="text-muted">{t('security.diff.removed')}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pending change of a dual-control setting with approve / reject (or withdraw for the requester).
 * `formatValue` shows a scalar setting as "current -> proposed" (e.g. commission rates as %); `checkBody`
 * replaces the checker's hint.
 */
export function SettingPendingChange({
  setting,
  label,
  formatValue,
  checkBody,
}: {
  setting: SettingWithPending;
  label: string;
  formatValue?: (value: unknown) => string;
  checkBody?: string;
}) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const [rejecting, setRejecting] = useState(false);
  const change: PendingSettingChange | null | undefined = setting.pending_change;
  const approve = useOpsMutation({
    mutationFn: (c: PendingSettingChange) => phase1AdminApi.approveSettingChange(setting.key, c.id),
    success: t('security.setting.approved', { label }),
    invalidate: [opsKeys.settings],
  });
  const reject = useOpsMutation({
    mutationFn: (reason: string) => phase1AdminApi.rejectSettingChange(setting.key, reason || null),
    success: t('security.setting.rejected', { label }),
    invalidate: [opsKeys.settings],
    onSuccess: () => setRejecting(false),
  });
  if (!change) return null;
  const mine = !!perms.user && String(change.requested_by) === perms.user.id;
  const requester = mine ? t('security.requestedByYou') : (change.requested_by_name ?? t('security.requestedByOther'));
  return (
    <>
      <Banner
        tone="warning"
        icon={<ShieldAlert className="size-5" aria-hidden />}
        title={t('security.setting.pendingTitle')}
        action={
          perms.editFinanceSettings ? (
            <div className="flex flex-wrap gap-2">
              {!mine && (
                <Button
                  size="sm"
                  icon={<CheckCircle2 className="size-3.5" aria-hidden />}
                  loading={approve.isPending}
                  disabled={reject.isPending}
                  onClick={() => approve.mutate(change)}
                >
                  {t('security.approve')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                icon={mine ? <Undo2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                disabled={approve.isPending}
                onClick={() => setRejecting(true)}
              >
                {mine ? t('security.withdraw') : t('security.reject')}
              </Button>
            </div>
          ) : undefined
        }
      >
        <p>
          {t('security.requestedAtBy', { when: formatDateTime(change.requested_at), name: requester })}
          {' · '}
          {mine
            ? t('security.needsSecondApprover')
            : perms.editFinanceSettings
              ? (checkBody ?? t('security.setting.checkBody'))
              : t('security.financeOnly')}
        </p>
        {formatValue ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="tabular-nums">{formatValue(setting.value)}</span>
            <ArrowRight className="size-3.5 text-muted rtl:-scale-x-100" aria-hidden />
            <span className="font-semibold tabular-nums">{formatValue(change.value)}</span>
          </p>
        ) : (
          <ValueDiff current={setting.value} proposed={change.value} />
        )}
      </Banner>
      <ReasonDialog
        open={rejecting}
        required={false}
        title={mine ? t('security.setting.withdrawTitle') : t('security.setting.rejectTitle')}
        description={t('security.setting.rejectDescription')}
        label={t('security.setting.rejectReason')}
        confirmLabel={mine ? t('security.withdraw') : t('security.reject')}
        loading={reject.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) => reject.mutate(reason)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Hospital profile changes
// ---------------------------------------------------------------------------------------------------------
const PROFILE_FIELDS = ['name', 'legal_name', 'gstin', 'pan', 'email', 'website', 'accreditations'] as const;

function profileValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.map((v) => String(v).toUpperCase()).join(', ');
  return String(value);
}

/** Identity / accreditation changes an approved hospital asked for, with approve / reject (admins). */
export function ProfileChangesPanel({ hospital }: { hospital: AdminHospitalWithPending }) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const pending = hospital.pending_profile_values ?? {};
  const keys = Object.keys(pending).sort(
    (a, b) => PROFILE_FIELDS.indexOf(a as never) - PROFILE_FIELDS.indexOf(b as never),
  );
  const invalidate = [opsKeys.hospitals] as const;
  const approve = useOpsMutation({
    mutationFn: () => phase1AdminApi.approveProfileChanges(hospital.id),
    success: t('security.profile.approved'),
    invalidate,
    onSuccess: () => setConfirm(null),
  });
  const reject = useOpsMutation({
    mutationFn: () => phase1AdminApi.rejectProfileChanges(hospital.id),
    success: t('security.profile.rejected'),
    invalidate,
    onSuccess: () => setConfirm(null),
  });
  if (keys.length === 0) return null;
  const current = (key: string): unknown =>
    key === 'pan' ? (hospital.pan_last4 ? `••••••${hospital.pan_last4}` : null) : (hospital as unknown as Record<string, unknown>)[key];
  return (
    <>
      <Banner
        tone="warning"
        icon={<ShieldAlert className="size-5" aria-hidden />}
        title={t('security.profile.title', { count: keys.length })}
        action={
          perms.approvePartners ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<CheckCircle2 className="size-3.5" aria-hidden />} onClick={() => setConfirm('approve')}>
                {t('security.profile.approve')}
              </Button>
              <Button size="sm" variant="outline" icon={<XCircle className="size-3.5" aria-hidden />} onClick={() => setConfirm('reject')}>
                {t('security.profile.reject')}
              </Button>
            </div>
          ) : undefined
        }
      >
        <p>{t('security.profile.body')}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-start text-xs text-fg">
            <caption className="sr-only">{t('security.diff.caption')}</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1 pe-3 text-start font-medium">{t('security.diff.field')}</th>
                <th scope="col" className="py-1 pe-3 text-start font-medium">{t('security.diff.current')}</th>
                <th scope="col" className="py-1 text-start font-medium">{t('security.diff.proposed')}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <th scope="row" className="py-1 pe-3 text-start font-normal">
                    {t(`security.profile.fields.${k}`, { defaultValue: k })}
                  </th>
                  <td className="py-1 pe-3 break-all">{profileValue(current(k)) ?? <span className="text-muted">—</span>}</td>
                  <td className="py-1 break-all font-semibold">
                    {profileValue(pending[k]) ?? <span className="font-normal text-muted">{t('security.diff.removed')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Banner>
      <ReasonlessConfirm
        open={confirm !== null}
        approve={confirm === 'approve'}
        name={hospital.name}
        loading={approve.isPending || reject.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => (confirm === 'approve' ? approve.mutate() : reject.mutate())}
      />
    </>
  );
}

function ReasonlessConfirm({
  open,
  approve,
  name,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  approve: boolean;
  name: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useAppTranslation();
  return (
    <ConfirmDialog
      open={open}
      tone={approve ? 'primary' : 'danger'}
      title={approve ? t('security.profile.approveTitle') : t('security.profile.rejectTitle')}
      message={approve ? t('security.profile.approveMessage', { name }) : t('security.profile.rejectMessage', { name })}
      confirmLabel={approve ? t('security.profile.approve') : t('security.profile.reject')}
      loading={loading}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

