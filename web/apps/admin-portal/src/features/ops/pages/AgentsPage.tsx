import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Ban, CheckCircle2, ExternalLink, Globe2, Medal, ShieldAlert, XCircle } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Trans } from 'react-i18next';
import {
  adminApi,
  AGENT_STATUSES,
  AGENT_STATUS_LABELS,
  AGENT_TIERS,
  AGENT_TIER_LABELS,
  enumOptions,
  KYC_STATUSES,
  KYC_STATUS_LABELS,
  type AdminAgentListParams,
  type AdminAgentOut,
  type AgentStatus,
  type AgentTier,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Avatar,
  Badge as UiBadge,
  DataTable,
  DateCell,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import {
  Button,
  ConfirmDialog,
  Drawer,
  ErrorState,
  Field,
  Input,
  LoadingState,
  ReasonDialog,
  Select,
} from '../ui';
import { DrawerSummary, StatTiles } from '../components/DrawerSummary';
import { Banner, FieldGrid, Panel } from '../ui/detail';
import { DocumentList } from '../components/DocumentList';
import { bpsToPctInput, formatBps, formatDate, formatDateTime, pctInputToBps, useDocumentTitle } from '../lib/format';
import { countryName, useAdminFacets } from '../lib/lookups';
import { opsKeys, useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';
import { useSettingValue } from '../lib/settings';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(AGENT_STATUSES),
  kyc_status: filterParam.list(KYC_STATUSES),
  tier: filterParam.list(AGENT_TIERS),
  country: filterParam.list(),
};
const SORT_KEYS = ['agency_name', 'created_at', 'commission_rate_bps'] as const;
type AgentFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: AgentFilters): Omit<AdminAgentListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    kyc_status: f.kyc_status.length ? f.kyc_status : undefined,
    tier: f.tier.length ? f.tier : undefined,
    country: f.country.length ? f.country : undefined,
  };
}

const QUICK: { value: AgentStatus; labelKey: string }[] = [
  { value: 'pending', labelKey: 'agents.quick.approvalQueue' },
  { value: 'active', labelKey: 'agents.quick.active' },
  { value: 'suspended', labelKey: 'agents.quick.suspended' },
  { value: 'rejected', labelKey: 'agents.quick.rejected' },
];

