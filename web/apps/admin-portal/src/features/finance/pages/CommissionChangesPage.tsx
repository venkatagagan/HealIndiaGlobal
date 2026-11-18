/**
 * Commission changes (SEC-044): hospital/agent commission rates and commission rules wait here for an admin or
 * finance user other than the requester. Status tabs (pending first) and a target filter are URL-synced
 * (`?status=`, `?target=`). The default platform rates use the settings dual control (Settings page).
 */
import { Link, useSearchParams } from 'react-router';
import type { CommissionChangeOut, CommissionChangeStatus, CommissionChangeTarget } from '@hig/shared/api';
import { QuickFilters } from '@hig/shared/ui';
import { formatDateTime, useDocumentTitle } from '../lib/shared';
import { useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { useCommissionChanges } from '../api/queries';
import { CommissionChangeActions, CommissionChangeDiff } from '../components/CommissionChanges';
import { Badge, Callout, Card, DataTable, EmptyState, PageHeader, Select, type Column, type Tone } from '../components/ui';
import { opsPaths } from '../../ops/lib/paths';
import { financePath } from '../paths';

const STATUSES: readonly CommissionChangeStatus[] = ['pending', 'approved', 'rejected', 'withdrawn', 'superseded'];
const TARGETS: readonly CommissionChangeTarget[] = ['hospital', 'agent', 'commission_rule'];
const STATUS_TONES: Record<CommissionChangeStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  superseded: 'neutral',
};

function targetHref(c: CommissionChangeOut): string {
  if (c.target_type === 'hospital') return opsPaths.hospital(c.target_id);
  if (c.target_type === 'agent') return `${opsPaths.agents}?agent=${encodeURIComponent(c.target_id)}`;
  return financePath('commission-rules');
}

function columns(t: FinanceT, pending: boolean): Column<CommissionChangeOut>[] {
  const cols: Column<CommissionChangeOut>[] = [
    {
      key: 'target',
      header: t('commissionChanges.columns.target'),
      cell: (c) => (
        <div className="min-w-0">
          <Badge tone="accent">{t(`commissionChanges.targets.${c.target_type}`)}</Badge>
          <Link to={targetHref(c)} className="mt-1 block truncate font-medium text-fg hover:underline">
            {c.target_name ?? c.target_id.slice(0, 8)}
          </Link>
        </div>
      ),
    },
    { key: 'change', header: t('commissionChanges.columns.change'), cell: (c) => <CommissionChangeDiff change={c} /> },
    {
      key: 'requested',
      header: t('commissionChanges.columns.requested'),
      hideOnMobile: true,
      cell: (c) => (
        <div className="text-sm">
          <p>{c.requested_by_name ?? '—'}</p>
          <p className="text-xs text-muted">{formatDateTime(c.created_at)}</p>
        </div>
      ),
    },
  ];
  if (pending) {
    cols.push({ key: 'actions', header: <span className="sr-only">{t('orderDetail.actions')}</span>, align: 'right', cell: (c) => <CommissionChangeActions change={c} /> });
  } else {
    cols.push(
      {
        key: 'status',
        header: t('commissionChanges.columns.status'),
        cell: (c) => <Badge tone={STATUS_TONES[c.status] ?? 'neutral'}>{t(`commissionChanges.statuses.${c.status}`)}</Badge>,
      },
      {
        key: 'decided',
        header: t('commissionChanges.columns.decided'),
        hideOnMobile: true,
        cell: (c) => (
          <div className="text-sm">
            <p>{c.decided_by_name ?? '—'}</p>
            {c.decided_at && <p className="text-xs text-muted">{formatDateTime(c.decided_at)}</p>}
            {c.reason && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t('commissionChanges.reasonValue', { reason: c.reason })}</p>}
          </div>
        ),
      },
    );
  }
  return cols;
}

export default function CommissionChangesPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('commissionChanges.title'));
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status') as CommissionChangeStatus | null;
  const status: CommissionChangeStatus = rawStatus && STATUSES.includes(rawStatus) ? rawStatus : 'pending';
  const rawTarget = params.get('target') as CommissionChangeTarget | null;
  const target = rawTarget && TARGETS.includes(rawTarget) ? rawTarget : undefined;
  const list = useCommissionChanges({ status, target_type: target });
  const pendingCount = useCommissionChanges({ status: 'pending' });

  const setParam = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <div>
      <PageHeader title={t('commissionChanges.title')} description={t('commissionChanges.description')} />
      <div className="mb-4">
        <Callout tone="info">{t('commissionChanges.rule')}</Callout>
      </div>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-2 sm:px-3">
          <QuickFilters
            label={t('commissionChanges.statusLabel')}
            items={STATUSES.map((s) => ({
              value: s,
              label: t(`commissionChanges.statuses.${s}`),
              count: s === 'pending' ? pendingCount.data?.length : undefined,
              ...(s === 'pending' ? { tone: 'warning' as const } : {}),
            }))}
            value={status}
            onChange={(v) => setParam('status', v === 'pending' ? undefined : v)}
          />
          <Select
            aria-label={t('commissionChanges.targetLabel')}
            value={target ?? ''}
            onChange={(e) => setParam('target', e.target.value || undefined)}
            className="mb-2 w-auto"
          >
            <option value="">{t('commissionChanges.allTargets')}</option>
            {TARGETS.map((x) => (
              <option key={x} value={x}>
                {t(`commissionChanges.targets.${x}`)}
              </option>
            ))}
          </Select>
        </div>
        <DataTable
          caption={t('commissionChanges.title')}
          columns={columns(t, status === 'pending')}
          rows={list.data}
          rowKey={(c) => c.id}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty={
            <EmptyState
              title={status === 'pending' ? t('commissionChanges.emptyPending') : t('commissionChanges.empty')}
              description={status === 'pending' ? t('commissionChanges.emptyPendingHint') : undefined}
            />
          }
        />
      </Card>
    </div>
  );
}
