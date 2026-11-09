import { useMemo } from 'react';
import { ArrowRight, Stethoscope } from 'lucide-react';
import { SCREENING_STATUSES, URGENCIES, URGENCY_LABELS, type ScreeningOut, type ScreeningStatus } from '@hig/shared/api';
import { filterParam, matchesSearch, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  StatusBadge,
  statusTone,
  type DataTableColumn,
} from '@hig/shared/ui';
import { useScreenings } from '../../api/queries';
import { PatientStatus, TableTabs, countBy, inDateRange, patientStatusLabel, quickValue } from '../../components/listing';
import { paths } from '../../lib/paths';
import { ButtonLink, PageHeader } from '../../ui/primitives';

export function screeningHref(s: Pick<ScreeningOut, 'id' | 'status'>): string {
  if (s.status === 'draft') return paths.screeningStep(s.id, 1);
  if (s.status === 'completed') return paths.screeningResults(s.id);
  return paths.screeningProcessing(s.id);
}

const NEXT_STEP: Record<ScreeningStatus, string> = {
  draft: 'Continue answering',
  processing: 'Check progress',
  completed: 'View matches',
  failed: 'See details',
};

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(SCREENING_STATUSES),
  urgency: filterParam.list(URGENCIES),
  from: filterParam.date(),
  to: filterParam.date(),
};
const TABS: ScreeningStatus[] = ['completed', 'draft', 'processing', 'failed'];
const label = (s: ScreeningStatus) => patientStatusLabel(s, 'screening') ?? s;
const titleOf = (s: ScreeningOut) => s.specialty?.name ?? 'General screening';
const summaryOf = (s: ScreeningOut) =>
  s.ai_result?.summary ?? (s.body_areas.length ? `Areas: ${s.body_areas.join(', ')}` : s.symptoms.length ? `${s.symptoms.length} symptoms` : null);

const COLUMNS: DataTableColumn<ScreeningOut>[] = [
  {
    key: 'specialty',
    header: 'Screening',
    sticky: true,
    sortable: true,
    sortValue: titleOf,
    mobile: 'primary',
    className: 'max-w-96',
    cell: (s) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{titleOf(s)}</span>
        {summaryOf(s) ? <span className="line-clamp-1 text-xs text-muted">{summaryOf(s)}</span> : null}
      </span>
    ),
    mobileCell: (s) => <span className="font-semibold">{titleOf(s)}</span>,
    exportValue: titleOf,
  },
  {
    key: 'urgency',
    header: 'Urgency',
    sortable: true,
    sortValue: (s) => (s.urgency ? URGENCIES.indexOf(s.urgency) : null),
    mobile: 'badge',
    cell: (s) => (s.urgency ? <StatusBadge status={s.urgency} kind="urgency" /> : <span className="text-muted">—</span>),
    exportValue: (s) => (s.urgency ? URGENCY_LABELS[s.urgency] : ''),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    mobile: 'badge',
    cell: (s) => <PatientStatus status={s.status} kind="screening" />,
    exportValue: (s) => label(s.status),
  },
  {
    key: 'created_at',
    header: 'Started',
    sortable: true,
    sortDescFirst: true,
    cell: (s) => <DateCell value={s.created_at} display="date" />,
    exportValue: (s) => s.created_at,
  },
  {
    key: 'completed_at',
    header: 'Completed',
    sortable: true,
    sortDescFirst: true,
    defaultHidden: true,
    cell: (s) => <DateCell value={s.completed_at} display="date" />,
    exportValue: (s) => s.completed_at,
  },
  {
    key: 'next',
    header: 'Next step',
    exportable: false,
    mobile: 'meta',
    cell: (s) => (
      <span className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-primary-ink">
        {NEXT_STEP[s.status]} <ArrowRight className="size-3.5" aria-hidden />
      </span>
    ),
  },
];

export function ScreeningsListPage() {
  useDocumentTitle('My screenings');
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', defaultPageSize: 10 });
  const { filters, setFilter, setFilters } = table;
  const list = useScreenings({ page: 1, page_size: 100 });
  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  const base = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (s: ScreeningOut) => [titleOf(s), summaryOf(s), ...s.body_areas]))
        .filter((s) => !filters.urgency.length || (!!s.urgency && filters.urgency.includes(s.urgency)))
        .filter((s) => inDateRange(s.created_at, filters.from, filters.to)),
    [all, filters.q, filters.urgency, filters.from, filters.to],
  );
  const rows = useMemo(() => base.filter((s) => !filters.status.length || filters.status.includes(s.status)), [base, filters.status]);
  const counts = useMemo(() => countBy(base, (s) => s.status), [base]);

  return (
    <div>
      <PageHeader
        title="My screenings"
        description="Your AI screenings and their matched doctors and hospitals."
        actions={
          <ButtonLink to={paths.newScreening()} icon={<Stethoscope className="h-4 w-4" aria-hidden />}>
            New screening
          </ButtonLink>
        }
      />
      <DataTable
        id="patient.screenings"
        caption="My screenings"
        table={table}
        columns={COLUMNS}
        rows={list.data ? rows : undefined}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={screeningHref}
        rowLabel={(s) => `${NEXT_STEP[s.status]}: ${titleOf(s)}`}
        emptyIcon={<Stethoscope className="size-8" aria-hidden />}
        emptyTitle="No screenings yet"
        emptyDescription="Answer a few questions and get matched with specialists in minutes."
        emptyAction={<ButtonLink to={paths.newScreening()}>Start AI screening</ButtonLink>}
        header={
          <TableTabs
            label="Screening status"
            items={[{ value: '', label: 'All', count: base.length }, ...TABS.map((s) => ({ value: s, label: label(s), count: counts[s] ?? 0 }))]}
            value={quickValue(filters.status, TABS)}
            onChange={(s) => setFilter('status', s ? [s] : [])}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Specialty, symptom or summary…' }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-screenings" columns={COLUMNS} rows={rows} />}
          >
            <MultiSelectFilter
              label="Urgency"
              value={filters.urgency}
              onChange={(v) => setFilter('urgency', v)}
              options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u], tone: statusTone(u, 'urgency') }))}
            />
            <DateRangeFilter label="Started" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
    </div>
  );
}
