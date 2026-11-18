import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Building2, Download, ShieldAlert, UserCog } from 'lucide-react';
import {
  adminApi,
  casesApi,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  type CaseListParams,
  type CaseOut,
  type CaseStatus,
} from '@hig/shared/api';
import {
  fetchAllPages,
  filterParam,
  formatDate,
  fromMinor,
  useDocumentTitle,
  useTableState,
  type FilterValues,
} from '@hig/shared/lib';
import {
  Badge,
  Button,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  exportCsv,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useCoordinatorOptions, useHospitalOptions } from '../lib/lookups';
import { opsKeys } from '../lib/mutations';
import { opsPaths } from '../lib/paths';
import { useAppTranslation } from '../../../i18n';

type T = ReturnType<typeof useAppTranslation>['t'];

// ---------------------------------------------------------------------------------------------------------
// URL state: every filter, the sort and the page live in the query string (?status=quoted,booked&sort=-updated_at)
// ---------------------------------------------------------------------------------------------------------
const UNASSIGNED = 'unassigned';
const OPEN_STATUSES: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment'];
const DATE_FIELDS = ['created', 'updated'] as const;

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(CASE_STATUSES),
  hospital_id: filterParam.text(),
  agent_id: filterParam.text(),
  /** coordinator user id, or "unassigned" */
  coordinator: filterParam.text(),
  urgency: filterParam.list(URGENCIES),
  date_field: filterParam.oneOf(DATE_FIELDS, 'created'),
  from: filterParam.date(),
  to: filterParam.date(),
};

const SORT_KEYS = ['updated_at', 'created_at', 'case_number', 'status'] as const;

type CaseFilters = FilterValues<typeof FILTERS>;

/** URL filters -> GET /cases query params (shared by the list, the status counts and the export). */
function toApiFilters(f: CaseFilters): Omit<CaseListParams, 'page' | 'page_size' | 'sort'> {
  const dateKey = f.date_field === 'updated' ? 'updated' : 'created';
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    hospital_id: f.hospital_id || undefined,
    agent_id: f.agent_id || undefined,
    coordinator_id: f.coordinator && f.coordinator !== UNASSIGNED ? f.coordinator : undefined,
    unassigned: f.coordinator === UNASSIGNED || undefined,
    urgency: f.urgency.length ? f.urgency : undefined,
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
  };
}

const QUICK_STATUSES: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function patientLine(t: T, c: CaseOut): string {
  return [c.patient.nationality, c.patient.age != null ? t('cases.list.age', { age: c.patient.age }) : null, c.agent ? t('cases.list.via', { agency: c.agent.agency_name }) : null]
    .filter(Boolean)
    .join(' · ');
}

