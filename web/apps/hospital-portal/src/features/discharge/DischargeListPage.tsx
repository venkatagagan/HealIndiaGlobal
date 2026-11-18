/** Discharge summaries of the active hospital (drafts + final versions). New ones start from a case. */
import { useMemo } from 'react';
import { FileHeart } from 'lucide-react';
import { DISCHARGE_SUMMARY_STATUSES, type DischargeSummaryListItem, type DischargeSummaryStatus } from '@hig/shared/api';
import { filterParam, useTableState } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  FilterBar,
  IdCell,
  PageHeader,
  QuickFilters,
  TextCell,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { useAppTranslation } from '../../i18n';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { dischargePaths, useDischargeList } from './queries';

type TFn = ReturnType<typeof useAppTranslation>['t'];

const FILTERS = { q: filterParam.text(), status: filterParam.oneOf(DISCHARGE_SUMMARY_STATUSES) };

const columns = (t: TFn): DataTableColumn<DischargeSummaryListItem>[] => [
  {
    key: 'case_number',
    header: t('discharge.list.columns.case'),
    sticky: true,
    mobile: 'secondary',
    cell: (s) => <IdCell value={s.case_number ?? '—'} />,
    exportValue: (s) => s.case_number ?? '',
  },
  {
    key: 'patient_name',
    header: t('discharge.list.columns.patient'),
    mobile: 'primary',
    className: 'max-w-56',
    cell: (s) => <TextCell primary={s.patient_name ?? '—'} />,
  },
  {
    key: 'status',
    header: t('discharge.list.columns.status'),
    mobile: 'badge',
    cell: (s) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge tone={s.status === 'draft' ? 'warning' : 'success'}>{t(`discharge.status.${s.status}`)}</Badge>
        {!s.is_latest && <Badge tone="neutral">{t('discharge.superseded')}</Badge>}
      </span>
    ),
  },
  {
    key: 'version',
    header: t('discharge.list.columns.version'),
    cell: (s) => <span className="tabular-nums">{t('discharge.versionLabel', { version: s.version })}</span>,
  },
  {
    key: 'discharge_date',
    header: t('discharge.list.columns.dischargeDate'),
    sortable: true,
    sortValue: (s) => s.discharge_date ?? '',
    cell: (s) => <DateCell value={s.discharge_date} display="date" />,
  },
  {
    key: 'updated_at',
    header: t('discharge.list.columns.updated'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (s) => s.updated_at,
    cell: (s) => <DateCell value={s.updated_at} display="relative" className="text-muted" />,
  },
];

export function DischargeListPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('discharge.title'));
  const table = useTableState({ filters: FILTERS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const list = useDischargeList({ limit: 200 });
  const cols = useMemo(() => columns(t), [t]);

  const all = useMemo(
    () => [...(list.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [list.data],
  );
  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return all.filter(
      (s) =>
        (!filters.status || s.status === filters.status) &&
        (!q || `${s.case_number ?? ''} ${s.patient_name ?? ''}`.toLowerCase().includes(q)),
    );
  }, [all, filters.q, filters.status]);

  const tabs: QuickFilterItem[] = [
    { value: '', label: t('discharge.list.tabs.all'), count: all.length },
    ...DISCHARGE_SUMMARY_STATUSES.map((s: DischargeSummaryStatus) => ({
      value: s,
      label: t(`discharge.list.tabs.${s}`),
      count: all.filter((r) => r.status === s).length,
    })),
  ];

  return (
    <div>
      <PageHeader title={t('discharge.title')} description={t('discharge.list.description')} />
      <DataTable
        id="hospital.discharge"
        caption={t('discharge.title')}
        table={table}
        columns={cols}
        rows={rows}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(s) => dischargePaths.one(s.id)}
        rowLabel={(s) => t('discharge.list.openRow', { case: s.case_number ?? '', version: s.version })}
        emptyIcon={<FileHeart className="size-8" aria-hidden />}
        emptyTitle={t('discharge.list.emptyTitle')}
        emptyDescription={t('discharge.list.emptyDescription')}
        header={
          <QuickFilters
            label={t('discharge.list.tabs.label')}
            items={tabs}
            value={filters.status}
            onChange={(v) => setFilter('status', v as DischargeSummaryStatus | '')}
          />
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('discharge.list.searchPlaceholder') }}
            onReset={table.resetFilters}
          />
        }
      />
    </div>
  );
}
