import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, Download, ShieldAlert, Siren } from 'lucide-react';
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
import { useAppTranslation } from '../../i18n';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { caseColumns } from './CasesTable';

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
const SORT_KEYS = ['created_at', 'updated_at', 'case_number', 'status', 'quote_due_at'] as const;
const QUICK_STATUSES: CaseStatus[] = ['enquiry', 'quoted', 'accepted', 'booked', 'in_treatment', 'completed'];
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
  const { t } = useAppTranslation();
  useDocumentTitle(t('cases.list.title'));
  const { current } = useHospital();
  const columns = useMemo(() => caseColumns(t), [t]);
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
    { value: '', label: t('common.all'), count: counts.data?.total },
    ...QUICK_STATUSES.map((s) => ({
      value: s,
      label: s === 'enquiry' ? t('cases.list.quickNew') : CASE_STATUS_LABELS[s],
      count: counts.data?.counts[s],
    })),
  ];
  const quickValue =
    filters.status.length === 0 ? '' : filters.status.length === 1 && QUICK_STATUSES.includes(filters.status[0]!) ? filters.status[0]! : null;
  const respondFirst = table.sortParam === 'quote_due_at';
  const urgentOnly = filters.urgency.length === URGENT.length && URGENT.every((u) => filters.urgency.includes(u));

  return (
    <div>
      <PageHeader
        title={t('cases.list.title')}
        description={t('cases.list.description')}
        actions={
          <>
          <Button
            variant={respondFirst ? 'primary' : 'outline'}
            leftIcon={<AlarmClock className="size-4" aria-hidden />}
            aria-pressed={respondFirst}
            onClick={() => table.setSort(respondFirst ? { key: 'created_at', direction: 'desc' } : { key: 'quote_due_at', direction: 'asc' })}
          >
            {t('cases.respondBy.sortButton')}
          </Button>
          <Button
            variant={urgentOnly ? 'primary' : 'outline'}
            leftIcon={<Siren className="size-4" aria-hidden />}
            aria-pressed={urgentOnly}
            onClick={() => setFilter('urgency', urgentOnly ? [] : URGENT)}
          >
            {urgentOnly ? t('cases.list.showingUrgentOnly') : t('cases.list.urgentAndEmergency')}
          </Button>
          </>
        }
      />
      <DataTable
        id="hospital.cases"
        caption={t('cases.list.caption')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(c) => `/cases/${c.id}`}
        rowLabel={(c) => t('cases.table.openCase', { number: c.case_number })}
        selectable
        bulkActions={(selected, clear) => (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download className="size-4" aria-hidden />}
            onClick={() => {
              exportCsv(selected, columns, `enquiries-selected-${new Date().toISOString().slice(0, 10)}`);
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
            <QuickFilters label={t('cases.list.caseStatus')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('cases.list.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="enquiries"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => casesApi.list({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
          >
            <MultiSelectFilter label={t('common.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label={t('cases.table.urgency')}
              icon={<ShieldAlert className="size-3.5 opacity-70" aria-hidden />}
              value={filters.urgency}
              onChange={(v) => setFilter('urgency', v)}
              options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u], tone: statusTone(u, 'urgency') }))}
            />
            <DateRangeFilter
              label={t('common.date')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
              fieldOptions={[
                { value: 'created', label: t('cases.table.received') },
                { value: 'updated', label: t('cases.table.lastActivity') },
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
