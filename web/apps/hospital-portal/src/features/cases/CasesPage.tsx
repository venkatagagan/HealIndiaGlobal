import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, ShieldAlert, Siren } from 'lucide-react';
import {
  casesApi,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  type CaseListParams,
  type CaseStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Button,
  DataTable,
  DateRangeFilter,
  ExportButton,
  exportCsv,
  FilterBar,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  statusTone,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useHospital } from '../../auth/HospitalProvider';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { CASE_COLUMNS } from './CasesTable';

// URL state: ?status=enquiry,quoted&urgency=emergency&from=2026-10-01&sort=-created_at&page=2
const DATE_FIELDS = ['created', 'updated'] as const;
const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(CASE_STATUSES),
  urgency: filterParam.list(URGENCIES),
  date_field: filterParam.oneOf(DATE_FIELDS, 'created'),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['created_at', 'updated_at', 'case_number', 'status'] as const;
const QUICK_STATUSES: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];
const QUICK_LABELS: Partial<Record<CaseStatus, string>> = { enquiry: 'New' };
const URGENT: ('urgent' | 'emergency')[] = ['urgent', 'emergency'];

type CaseFilters = FilterValues<typeof FILTERS>;

/** URL filters -> GET /cases params (list, status counts and export share them). */
function toApiFilters(f: CaseFilters, hospitalId: string | undefined): Omit<CaseListParams, 'page' | 'page_size' | 'sort'> {
  const dateKey = f.date_field === 'updated' ? 'updated' : 'created';
  return {
    // /cases already scopes to the user's hospitals; pin it to the selected one for multi-hospital members
    hospital_id: hospitalId,
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    urgency: f.urgency.length ? f.urgency : undefined,
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
  };
}

export function CasesPage() {
  useDocumentTitle('Enquiries & cases');
  const { current } = useHospital();
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters, current?.id), [filters, current?.id]);
  const listParams: CaseListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: ['cases', 'list', listParams],
    queryFn: () => casesApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: ['cases', 'status-counts', apiFilters],
    queryFn: () => casesApi.statusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });

  const statusOptions: FilterOption<CaseStatus>[] = CASE_STATUSES.map((s) => ({
    value: s,
    label: CASE_STATUS_LABELS[s],
    tone: statusTone(s, 'case'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<CaseStatus>[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: QUICK_LABELS[s] ?? CASE_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue =
    filters.status.length === 0 ? '' : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!) ? filters.status[0]! : null;
  const urgentOnly = filters.urgency.length === URGENT.length && URGENT.every((u) => filters.urgency.includes(u));

  return (
    <div>
      <PageHeader
        title="Enquiries & cases"
        description="Patient enquiries routed to your hospital, from first contact to discharge."
        actions={
          <Button
            variant={urgentOnly ? 'primary' : 'outline'}
            leftIcon={<Siren className="size-4" aria-hidden />}
            aria-pressed={urgentOnly}
            onClick={() => setFilter('urgency', urgentOnly ? [] : URGENT)}
          >
            {urgentOnly ? 'Showing urgent only' : 'Urgent & emergency'}
          </Button>
        }
      />
      <DataTable
        id="hospital.cases"
        caption="Enquiries and cases"
        table={table}
        columns={CASE_COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(c) => `/cases/${c.id}`}
        rowLabel={(c) => `Open case ${c.case_number}`}
        selectable
        bulkActions={(selected, clear) => (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              exportCsv(selected, CASE_COLUMNS, `enquiries-selected-${new Date().toISOString().slice(0, 10)}`);
              clear();
            }}
          >
            Export selected
          </Button>
        )}
        emptyTitle="No enquiries yet"
        emptyDescription="New patient enquiries appear here. Keep your profile, doctors and procedures complete to be matched more often."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Case status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Case number or patient…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="enquiries"
                columns={CASE_COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => casesApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label="Urgency"
              icon={<ShieldAlert className="size-3.5 opacity-70" aria-hidden />}
              value={filters.urgency}
              onChange={(v) => setFilter('urgency', v)}
              options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u], tone: statusTone(u, 'urgency') }))}
            />
            <DateRangeFilter
              label="Date"
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: 'Received' },
                { value: 'updated', label: 'Last activity' },
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
