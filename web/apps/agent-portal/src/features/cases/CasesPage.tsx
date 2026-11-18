import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Building2, Download, GitCompare, Plus, ShieldAlert } from 'lucide-react';
import {
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  agentPortalApi,
  casesApi,
  type CaseListParams,
  type CaseOut,
  type CaseStatus,
} from '@hig/shared/api';
import {
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  exportCsv,
  FilterBar,
  IdCell,
  MoneyCell,
  MultiSelectFilter,
  PersonCell,
  QuickFilters,
  SelectFilter,
  StatusBadge,
  StatusBadgeCell,
  TextCell,
  statusTone,
  useActiveFilterChip,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { Button, ButtonLink, PageHeader } from '../../components/ui';
import { MAX_COMPARE } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { useHospitalOptions } from '../../lib/lookups';
import { qk } from '../../lib/queries';
import { fetchAllPages, filterParam, fromMinor, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';
import { useAppTranslation, type AppT } from '../../i18n';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const DATE_FIELDS = ['created', 'updated'] as const;
const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(CASE_STATUSES),
  hospital_id: filterParam.text(),
  urgency: filterParam.list(URGENCIES),
  /** set from a patient page ("View cases") */
  patient: filterParam.text(),
  date_field: filterParam.oneOf(DATE_FIELDS, 'created'),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['updated_at', 'created_at', 'case_number', 'status'] as const;
const QUICK_STATUSES: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];

type CaseFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: CaseFilters): Omit<CaseListParams, 'page' | 'page_size' | 'sort'> {
  const dateKey = f.date_field === 'updated' ? 'updated' : 'created';
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    hospital_id: f.hospital_id || undefined,
    urgency: f.urgency.length ? f.urgency : undefined,
    patient_id: f.patient || undefined,
    [`${dateKey}_from`]: f.from || undefined,
    [`${dateKey}_to`]: f.to || undefined,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
const columns = (t: AppT): DataTableColumn<CaseOut>[] => [
  {
    key: 'case',
    header: t('cases.columns.case'),
    sortable: true,
    sortKey: 'case_number',
    sticky: true,
    mobile: 'secondary',
    cell: (c) => <IdCell value={c.case_number} secondary={c.procedure?.name ?? c.specialty?.name ?? t('cases.generalEnquiry')} />,
    mobileCell: (c) => (
      <span className="font-mono text-xs">
        {c.case_number} · {c.procedure?.name ?? c.specialty?.name ?? t('cases.generalEnquiry')}
      </span>
    ),
    exportValue: (c) => c.case_number,
  },
  {
    key: 'patient',
    header: t('cases.columns.patient'),
    mobile: 'primary',
    className: 'max-w-52',
    cell: (c) => (
      <PersonCell
        name={c.patient.full_name}
        secondary={[c.patient.nationality, c.patient.age != null ? t('cases.ageShort', { count: c.patient.age }) : null].filter(Boolean).join(' · ') || undefined}
      />
    ),
    exportValue: (c) => c.patient.full_name,
  },
  {
    key: 'hospital',
    header: t('cases.columns.hospital'),
    className: 'max-w-56',
    cell: (c) => <TextCell primary={c.hospital.name} secondary={c.hospital.city} />,
    exportValue: (c) => c.hospital.name,
  },
  {
    key: 'status',
    header: t('cases.columns.status'),
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
    key: 'quote',
    header: t('cases.columns.latestQuote'),
    align: 'end',
    cell: (c) =>
      c.latest_quote ? (
        <MoneyCell
          minor={c.latest_quote.total_minor}
          currency={c.latest_quote.currency}
          secondary={<StatusBadge status={c.latest_quote.status} kind="quote" dot={false} className="bg-transparent px-0" />}
        />
      ) : (
        <span className="text-xs text-muted">{t('cases.awaitingQuote')}</span>
      ),
    exportValue: (c) => (c.latest_quote ? `${c.latest_quote.currency} ${fromMinor(c.latest_quote.total_minor, c.latest_quote.currency)}` : ''),
  },
  {
    key: 'urgency',
    header: t('cases.columns.urgency'),
    defaultHidden: true,
    cell: (c) => (c.urgency ? <StatusBadge status={c.urgency} kind="urgency" dot /> : <span className="text-muted">—</span>),
    exportValue: (c) => (c.urgency ? URGENCY_LABELS[c.urgency] : ''),
  },
  {
    key: 'updated',
    header: t('cases.columns.updated'),
    sortable: true,
    sortKey: 'updated_at',
    sortDescFirst: true,
    cell: (c) => <DateCell value={c.updated_at} display="relative" className="text-muted" />,
    exportValue: (c) => c.updated_at,
  },
  {
    key: 'created',
    header: t('cases.columns.opened'),
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (c) => <DateCell value={c.created_at} display="date" />,
    exportValue: (c) => c.created_at,
  },
];

/** Registers the "Patient: <name>" chip for the ?patient= filter (set from a patient page). */
function PatientChip({ patientId, onClear }: { patientId: string; onClear: () => void }) {
  const patient = useQuery({
    queryKey: qk.patient(patientId),
    queryFn: () => agentPortalApi.getPatient(patientId),
    enabled: Boolean(patientId),
  });
  const { t } = useAppTranslation();
  useActiveFilterChip(t('cases.patientChip'), patientId ? (patient.data ? patientName(patient.data) : t('cases.selectedPatient')) : null, onClear);
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export function CasesPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('cases.documentTitle'));
  const COLUMNS = useMemo(() => columns(t), [t]);
  const navigate = useNavigate();
  const table = useTableState({ filters: FILTERS, defaultSort: '-updated_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: CaseListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: qk.cases(listParams),
    queryFn: () => casesApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  // per-status counts for the same filters (status ignored; scoped to the agency server-side)
  const counts = useQuery({
    queryKey: qk.cases({ statusCounts: apiFilters }),
    queryFn: () => casesApi.statusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const hospitals = useHospitalOptions();

  const statusOptions: FilterOption<CaseStatus>[] = CASE_STATUSES.map((s) => ({
    value: s,
    label: CASE_STATUS_LABELS[s],
    tone: statusTone(s, 'case'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<CaseStatus>[] = [
    { value: '', label: t('cases.quick.all'), count: counts.data?.total },
    ...QUICK_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_LABELS[s], count: counts.data?.counts[s] })),
  ];
  const quickValue =
    filters.status.length === 0 ? '' : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!) ? filters.status[0]! : null;

  return (
    <div>
      <PageHeader
        title={t('cases.title')}
        description={t('cases.description')}
        actions={
          <ButtonLink to={filters.patient ? `/cases/new?patient=${filters.patient}` : '/cases/new'} icon={<Plus className="h-4 w-4" aria-hidden />}>
            {t('cases.newEnquiry')}
          </ButtonLink>
        }
      />
      <DataTable
        id="agent.cases"
        caption={t('cases.documentTitle')}
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(c) => `/cases/${c.id}`}
        rowLabel={(c) => t('cases.openRow', { number: c.case_number })}
        selectable
        bulkActions={(selected, clear) => {
          const tooMany = selected.length > MAX_COMPARE;
          return (
            <>
              <Button
                size="sm"
                icon={<GitCompare className="h-4 w-4" aria-hidden />}
                disabled={selected.length < 2 || tooMany}
                title={tooMany ? t('cases.compareMax', { max: MAX_COMPARE }) : selected.length < 2 ? t('cases.compareMin') : undefined}
                onClick={() => navigate(`/cases/compare?ids=${selected.map((c) => c.id).join(',')}`)}
              >
                {tooMany ? t('cases.compareQuotesMax', { max: MAX_COMPARE }) : t('cases.compareQuotes')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<Download className="h-4 w-4" aria-hidden />}
                onClick={() => {
                  exportCsv(selected, COLUMNS, `cases-selected-${new Date().toISOString().slice(0, 10)}`);
                  clear();
                }}
              >
                {t('cases.exportSelected')}
              </Button>
            </>
          );
        }}
        emptyTitle={t('cases.emptyTitle')}
        emptyDescription={t('cases.emptyDescription')}
        emptyAction={<ButtonLink to="/cases/new">{t('cases.newEnquiry')}</ButtonLink>}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('cases.filters.caseStatus')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('cases.filters.searchPlaceholder'), label: t('cases.filters.searchLabel') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="cases"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => casesApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
            more={
              <MultiSelectFilter
                label={t('cases.filters.urgency')}
                icon={<ShieldAlert className="size-3.5 opacity-70" aria-hidden />}
                value={filters.urgency}
                onChange={(v) => setFilter('urgency', v)}
                options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u], tone: statusTone(u, 'urgency') }))}
              />
            }
          >
            {filters.patient && <PatientChip patientId={filters.patient} onClear={() => setFilter('patient', '')} />}
            <MultiSelectFilter label={t('cases.filters.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <SelectFilter
              label={t('cases.filters.hospital')}
              icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.hospital_id}
              onChange={(v) => setFilter('hospital_id', v)}
              options={hospitals.data ?? []}
              loading={hospitals.isLoading}
              searchable
            />
            <DateRangeFilter
              label={t('cases.filters.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: t('cases.filters.opened') },
                { value: 'updated', label: t('cases.filters.updated') },
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