const caseColumns = (t: T): DataTableColumn<CaseOut>[] => [
  {
    key: 'case',
    header: t('cases.list.columns.case'),
    sortable: true,
    sortKey: 'case_number',
    sticky: true,
    mobile: 'secondary',
    cell: (c) => <IdCell value={c.case_number} secondary={t('cases.list.opened', { date: formatDate(c.created_at) })} />,
    mobileCell: (c) => (
      <span className="font-mono text-xs">
        {t('cases.list.mobileOpened', { number: c.case_number, date: formatDate(c.created_at) })}
      </span>
    ),
    exportValue: (c) => c.case_number,
  },
  {
    key: 'patient',
    header: t('cases.list.columns.patient'),
    mobile: 'primary',
    className: 'max-w-52',
    cell: (c) => <PersonCell name={c.patient.full_name} secondary={patientLine(t, c) || undefined} />,
    exportValue: (c) => c.patient.full_name,
  },
  {
    key: 'hospital',
    header: t('cases.list.columns.hospital'),
    title: t('cases.list.columns.hospital'),
    className: 'max-w-52',
    cell: (c) => <TextCell primary={c.hospital.name} secondary={c.procedure?.name ?? c.specialty?.name ?? c.hospital.city} />,
    exportValue: (c) => c.hospital.name,
  },
  {
    key: 'status',
    header: t('cases.list.columns.status'),
    sortable: true,
    mobile: 'badge',
    cell: (c) => (
      <span className="flex flex-col items-start gap-1">
        <StatusBadgeCell status={c.status} kind="case" />
        {(c.urgency === 'urgent' || c.urgency === 'emergency') && <StatusBadge status={c.urgency} kind="urgency" dot={false} />}
      </span>
    ),
    mobileCell: (c) => <StatusBadgeCell status={c.status} kind="case" />,
    exportValue: (c) => CASE_STATUS_LABELS[c.status],
  },
  {
    key: 'urgency',
    header: t('cases.list.columns.urgency'),
    mobile: 'badge',
    defaultHidden: true,
    cell: (c) =>
      c.urgency ? (
        <StatusBadge status={c.urgency} kind="urgency" dot />
      ) : (
        <span className="text-muted" aria-label={t('cases.list.noScreening')}>
          —
        </span>
      ),
    mobileCell: (c) => (c.urgency && c.urgency !== 'routine' ? <StatusBadge status={c.urgency} kind="urgency" /> : null),
    exportValue: (c) => (c.urgency ? URGENCY_LABELS[c.urgency] : ''),
  },
  {
    key: 'quote',
    header: t('cases.list.columns.latestQuote'),
    align: 'end',
    cell: (c) => (
      <MoneyCell
        minor={c.latest_quote?.total_minor}
        currency={c.latest_quote?.currency}
        secondary={c.latest_quote ? <StatusBadge status={c.latest_quote.status} kind="quote" dot={false} className="bg-transparent px-0" /> : undefined}
      />
    ),
    exportValue: (c) => (c.latest_quote ? `${c.latest_quote.currency} ${fromMinor(c.latest_quote.total_minor, c.latest_quote.currency)}` : ''),
  },
  {
    key: 'coordinator',
    header: t('cases.list.columns.coordinator'),
    cell: (c) =>
      c.coordinator ? (
        <PersonCell name={c.coordinator.full_name} />
      ) : (
        <Badge tone="warning" dot>
          {t('cases.list.unassigned')}
        </Badge>
      ),
    exportValue: (c) => c.coordinator?.full_name ?? t('cases.list.unassigned'),
  },
  {
    key: 'updated',
    header: t('cases.list.columns.updated'),
    sortable: true,
    sortKey: 'updated_at',
    sortDescFirst: true,
    cell: (c) => <DateCell value={c.updated_at} display="relative" className="text-muted" />,
    exportValue: (c) => c.updated_at,
  },
  {
    key: 'created',
    header: t('cases.list.columns.created'),
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (c) => <DateCell value={c.created_at} display="date" />,
    exportValue: (c) => c.created_at,
  },
];

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function CasesPage() {
  const { t } = useAppTranslation();
  const columns = useMemo(() => caseColumns(t), [t]);
  useDocumentTitle(t('cases.list.title'));
  const table = useTableState({ filters: FILTERS, defaultSort: '-updated_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: CaseListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...opsKeys.cases, 'list', listParams],
    queryFn: () => casesApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  // per-status counts for the same filters (status ignored) - drives the tabs and the status options
  const counts = useQuery({
    queryKey: [...opsKeys.cases, 'status-counts', apiFilters],
    queryFn: () => casesApi.statusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const unassigned = useQuery({
    queryKey: [...opsKeys.cases, 'status-counts', { unassigned: true }],
    queryFn: () => casesApi.statusCounts({ unassigned: true }),
    select: (r) => OPEN_STATUSES.reduce((sum, s) => sum + (r.counts[s] ?? 0), 0),
  });

  const hospitals = useHospitalOptions();
  const coordinators = useCoordinatorOptions();
  const agents = useQuery({
    queryKey: [...opsKeys.agents, 'options'],
    queryFn: () => adminApi.listAgents({ page: 1, page_size: 100 }),
    select: (p) => p.items.map((a) => ({ value: a.id, label: a.agency_name, description: a.agent_code })),
    staleTime: 5 * 60_000,
  });

  const statusOptions: FilterOption<CaseStatus>[] = CASE_STATUSES.map((s) => ({
    value: s,
    label: CASE_STATUS_LABELS[s],
    tone: statusTone(s, 'case'),
    count: counts.data?.counts[s],
  }));
  const coordinatorOptions: FilterOption[] = [
    { value: UNASSIGNED, label: t('cases.list.unassigned'), tone: 'warning' },
    ...(coordinators.data ?? []).map((u) => ({ value: u.id, label: u.full_name, description: u.email ?? undefined })),
  ];
  const quickItems: QuickFilterItem<CaseStatus>[] = [
    { value: '', label: t('cases.list.all'), count: counts.data?.total },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!) ? filters.status[0]! : null;
  const showingUnassigned = filters.coordinator === UNASSIGNED;

  return (
    <div>
      <PageHeader
        title={t('cases.list.title')}
        description={t('cases.list.description')}
        actions={
          <Button
            variant={showingUnassigned ? 'outline' : 'primary'}
            leftIcon={<UserCog className="size-4" aria-hidden />}
            onClick={() =>
              showingUnassigned ? setFilters({ coordinator: '', status: [] }) : setFilters({ coordinator: UNASSIGNED, status: OPEN_STATUSES })
            }
          >
            {showingUnassigned ? t('cases.list.showAll') : t('cases.list.needsCoordinator')}
            {!showingUnassigned && unassigned.data !== undefined && (
              <span className="rounded-full bg-primary-fg/15 px-1.5 text-xs font-semibold tabular-nums">{unassigned.data}</span>
            )}
          </Button>
        }
      />
      <DataTable
        id="admin.cases"
        caption={t('cases.list.title')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(c) => opsPaths.case(c.id)}
        rowLabel={(c) => t('cases.list.rowLabel', { number: c.case_number })}
        selectable
        bulkActions={(selected, clear) => (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              exportCsv(selected, columns, `cases-selected-${new Date().toISOString().slice(0, 10)}`);
              clear();
            }}
          >
            {t('cases.list.exportSelected')}
          </Button>
        )}
        emptyTitle={t('cases.list.emptyTitle')}
        emptyDescription={t('cases.list.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('cases.list.caseStatus')}
              items={quickItems}
              value={quickValue}
              onChange={(s) => setFilter('status', s ? [s] : [])}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('cases.list.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="cases"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => casesApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
            more={
              <>
                <SelectFilter
                  label={t('cases.list.filters.agent')}
                  value={filters.agent_id}
                  onChange={(v) => setFilter('agent_id', v)}
                  options={agents.data ?? []}
                  loading={agents.isLoading}
                  searchable
                />
                <MultiSelectFilter
                  label={t('cases.list.columns.urgency')}
                  icon={<ShieldAlert className="size-3.5 opacity-70" aria-hidden />}
                  value={filters.urgency}
                  onChange={(v) => setFilter('urgency', v)}
                  options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u], tone: statusTone(u, 'urgency') }))}
                />
              </>
            }
          >
            <MultiSelectFilter label={t('cases.list.columns.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label={t('cases.list.columns.hospital')}
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital_id}
              onChange={(v) => setFilter('hospital_id', v)}
              options={hospitals.data ?? []}
              loading={hospitals.isLoading}
              searchable
            />
            <SelectFilter
              label={t('cases.list.columns.coordinator')}
              value={filters.coordinator}
              onChange={(v) => setFilter('coordinator', v)}
              options={coordinatorOptions}
              loading={coordinators.isLoading}
            />
            <DateRangeFilter
              label={t('cases.list.filters.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: t('cases.list.columns.created') },
                { value: 'updated', label: t('cases.list.columns.updated') },
              ]}
              field={filters.date_field || 'created'}
              onFieldChange={(date_field) => setFilter('date_field', date_field)}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
