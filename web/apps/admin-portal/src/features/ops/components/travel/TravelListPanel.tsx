import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Tags } from 'lucide-react';
import { travelApi, type Page, type TravelResource } from '@hig/shared/api';
import { fetchAllPages, filterParam, useTableState } from '@hig/shared/lib';
import {
  DataTable,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  QuickFilters,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
  type StatusKind,
} from '@hig/shared/ui';
import { opsKeys } from '../../lib/mutations';
import { opsPaths } from '../../lib/paths';

export interface TravelQuery {
  status?: string[];
  kind?: string[];
  q?: string;
  from?: string;
  to?: string;
  page: number;
  page_size: number;
}

export interface TravelListPanelProps<T extends { id: string }> {
  resource: TravelResource;
  /** DataTable id + CSV file name, e.g. "visa" */
  name: string;
  caption: string;
  fetchPage: (params: TravelQuery) => Promise<Page<T>>;
  columns: DataTableColumn<T>[];
  statuses: readonly string[];
  statusLabels: Record<string, string>;
  statusKind: StatusKind;
  /** statuses shown as quick tabs (default: all) */
  quickStatuses?: readonly string[];
  kinds?: { label: string; options: readonly FilterOption[] };
  /** label of the date-range pill (the key date of the resource) */
  dateLabel: string;
  onRowClick?: (row: T) => void;
  rowLabel?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  emptyTitle: string;
  emptyDescription?: ReactNode;
  /** poll interval (SOS) */
  refetchInterval?: number;
}

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(),
  kind: filterParam.list(),
  from: filterParam.date(),
  to: filterParam.date(),
};

/** Server-paginated travel-desk list: status tabs with counts, one filter row, rich table. */
export function TravelListPanel<T extends { id: string }>({
  resource,
  name,
  caption,
  fetchPage,
  columns,
  statuses,
  statusLabels,
  statusKind,
  quickStatuses = statuses,
  kinds,
  dateLabel,
  onRowClick,
  rowLabel,
  rowClassName,
  emptyTitle,
  emptyDescription,
  refetchInterval,
}: TravelListPanelProps<T>) {
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(
    () => ({
      q: filters.q.trim() || undefined,
      status: filters.status.length ? filters.status : undefined,
      kind: kinds && filters.kind.length ? filters.kind : undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    [filters, kinds],
  );
  const params: TravelQuery = { ...apiFilters, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...opsKeys.travel, resource, 'list', params],
    queryFn: () => fetchPage(params),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
  const counts = useQuery({
    queryKey: [...opsKeys.travel, resource, 'status-counts', apiFilters],
    queryFn: () => travelApi.statusCounts({ resource, q: apiFilters.q, kind: apiFilters.kind, from: apiFilters.from, to: apiFilters.to }),
    placeholderData: keepPreviousData,
    refetchInterval,
  });

  const statusOptions: FilterOption[] = statuses.map((s) => ({
    value: s,
    label: statusLabels[s] ?? s,
    tone: statusTone(s, statusKind),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...quickStatuses.map((s) => ({ value: s, label: statusLabels[s] ?? s, count: counts.data?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 && quickStatuses.includes(filters.status[0]!) ? filters.status[0]! : null;

  return (
    <DataTable
      id={`admin.travel.${name}`}
      caption={caption}
      table={table}
      columns={columns}
      rows={list.data?.items}
      total={list.data?.total}
      loading={list.isLoading}
      fetching={list.isFetching && !list.isLoading}
      error={list.error}
      onRetry={() => void list.refetch()}
      onRowClick={onRowClick}
      rowLabel={rowLabel}
      rowClassName={rowClassName}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      header={
        <div className="border-b border-border px-2 sm:px-3">
          <QuickFilters label={`${caption} status`} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
        </div>
      }
      toolbar={
        <FilterBar
          search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Patient name…' }}
          onReset={table.resetFilters}
          actions={
            <ExportButton
              filename={`travel-${name}`}
              columns={columns}
              rows={list.data?.items}
              total={list.data?.total}
              fetchAll={() => fetchAllPages((page, size) => fetchPage({ ...apiFilters, page, page_size: size }))}
            />
          }
        >
          <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
          {kinds && (
            <MultiSelectFilter
              label={kinds.label}
              icon={<Tags className="size-3.5 opacity-70" aria-hidden />}
              value={filters.kind}
              onChange={(v) => setFilter('kind', v)}
              options={kinds.options}
            />
          )}
          <DateRangeFilter label={dateLabel} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
        </FilterBar>
      }
    />
  );
}

/** Patient name + "Open case" link (stops the row click). */
export function PatientCaseCell({ name, caseId, caseNumber }: { name: string | null | undefined; caseId: string | null | undefined; caseNumber?: string | null }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-fg">{name ?? '—'}</span>
      {caseId && (
        <Link
          to={opsPaths.case(caseId)}
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {caseNumber ? `Case ${caseNumber}` : 'Open case'}
        </Link>
      )}
    </span>
  );
}
