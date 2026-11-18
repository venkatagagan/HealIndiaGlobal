import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Gift, Settings as SettingsIcon } from 'lucide-react';
import {
  REFERRAL_STATUSES,
  adminReferralsApi,
  type AdminReferralListParams,
  type AdminReferralOut,
  type ReferralPartyOut,
  type ReferralStatus,
} from '@hig/shared/api';
import { filterParam, formatDateTime, formatMoney, formatNumber, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  DateCell,
  Drawer,
  FilterBar,
  IdCell,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  StatCard,
  type BadgeTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { opsPaths } from '../../ops/lib/paths';
import { notifyError, notifySuccess, ReasonDialog } from '../components/finance';
import { useFinancePermissions } from '../lib/permissions';
import { listOrUndefined } from '../lib/tables';

type TFn = ReturnType<typeof useAppTranslation>['t'];

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(REFERRAL_STATUSES),
};

const STATUS_TONE: Record<ReferralStatus, BadgeTone> = { pending: 'info', qualified: 'accent', rewarded: 'success', void: 'neutral' };
const CREDIT_STATUS_TONE: Record<string, BadgeTone> = { active: 'success', used: 'info', expired: 'warning', void: 'neutral' };
const VOID_ROLES = new Set(['admin', 'finance', 'super_admin']);
const referralKeys = { all: ['admin', 'referrals'] as const };

function toApi(f: FilterValues<typeof FILTERS>): Omit<AdminReferralListParams, 'page' | 'page_size'> {
  return { q: f.q.trim() || undefined, status: listOrUndefined(f.status) };
}

const inr = (minor: number | null | undefined) => formatMoney(minor ?? 0, 'INR');

function StatusBadge({ status }: { status: ReferralStatus }) {
  const { t } = useAppTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`referral.status.${status}`)}</Badge>;
}

const columns = (t: TFn): DataTableColumn<AdminReferralOut>[] => [
  {
    key: 'code',
    header: t('referral.columns.code'),
    mobile: 'secondary',
    cell: (r) => <IdCell value={r.code} secondary={t(`referral.channel.${r.channel}`)} />,
  },
  {
    key: 'referrer',
    header: t('referral.columns.referrer'),
    mobile: 'primary',
    className: 'max-w-56',
    cell: (r) => <PersonCell name={r.referrer.name} secondary={r.referrer.email ?? undefined} />,
  },
  {
    key: 'referred',
    header: t('referral.columns.referred'),
    className: 'max-w-56',
    cell: (r) => <PersonCell name={r.referred.name} secondary={r.referred.email ?? undefined} />,
  },
  {
    key: 'status',
    header: t('referral.columns.status'),
    mobile: 'badge',
    cell: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'credits',
    header: t('referral.columns.credits'),
    align: 'end',
    cell: (r) => <span className="tabular-nums">{r.credits.length ? inr(r.credits.reduce((sum, c) => sum + c.amount_minor, 0)) : '—'}</span>,
  },
  {
    key: 'created_at',
    header: t('referral.columns.created'),
    cell: (r) => <DateCell value={r.created_at} display="relative" />,
  },
];

