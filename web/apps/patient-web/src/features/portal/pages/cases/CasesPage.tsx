import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BriefcaseMedical, Building2 } from 'lucide-react';
import { casesApi, CASE_STATUSES, type CaseListParams, type CaseOut, type CaseStatus } from '@hig/shared/api';
import { fetchAllPages, filterParam, formatDate, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  SelectFilter,
  TextCell,
  statusTone,
  type DataTableColumn,
  type FilterOption,
} from '@hig/shared/ui';
import { PatientStatus, TableTabs, patientStatusLabel, quickValue } from '../../components/listing';
import { paths } from '../../lib/paths';
import { ButtonLink, PageHeader } from '../../ui/primitives';

const DATE_FIELDS = ['created', 'updated'] as const;
const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(CASE_STATUSES),
  hospital_id: filterParam.text(),
  date_field: filterParam.oneOf(DATE_FIELDS, 'created'),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['updated_at', 'created_at', 'case_number', 'status'] as const;
const TABS: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];

function toApiFilters(f: FilterValues<typeof FILTERS>): Omit<CaseListParams, 'page' | 'page_size' | 'sort'> {
  const key = f.date_field === 'updated' ? 'updated' : 'created';
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    hospital_id: f.hospital_id || undefined,
    [`${key}_from`]: f.from || undefined,
    [`${key}_to`]: f.to || undefined,
  };
}

const caseLabel = (s: CaseStatus) => patientStatusLabel(s, 'case') ?? s;
const treatmentOf = (c: CaseOut) => c.procedure?.name ?? c.specialty?.name ?? 'Treatment enquiry';

const COLUMNS: DataTableColumn<CaseOut>[] = [
  {
    key: 'treatment',
    header: 'Treatment',
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (c) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{treatmentOf(c)}</span>
        <span className="block truncate font-mono text-xs text-muted">{c.case_number}</span>
      </span>
    ),
    mobileCell: (c) => (
      <span className="block">
        <span className="block font-semibold">{treatmentOf(c)}</span>
        <span className="block font-mono text-xs font-normal text-muted">{c.case_number}</span>
      </span>
    ),
    exportValue: treatmentOf,
  },
  {
    key: 'hospital',
    header: 'Hospital',
    className: 'max-w-60',
    cell: (c) => <TextCell primary={c.hospital.name} secondary={[c.hospital.city, c.doctor?.full_name].filter(Boolean).join(' · ')} />,
    exportValue: (c) => `${c.hospital.name}, ${c.hospital.city}`,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (c) => <PatientStatus status={c.status} kind="case" />,
    exportValue: (c) => caseLabel(c.status),
  },
  {
    key: 'quote',
    header: 'Latest quote',
    align: 'end',
    cell: (c) =>
      c.latest_quote ? (
        <MoneyCell
          minor={c.latest_quote.total_minor}
          currency={c.latest_quote.currency}
          secondary={patientStatusLabel(c.latest_quote.status, 'quote')}
        />
      ) : (
        <span className="block text-end text-xs text-muted">Not yet</span>
      ),
    exportValue: (c) => (c.latest_quote ? `${c.latest_quote.currency} ${fromMinor(c.latest_quote.total_minor, c.latest_quote.currency)}` : ''),
  },
  {
    key: 'updated',
    header: 'Last update',
    sortable: true,
    sortKey: 'updated_at',
    sortDescFirst: true,
    cell: (c) => <DateCell value={c.updated_at} display="relative" className="text-muted" />,
    exportValue: (c) => c.updated_at,
  },
  {
    key: 'created',
    header: 'Opened',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (c) => <DateCell value={c.created_at} display="date" />,
    exportValue: (c) => c.created_at,
  },
  {
    key: 'case_number',
    header: 'Case number',
    sortable: true,
    defaultHidden: true,
    mobile: 'hidden',
    cell: (c) => <IdCell value={c.case_number} secondary={`Opened ${formatDate(c.created_at)}`} />,
    exportValue: (c) => c.case_number,
  },
];

export function CasesPage() {
  useDocumentTitle('My cases');
  const table = useTableState({ filters: FILTERS, defaultSort: '-updated_at', sortKeys: SORT_KEYS, defaultPageSize: 10 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const params: CaseListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({ queryKey: ['cases', 'list', params], queryFn: () => casesApi.list(params), placeholderData: keepPreviousData });
  const counts = useQuery({
    queryKey: ['cases', 'status-counts', apiFilters],
    queryFn: () => casesApi.statusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  // the patient's hospitals (a patient has a handful of cases) - options for the Hospital filter
  const hospitals = useQuery({
    queryKey: ['cases', 'list', { page_size: 100, purpose: 'hospital-options' }],
    queryFn: () => casesApi.list({ page: 1, page_size: 100 }),
    select: (p): FilterOption[] => {
      const seen = new Map<string, FilterOption>();
      for (const c of p.items) if (!seen.has(c.hospital.id)) seen.set(c.hospital.id, { value: c.hospital.id, label: c.hospital.name, description: c.hospital.city });
      return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    },
    staleTime: 60_000,
  });

  const statusOptions: FilterOption<CaseStatus>[] = CASE_STATUSES.map((s) => ({
    value: s,
    label: caseLabel(s),
    tone: statusTone(s, 'case'),
    count: counts.data?.counts[s],
  }));

  return (
    <div>
      <PageHeader
        title="My cases"
        description="Each quote request to a hospital is a case. Follow quotes, bookings and messages here."
        actions={<ButtonLink to={paths.newScreening()}>Find a hospital</ButtonLink>}
      />
      <DataTable
        id="patient.cases"
        caption="My cases"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(c) => paths.case(c.id)}
        rowLabel={(c) => `Open case ${c.case_number}`}
        emptyIcon={<BriefcaseMedical className="size-8" aria-hidden />}
        emptyTitle="No cases yet"
        emptyDescription="Complete an AI screening and request a quote from a matched hospital to open a case."
        emptyAction={<ButtonLink to={paths.newScreening()}>Start AI screening</ButtonLink>}
        header={
          <TableTabs
            label="Case status"
            items={[
              { value: '', label: 'All', count: counts.data?.total },
              ...TABS.map((s) => ({ value: s, label: caseLabel(s), count: counts.data?.counts[s] })),
            ]}
            value={quickValue(filters.status, TABS)}
            onChange={(s) => setFilter('status', s ? [s] : [])}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Search by case number…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="my-cases"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => casesApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label="Hospital"
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital_id}
              onChange={(v) => setFilter('hospital_id', v)}
              options={hospitals.data ?? []}
              loading={hospitals.isLoading}
            />
            <DateRangeFilter
              label="Date"
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: 'Opened' },
                { value: 'updated', label: 'Last update' },
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