function agentColumns(t: TFunction): DataTableColumn<AdminAgentOut>[] {
  return [
    {
      key: 'agency_name',
      header: t('agents.columns.agency'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-64',
      cell: (a) => <PersonCell name={a.agency_name} secondary={[a.full_name, a.email].filter(Boolean).join(' · ') || undefined} />,
      exportValue: (a) => a.agency_name,
    },
    {
      key: 'code',
      header: t('agents.columns.code'),
      mobile: 'secondary',
      cell: (a) => <span className="font-mono text-[13px]">{a.agent_code}</span>,
      exportValue: (a) => a.agent_code,
    },
    {
      key: 'status',
      header: t('agents.columns.status'),
      mobile: 'badge',
      cell: (a) => <StatusBadgeCell status={a.status} kind="agent" />,
      exportValue: (a) => AGENT_STATUS_LABELS[a.status],
    },
    {
      key: 'kyc',
      header: t('agents.columns.kyc'),
      cell: (a) => <StatusBadgeCell status={a.kyc_status} kind="kyc" />,
      exportValue: (a) => KYC_STATUS_LABELS[a.kyc_status],
    },
    { key: 'tier', header: t('agents.columns.tier'), cell: (a) => <TierBadge tier={a.tier} />, exportValue: (a) => AGENT_TIER_LABELS[a.tier] },
    {
      key: 'location',
      header: t('agents.columns.location'),
      cell: (a) => <TextCell primary={a.country ? countryName(a.country) : '—'} secondary={a.city ?? undefined} />,
      exportValue: (a) => [a.city, a.country].filter(Boolean).join(', '),
    },
    {
      key: 'commission_rate_bps',
      header: t('agents.columns.commission'),
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      cell: (a) =>
        a.commission_rate_bps == null ? (
          <span className="text-muted">{t('agents.default')}</span>
        ) : (
          <span className="tabular-nums">{formatBps(a.commission_rate_bps)}</span>
        ),
      exportValue: (a) => (a.commission_rate_bps == null ? t('agents.default') : formatBps(a.commission_rate_bps)),
    },
    {
      key: 'created_at',
      header: t('agents.columns.joined'),
      sortable: true,
      sortDescFirst: true,
      cell: (a) => <DateCell value={a.created_at} display="date" />,
      exportValue: (a) => a.created_at,
    },
  ];
}

export default function AgentsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('agents.documentTitle'));
  const columns = useMemo(() => agentColumns(t), [t]);
  const table = useTableState({ filters: FILTERS, sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: AdminAgentListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [...opsKeys.agents, 'list', listParams],
    queryFn: () => adminApi.listAgents(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...opsKeys.agents, 'status-counts', apiFilters],
    queryFn: () => adminApi.agentStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const facets = useAdminFacets();

  const statusOptions: FilterOption<AgentStatus>[] = AGENT_STATUSES.map((s) => ({
    value: s,
    label: AGENT_STATUS_LABELS[s],
    tone: statusTone(s, 'agent'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<AgentStatus>[] = [
    { value: '', label: t('agents.quick.all'), count: counts.data?.total },
    ...QUICK.map((q) => ({ value: q.value, label: t(q.labelKey), count: counts.data?.counts[q.value] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;

  return (
    <div>
      <PageHeader title={t('agents.title')} description={t('agents.description')} />
      <DataTable
        id="admin.agents"
        caption={t('agents.documentTitle')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        onRowClick={(a) => setSelected(a.id)}
        rowLabel={(a) => t('agents.openRow', { name: a.agency_name })}
        emptyTitle={t('agents.empty.title')}
        emptyDescription={t('agents.empty.description')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('agents.filters.agentStatus')}
              items={quickItems}
              value={quickValue}
              onChange={(s) => setFilter('status', s ? [s] : [])}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('agents.filters.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="agents"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => adminApi.listAgents({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
          >
            <MultiSelectFilter label={t('agents.filters.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label={t('agents.filters.kyc')}
              value={filters.kyc_status}
              onChange={(v) => setFilter('kyc_status', v)}
              options={KYC_STATUSES.map((k) => ({ value: k, label: KYC_STATUS_LABELS[k], tone: statusTone(k, 'kyc') }))}
            />
            <MultiSelectFilter
              label={t('agents.filters.tier')}
              icon={<Medal className="size-3.5 opacity-70" aria-hidden />}
              value={filters.tier}
              onChange={(v) => setFilter('tier', v)}
              options={AGENT_TIERS.map((tier) => ({ value: tier, label: AGENT_TIER_LABELS[tier] }))}
            />
            <MultiSelectFilter
              label={t('agents.filters.country')}
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.country}
              onChange={(v) => setFilter('country', v)}
              options={(facets.data?.agent_countries ?? []).map((c) => ({ value: c, label: countryName(c), description: c }))}
              loading={facets.isLoading}
              searchable
            />
          </FilterBar>
        }
      />
      <AgentDrawer agentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function TierBadge({ tier }: { tier: AgentTier }) {
  const tone = tier === 'gold' ? 'warning' : tier === 'silver' ? 'neutral' : 'accent';
  return <UiBadge tone={tone}>{AGENT_TIER_LABELS[tier] ?? tier}</UiBadge>;
}

function AgentDrawer({ agentId, onClose }: { agentId: string | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const perms = useOpsPermissions();
  const defaultBps = useSettingValue<number>('default_agent_commission_bps');
  const q = useQuery({
    queryKey: [...opsKeys.agents, 'detail', agentId],
    queryFn: () => adminApi.getAgent(agentId!),
    enabled: !!agentId,
  });
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'suspend' | null>(null);
  const [tier, setTier] = useState<AgentTier>('bronze');
  const [pct, setPct] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) {
      setTier(q.data.tier);
      setPct(bpsToPctInput(q.data.commission_rate_bps));
      setError(null);
    }
  }, [q.data]);

  const invalidate = [opsKeys.agents, opsKeys.dashboard] as const;
  const approve = useOpsMutation({
    mutationFn: () => adminApi.approveAgent(agentId!),
    success: () => t('agents.toast.approved'),
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const reject = useOpsMutation({
    mutationFn: (reason: string) => adminApi.rejectAgent(agentId!, { reason }),
    success: () => t('agents.toast.rejected'),
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const suspend = useOpsMutation({
    mutationFn: (reason: string) => adminApi.suspendAgent(agentId!, { reason }),
    success: () => t('agents.toast.suspended'),
    invalidate,
    onSuccess: () => setDialog(null),
  });
  const update = useOpsMutation({
    mutationFn: (body: { tier?: AgentTier; commission_rate_bps?: number | null }) => adminApi.updateAgent(agentId!, body),
    success: () => t('agents.toast.updated'),
    invalidate: [opsKeys.agents],
  });

  const a = q.data;
  const save = () => {
    const bps = pctInputToBps(pct);
    if (bps === undefined) return setError(t('agents.drawer.commissionError'));
    setError(null);
    update.mutate({ tier, commission_rate_bps: bps });
  };

  return (
    <Drawer
      open={!!agentId}
      onClose={onClose}
      width="xl"
      title={a?.agency_name ?? t('agents.drawer.titleFallback')}
      subtitle={a ? `${a.agent_code}${a.email ? ` · ${a.email}` : ''}` : undefined}
    >
      {q.isLoading ? (
        <LoadingState />
      ) : q.error || !a ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-4">
          <DrawerSummary
            avatar={<Avatar name={a.agency_name} size="lg" />}
            badges={
              <>
                <StatusBadgeCell status={a.status} kind="agent" />
                <UiBadge
                  tone={a.kyc_status === 'approved' ? 'success' : a.kyc_status === 'rejected' ? 'danger' : a.kyc_status === 'pending' ? 'warning' : 'neutral'}
                  dot
                >
                  {t('agents.drawer.kycBadge', { status: KYC_STATUS_LABELS[a.kyc_status].toLowerCase() })}
                </UiBadge>
                <TierBadge tier={a.tier} />
              </>
            }
            meta={
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <span>{[a.city, a.country ? countryName(a.country) : null].filter(Boolean).join(', ') || t('agents.drawer.locationNotSet')}</span>
                <span>{t('agents.drawer.joinedOn', { date: formatDate(a.created_at) })}</span>
              </span>
            }
            actions={
              perms.approvePartners && (
                <>
                  {(a.status === 'pending' || a.status === 'suspended' || a.status === 'rejected') && (
                    <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => setDialog('approve')}>
                      {a.status === 'pending' ? t('agents.actions.approve') : t('agents.actions.reactivate')}
                    </Button>
                  )}
                  {a.status === 'pending' && (
                    <Button size="sm" variant="danger" icon={<XCircle className="size-4" />} onClick={() => setDialog('reject')}>
                      {t('agents.actions.reject')}
                    </Button>
                  )}
                  {a.status === 'active' && (
                    <Button size="sm" variant="outline" icon={<Ban className="size-4" />} onClick={() => setDialog('suspend')}>
                      {t('agents.actions.suspend')}
                    </Button>
                  )}
                </>
              )
            }
          >
            <StatTiles
              items={[
                { label: t('agents.drawer.patients'), value: a.patients_count ?? '—' },
                { label: t('agents.drawer.tier'), value: AGENT_TIER_LABELS[a.tier] },
                { label: t('agents.drawer.commission'), value: a.commission_rate_bps == null ? t('agents.default') : formatBps(a.commission_rate_bps) },
                { label: t('agents.drawer.kycDocuments'), value: (a.kyc_documents ?? []).length },
              ]}
            />
          </DrawerSummary>

          {a.status === 'pending' && (
            <Banner tone="warning" icon={<ShieldAlert className="size-4" aria-hidden />} title={t('agents.drawer.waitingTitle')}>
              {t('agents.drawer.waitingBody')}
            </Banner>
          )}
          {a.rejection_reason && (a.status === 'rejected' || a.status === 'suspended') && (
            <Banner
              tone="danger"
              icon={<XCircle className="size-4" aria-hidden />}
              title={a.status === 'rejected' ? t('agents.drawer.rejectedTitle') : t('agents.drawer.suspendedTitle')}
            >
              {a.rejection_reason}
            </Banner>
          )}

          <Panel title={t('agents.drawer.contact')}>
            <FieldGrid
              items={[
                { label: t('agents.drawer.contactPerson'), value: a.full_name ?? '—' },
                {
                  label: t('agents.drawer.email'),
                  value: a.email ? (
                    <a href={`mailto:${a.email}`} className="text-primary-ink hover:underline">
                      {a.email}
                    </a>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: t('agents.drawer.phone'),
                  value: a.phone ? (
                    <a href={`tel:${a.phone}`} className="text-primary-ink hover:underline">
                      {a.phone}
                    </a>
                  ) : (
                    '—'
                  ),
                },
                {
                  label: t('agents.drawer.website'),
                  value: a.website ? (
                    <a href={a.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-ink hover:underline">
                      {a.website} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    '—'
                  ),
                },
                { label: t('agents.drawer.joined'), value: formatDateTime(a.created_at) },
                { label: t('agents.drawer.approved'), value: formatDateTime(a.approved_at) },
              ]}
            />
          </Panel>

          <Panel title={t('agents.drawer.kycDocuments')} description={t('agents.drawer.kycDescription')}>
            <DocumentList
              documents={a.kyc_documents ?? []}
              canVerify={perms.approvePartners}
              invalidate={[opsKeys.agents]}
              emptyText={t('agents.drawer.kycEmpty')}
            />
          </Panel>

          <Panel
            title={t('agents.drawer.tierCommission')}
            description={t('agents.drawer.tierCommissionDescription', { rate: defaultBps != null ? formatBps(defaultBps) : '—' })}
            footer={
              perms.editCommercials ? (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={save}
                    loading={update.isPending}
                    disabled={tier === a.tier && pct === bpsToPctInput(a.commission_rate_bps)}
                  >
                    {t('agents.drawer.saveChanges')}
                  </Button>
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('agents.drawer.tier')}>
                {(id) => (
                  <Select
                    id={id}
                    value={tier}
                    disabled={!perms.editCommercials}
                    onChange={(e) => setTier(e.target.value as AgentTier)}
                    options={enumOptions(AGENT_TIERS, AGENT_TIER_LABELS)}
                  />
                )}
              </Field>
              <Field label={t('agents.drawer.commissionPct')} error={error}>
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    value={pct}
                    placeholder={t('agents.default')}
                    disabled={!perms.editCommercials}
                    onChange={(e) => setPct(e.target.value)}
                    invalid={!!error}
                  />
                )}
              </Field>
            </div>
          </Panel>
        </div>
      )}
      <ConfirmDialog
        open={dialog === 'approve'}
        title={t('agents.confirm.approveTitle')}
        message={<Trans t={t} i18nKey="agents.confirm.approveMessage" values={{ name: a?.agency_name ?? '' }} components={{ 0: <strong /> }} />}
        confirmLabel={t('agents.actions.approve')}
        loading={approve.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => approve.mutate()}
      />
      <ReasonDialog
        open={dialog === 'reject'}
        title={t('agents.confirm.rejectTitle')}
        description={t('agents.confirm.rejectDescription')}
        confirmLabel={t('agents.actions.reject')}
        loading={reject.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(r) => reject.mutate(r)}
      />
      <ReasonDialog
        open={dialog === 'suspend'}
        title={t('agents.confirm.suspendTitle')}
        description={t('agents.confirm.suspendDescription')}
        confirmLabel={t('agents.actions.suspend')}
        loading={suspend.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(r) => suspend.mutate(r)}
      />
    </Drawer>
  );
}