export default function ReferralsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('referral.title'));
  const perms = useFinancePermissions();
  const canVoid = perms.role !== null && VOID_ROLES.has(perms.role);
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApi(filters), [filters]);
  const params: AdminReferralListParams = { ...apiFilters, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...referralKeys.all, 'list', params],
    queryFn: () => adminReferralsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({ queryKey: [...referralKeys.all, 'summary'], queryFn: adminReferralsApi.summary });
  const settings = useQuery({ queryKey: [...referralKeys.all, 'settings'], queryFn: adminReferralsApi.settings });
  const [openId, setOpenId] = useState<string | null>(null);
  const cols = useMemo(() => columns(t), [t]);

  const s = summary.data;
  const statusOptions: FilterOption<ReferralStatus>[] = REFERRAL_STATUSES.map((value) => ({
    value,
    label: t(`referral.status.${value}`),
    tone: STATUS_TONE[value],
    count: s?.by_status[value],
  }));
  const total = s ? Object.values(s.by_status).reduce<number>((a, b) => a + (b ?? 0), 0) : undefined;
  const quickItems: QuickFilterItem<ReferralStatus>[] = [
    { value: '', label: t('referral.filters.all'), count: total },
    ...REFERRAL_STATUSES.map((value) => ({ value, label: t(`referral.status.${value}`), count: s?.by_status[value] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;
  const open = list.data?.items.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={t('referral.title')} description={t('referral.description')} />

      <section aria-label={t('referral.summary.label')} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('referral.summary.referrals')}
          value={total === undefined ? '—' : formatNumber(total)}
          hint={t('referral.summary.byStatus', {
            pending: formatNumber(s?.by_status.pending ?? 0),
            qualified: formatNumber(s?.by_status.qualified ?? 0),
            rewarded: formatNumber(s?.by_status.rewarded ?? 0),
            void: formatNumber(s?.by_status.void ?? 0),
          })}
          icon={<Gift className="size-5" aria-hidden />}
          loading={summary.isLoading}
        />
        <StatCard
          label={t('referral.summary.issued')}
          value={inr(s?.credits_issued_minor)}
          hint={t('referral.summary.reinstated', { amount: inr(s?.credits_reinstated_minor) })}
          tone="success"
          loading={summary.isLoading}
        />
        <StatCard
          label={t('referral.summary.redeemed')}
          value={inr(s?.credits_redeemed_minor)}
          hint={t('referral.summary.expiredVoided', { expired: inr(s?.credits_expired_minor), voided: inr(s?.credits_voided_minor) })}
          tone="info"
          loading={summary.isLoading}
        />
        <StatCard
          label={t('referral.summary.outstanding')}
          value={inr(s?.outstanding_minor)}
          hint={t('referral.summary.liability', { amount: inr(s?.ledger_liability_minor) })}
          tone="warning"
          loading={summary.isLoading}
        />
      </section>
      {s && s.ledger_liability_minor < s.outstanding_minor ? (
        <p role="note" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          {t('referral.summary.mismatch')}
        </p>
      ) : null}

      <DataTable
        id="admin.finance.referrals"
        caption={t('referral.title')}
        table={table}
        columns={cols}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(r) => setOpenId(r.id)}
        rowLabel={(r) => t('referral.openReferral', { code: r.code })}
        emptyTitle={t('referral.emptyTitle')}
        emptyDescription={t('referral.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('referral.columns.status')}
              items={quickItems}
              value={quickValue}
              onChange={(v) => setFilters({ status: v ? [v] : [] })}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('referral.filters.search') }}
            onReset={table.resetFilters}
          >
            <MultiSelectFilter label={t('referral.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
          </FilterBar>
        }
      />

      <SettingsCard data={settings.data} loading={settings.isLoading} error={settings.error} />

      <ReferralDrawer referral={open} canVoid={canVoid} onClose={() => setOpenId(null)} />
    </div>
  );
}

function SettingsCard({
  data,
  loading,
  error,
}: {
  data: Awaited<ReturnType<typeof adminReferralsApi.settings>> | undefined;
  loading: boolean;
  error: unknown;
}) {
  const { t } = useAppTranslation();
  const v = data?.value;
  const rewards = (map: Record<string, number> | undefined) =>
    map && Object.keys(map).length
      ? Object.entries(map)
          .map(([ccy, minor]) => formatMoney(minor, ccy))
          .join(' · ')
      : '—';
  const yesNo = (value: boolean | undefined) => (value === undefined ? '—' : value ? t('referral.settings.yes') : t('referral.settings.no'));
  const rows: [string, ReactNode][] = v
    ? [
        [t('referral.settings.effective'), yesNo(data?.effective_enabled)],
        [t('referral.settings.envEnabled'), yesNo(data?.env_enabled)],
        [t('referral.settings.enabled'), yesNo(v.enabled)],
        [t('referral.settings.rewardReferrer'), yesNo(v.reward_referrer)],
        [t('referral.settings.referrerReward'), rewards(v.referrer_reward)],
        [t('referral.settings.rewardReferee'), yesNo(v.reward_referee)],
        [t('referral.settings.refereeReward'), rewards(v.referee_reward)],
        [t('referral.settings.fallbackCurrency'), v.fallback_currency ?? '—'],
        [t('referral.settings.maxRewards'), v.max_rewards_per_year === undefined ? '—' : formatNumber(v.max_rewards_per_year)],
        [t('referral.settings.validityDays'), v.credit_validity_days === undefined ? '—' : formatNumber(v.credit_validity_days)],
        [t('referral.settings.qualifyDays'), v.qualify_within_days === undefined ? '—' : formatNumber(v.qualify_within_days)],
      ]
    : [];
  return (
    <Card>
      <CardHeader
        title={t('referral.settings.title')}
        description={t('referral.settings.description', { key: data?.setting_key ?? 'referral_programme' })}
        icon={<SettingsIcon className="size-4" aria-hidden />}
        actions={
          <Link to={opsPaths.settings} className="text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
            {t('referral.settings.open')}
          </Link>
        }
      />
      <div className="p-4 sm:p-5">
        {loading ? (
          <p className="text-sm text-muted">{t('referral.settings.loading')}</p>
        ) : error || !v ? (
          <p className="text-sm text-danger-ink">{t('referral.settings.error')}</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-muted">{label}</dt>
                <dd className="mt-0.5 text-sm text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Card>
  );
}

function Party({ label, party }: { label: string; party: ReferralPartyOut }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 font-medium text-fg">{party.name}</p>
      {party.email ? <p className="truncate text-sm text-muted">{party.email}</p> : null}
      <p className="mt-1 font-mono text-xs text-muted" dir="ltr">
        {party.patient_id}
      </p>
    </div>
  );
}

function checkValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function ReferralDrawer({ referral: r, canVoid, onClose }: { referral: AdminReferralOut | null; canVoid: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const qc = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminReferralsApi.void(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: referralKeys.all });
      notifySuccess(t('referral.void.done'));
      setVoiding(false);
    },
    onError: (e) => notifyError(e, t('referral.void.failed')),
  });

  const dates: [string, string | null][] = r
    ? [
        [t('referral.detail.created'), r.created_at],
        [t('referral.detail.expires'), r.expires_at],
        [t('referral.detail.qualified'), r.qualified_at],
        [t('referral.detail.rewarded'), r.rewarded_at],
        [t('referral.detail.voided'), r.voided_at],
      ]
    : [];
  const checks = r ? Object.entries(r.checks ?? {}) : [];

  return (
    <>
      <Drawer
        open={r !== null}
        onClose={onClose}
        title={r ? t('referral.detail.title', { code: r.code }) : ''}
        description={r ? t(`referral.channel.${r.channel}`) : undefined}
        size="lg"
        footer={
          r && canVoid && r.status !== 'void' ? (
            <Button variant="danger" leftIcon={<Ban className="size-4" aria-hidden />} onClick={() => setVoiding(true)}>
              {t('referral.void.action')}
            </Button>
          ) : undefined
        }
      >
        {r ? (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={r.status} />
              {r.qualifying_booking_id ? (
                <span className="text-muted">
                  {t('referral.detail.booking')} <IdCell value={r.qualifying_booking_id} />
                </span>
              ) : null}
            </div>
            {r.void_reason ? (
              <p className="rounded-xl bg-surface-2 p-3">
                <span className="font-medium">{t('referral.detail.voidReason')}</span> {r.void_reason}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Party label={t('referral.columns.referrer')} party={r.referrer} />
              <Party label={t('referral.columns.referred')} party={r.referred} />
            </div>
            <section>
              <h3 className="mb-2 font-semibold text-fg">{t('referral.detail.dates')}</h3>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {dates.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd>{value ? formatDateTime(value) : '—'}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-fg">{t('referral.detail.checks')}</h3>
              {checks.length === 0 ? (
                <p className="text-muted">{t('referral.detail.noChecks')}</p>
              ) : (
                <dl className="divide-y divide-border rounded-xl border border-border">
                  {checks.map(([key, value]) => (
                    <div key={key} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <dt className="font-mono text-xs text-muted" dir="ltr">
                        {key}
                      </dt>
                      <dd className="font-mono text-xs break-all" dir="ltr">
                        {checkValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-fg">{t('referral.detail.credits')}</h3>
              {r.credits.length === 0 ? (
                <p className="text-muted">{t('referral.detail.noCredits')}</p>
              ) : (
                <ul className="space-y-2">
                  {r.credits.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                      <div>
                        <p className="font-medium">
                          {t(`referral.creditKind.${c.kind}`)}{' '}
                          <span className="text-muted">
                            ({c.patient_id === r.referrer.patient_id ? r.referrer.name : c.patient_id === r.referred.patient_id ? r.referred.name : c.patient_id})
                          </span>
                        </p>
                        <p className="text-xs text-muted">
                          {t('referral.detail.remaining', { amount: inr(c.remaining_minor) })}
                          {c.original_amount_minor !== null && c.original_currency
                            ? ` · ${t('referral.detail.original', { amount: formatMoney(c.original_amount_minor, c.original_currency) })}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{inr(c.amount_minor)}</span>
                        <Badge tone={CREDIT_STATUS_TONE[c.status] ?? 'neutral'}>{t(`referral.creditStatus.${c.status}`)}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
      <ReasonDialog
        open={voiding && r !== null}
        title={t('referral.void.title')}
        description={t('referral.void.description')}
        label={t('referral.void.reason')}
        confirmLabel={t('referral.void.action')}
        maxLength={500}
        loading={voidMutation.isPending}
        onClose={() => setVoiding(false)}
        onConfirm={(reason) => {
          if (!r) return;
          if (reason.trim().length < 3) {
            notifyError(null, t('referral.void.tooShort'));
            return;
          }
          voidMutation.mutate({ id: r.id, reason: reason.trim() });
        }}
      />
    </>
  );
}
