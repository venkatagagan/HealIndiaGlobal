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
import { useAppTranslation } from '../../../../i18n';
import { useScreenings } from '../../api/queries';
import { PatientStatus, TableTabs, countBy, inDateRange, patientStatusLabel, quickValue } from '../../components/listing';
import { paths } from '../../lib/paths';
import { ButtonLink, PageHeader } from '../../ui/primitives';

type T = ReturnType<typeof useAppTranslation>['t'];

export function screeningHref(s: Pick<ScreeningOut, 'id' | 'status'>): string {
  if (s.status === 'draft') return paths.screeningStep(s.id, 1);
  if (s.status === 'completed') return paths.screeningResults(s.id);
  return paths.screeningProcessing(s.id);
}

/** Catalog keys of the "next step" link per status. */
const NEXT_STEP: Record<ScreeningStatus, string> = {
  draft: 'screening.list.next.draft',
  processing: 'screening.list.next.processing',
  completed: 'screening.list.next.completed',
  failed: 'screening.list.next.failed',
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
const titleOf = (t: T, s: ScreeningOut) => s.specialty?.name ?? t('screening.generalScreening');
const summaryOf = (t: T, s: ScreeningOut) =>
  s.ai_result?.summary ??
  (s.body_areas.length
    ? t('screening.list.areasSummary', { areas: s.body_areas.join(', ') })
    : s.symptoms.length
      ? t('screening.list.symptomsSummary', { count: s.symptoms.length })
      : null);

function buildColumns(t: T): DataTableColumn<ScreeningOut>[] {
  const title = (s: ScreeningOut) => titleOf(t, s);
  const summary = (s: ScreeningOut) => summaryOf(t, s);
  return [
    {
      key: 'specialty',
      header: t('screening.list.columns.screening'),
      sticky: true,
      sortable: true,
      sortValue: title,
      mobile: 'primary',
      className: 'max-w-96',
      cell: (s) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{title(s)}</span>
          {summary(s) ? <span className="line-clamp-1 text-xs text-muted">{summary(s)}</span> : null}
        </span>
      ),
      mobileCell: (s) => <span className="font-semibold">{title(s)}</span>,
      exportValue: title,
    },
    {
      key: 'urgency',
      header: t('screening.list.columns.urgency'),
      sortable: true,
      sortValue: (s) => (s.urgency ? URGENCIES.indexOf(s.urgency) : null),
      mobile: 'badge',
      cell: (s) => (s.urgency ? <StatusBadge status={s.urgency} kind="urgency" /> : <span className="text-muted">—</span>),
      exportValue: (s) => (s.urgency ? URGENCY_LABELS[s.urgency] : ''),
    },
    {
      key: 'status',
      header: t('screening.list.columns.status'),
      sortable: true,
      mobile: 'badge',
      cell: (s) => <PatientStatus status={s.status} kind="screening" />,
      exportValue: (s) => label(s.status),
    },
    {
      key: 'created_at',
      header: t('screening.list.columns.started'),
      sortable: true,
      sortDescFirst: true,
      cell: (s) => <DateCell value={s.created_at} display="date" />,
      exportValue: (s) => s.created_at,
    },
    {
      key: 'completed_at',
      header: t('screening.list.columns.completed'),
      sortable: true,
      sortDescFirst: true,
      defaultHidden: true,
      cell: (s) => <DateCell value={s.completed_at} display="date" />,
      exportValue: (s) => s.completed_at,
    },
    {
      key: 'next',
      header: t('screening.list.columns.nextStep'),
      exportable: false,
      mobile: 'meta',
      cell: (s) => (
        <span className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-primary-ink">
          {t(NEXT_STEP[s.status])} <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden />
        </span>
      ),
    },
  ];
}

export function ScreeningsListPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('screening.list.title'));
  const columns = useMemo(() => buildColumns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', defaultPageSize: 10 });
  const { filters, setFilter, setFilters } = table;
  const list = useScreenings({ page: 1, page_size: 100 });
  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  const base = useMemo(
    () =>
      all
        .filter(matchesSearch(filters.q, (s: ScreeningOut) => [titleOf(t, s), summaryOf(t, s), ...s.body_areas]))
        .filter((s) => !filters.urgency.length || (!!s.urgency && filters.urgency.includes(s.urgency)))
        .filter((s) => inDateRange(s.created_at, filters.from, filters.to)),
    [all, filters.q, filters.urgency, filters.from, filters.to, t],
  );
  const rows = useMemo(() => base.filter((s) => !filters.status.length || filters.status.includes(s.status)), [base, filters.status]);
  const counts = useMemo(() => countBy(base, (s) => s.status), [base]);

  return (
    <div>
      <PageHeader
        title={t('screening.list.title')}
        description={t('screening.list.description')}
        actions={
          <ButtonLink to={paths.newScreening()} icon={<Stethoscope className="h-4 w-4" aria-hidden />}>
            {t('screening.list.newScreening')}
          </ButtonLink>
        }
      />
      <DataTable
        id="patient.screenings"
        caption={t('screening.list.title')}
        table={table}
        columns={columns}
        rows={list.data ? rows : undefined}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={screeningHref}
        rowLabel={(s) => t('screening.list.rowLabel', { action: t(NEXT_STEP[s.status]), title: titleOf(t, s) })}
        emptyIcon={<Stethoscope className="size-8" aria-hidden />}
        emptyTitle={t('screening.list.emptyTitle')}
        emptyDescription={t('screening.list.emptyDescription')}
        emptyAction={<ButtonLink to={paths.newScreening()}>{t('screening.list.startAiScreening')}</ButtonLink>}
        header={
          <TableTabs
            label={t('screening.list.statusTabs')}
            items={[
              { value: '', label: t('screening.list.all'), count: base.length },
              ...TABS.map((s) => ({ value: s, label: label(s), count: counts[s] ?? 0 })),
            ]}
            value={quickValue(filters.status, TABS)}
            onChange={(s) => setFilter('status', s ? [s] : [])}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('screening.list.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="my-screenings" columns={columns} rows={rows} />}
          >
            <MultiSelectFilter
              label={t('screening.list.columns.urgency')}
              value={filters.urgency}
              onChange={(v) => setFilter('urgency', v)}
              options={URGENCIES.map((u) => ({ value: u, label: URGENCY_LABELS[u], tone: statusTone(u, 'urgency') }))}
            />
            <DateRangeFilter
              label={t('screening.list.columns.started')}
              value={{ from: filters.from, to: filters.to }}
              onChange={({ from, to }) => setFilters({ from, to })}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
