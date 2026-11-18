import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Stethoscope, User } from 'lucide-react';
import {
  SCREENING_STATUSES,
  SCREENING_STATUS_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  agentPortalApi,
  screeningsApi,
  type ScreeningOut,
  type ScreeningStatus,
} from '@hig/shared/api';
import {
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
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
import { ButtonLink, PageHeader } from '../../components/ui';
import { patientName } from '../../lib/format';
import { inDateRange, optionsFromRows } from '../../lib/lookups';
import { qk } from '../../lib/queries';
import { fetchAllPages, filterParam, formatNumber, matchesSearch, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';
import { useAppTranslation, type AppT } from '../../i18n';

/** Screening row with the patient name resolved from the agent's patient list. */
interface ScreeningRow extends ScreeningOut {
  patient_name: string;
  specialty_name: string;
}

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(SCREENING_STATUSES),
  urgency: filterParam.list(URGENCIES),
  patient: filterParam.text(),
  specialty: filterParam.text(),
  from: filterParam.date(),
  to: filterParam.date(),
};
type ScreeningFilters = FilterValues<typeof FILTERS>;
const URGENCY_RANK: Record<string, number> = { emergency: 4, urgent: 3, soon: 2, routine: 1 };

function applyFilters(rows: readonly ScreeningRow[], f: ScreeningFilters, { ignoreStatus = false } = {}): ScreeningRow[] {
  return rows
    .filter(matchesSearch(f.q, (s) => [s.patient_name, s.specialty_name, s.ai_result?.summary]))
    .filter((s) => ignoreStatus || !f.status.length || f.status.includes(s.status))
    .filter((s) => !f.urgency.length || (s.urgency !== null && f.urgency.includes(s.urgency)))
    .filter((s) => !f.patient || s.patient_id === f.patient)
    .filter((s) => !f.specialty || s.specialty_name === f.specialty)
    .filter((s) => inDateRange(s.submitted_at ?? s.created_at, f.from, f.to));
}

const columns = (t: AppT): DataTableColumn<ScreeningRow>[] => [
  {
    key: 'patient',
    header: t('screenings.columns.patient'),
    sortable: true,
    sortValue: (s) => s.patient_name,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-52',
    cell: (s) => <PersonCell name={s.patient_name} />,
    exportValue: (s) => s.patient_name,
  },
  {
    key: 'specialty',
    header: t('screenings.columns.screening'),
    sortable: true,
    sortValue: (s) => s.specialty_name,
    className: 'max-w-80',
    mobile: 'secondary',
    cell: (s) => <TextCell primary={s.specialty_name} secondary={s.ai_result?.summary ?? (s.status === 'draft' ? t('screenings.draftHint') : undefined)} />,
    mobileCell: (s) => s.specialty_name,
    exportValue: (s) => s.specialty_name,
  },
  {
    key: 'urgency',
    header: t('screenings.columns.urgency'),
    sortable: true,
    sortDescFirst: true,
    sortValue: (s) => (s.urgency ? URGENCY_RANK[s.urgency] ?? 0 : 0),
    mobile: 'badge',
    cell: (s) => (s.urgency ? <StatusBadge status={s.urgency} kind="urgency" dot /> : <span className="text-muted">—</span>),
    mobileCell: (s) => (s.urgency && s.urgency !== 'routine' ? <StatusBadge status={s.urgency} kind="urgency" /> : null),
    exportValue: (s) => (s.urgency ? URGENCY_LABELS[s.urgency] : ''),
  },
  {
    key: 'status',
    header: t('screenings.columns.status'),
    sortable: true,
    sortValue: (s) => SCREENING_STATUSES.indexOf(s.status),
    mobile: 'badge',
    cell: (s) => <StatusBadgeCell status={s.status} kind="screening" />,
    exportValue: (s) => SCREENING_STATUS_LABELS[s.status],
  },
  {
    key: 'red_flags',
    header: t('screenings.columns.redFlags'),
    align: 'end',
    defaultHidden: true,
    sortable: true,
    sortValue: (s) => s.red_flags.length,
    cell: (s) => (s.red_flags.length ? <span className="font-medium text-danger tabular-nums">{formatNumber(s.red_flags.length)}</span> : <span className="text-muted">{formatNumber(0)}</span>),
    exportValue: (s) => s.red_flags.join('; '),
  },
  {
    key: 'submitted',
    header: t('screenings.columns.submitted'),
    sortable: true,
    sortDescFirst: true,
    sortValue: (s) => s.submitted_at ?? s.created_at,
    cell: (s) => <DateCell value={s.submitted_at ?? s.created_at} display="relative" className="text-muted" />,
    exportValue: (s) => s.submitted_at ?? s.created_at,
  },
];
const SORT_KEYS = ['patient', 'specialty', 'urgency', 'status', 'red_flags', 'submitted'];

export function ScreeningsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('screenings.title'));
  const COLUMNS = useMemo(() => columns(t), [t]);
  const table = useTableState({ filters: FILTERS, defaultSort: '-submitted', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;

  const query = useQuery({
    queryKey: qk.screenings({ all: true }),
    queryFn: () => fetchAllPages((page, size) => screeningsApi.list({ page, page_size: size })),
  });
  // screenings carry only patient_id: resolve names from the agent's patient list
  const patients = useQuery({
    queryKey: qk.patients({ all: true, lookup: true }),
    queryFn: () => fetchAllPages((page, size) => agentPortalApi.listPatients({ page, page_size: size })),
    staleTime: 60_000,
  });

  const all = useMemo<ScreeningRow[]>(() => {
    const names = new Map((patients.data ?? []).map((p) => [p.id, patientName(p)]));
    return (query.data ?? []).map((s) => ({
      ...s,
      patient_name: names.get(s.patient_id) ?? t('screenings.fallbackPatient'),
      specialty_name: s.specialty?.name ?? s.ai_result?.suggested_specialties[0]?.name ?? t('screenings.generalScreening'),
    }));
  }, [query.data, patients.data, t]);
  const rows = useMemo(() => applyFilters(all, filters), [all, filters]);
  const statusBase = useMemo(() => applyFilters(all, filters, { ignoreStatus: true }), [all, filters]);
  const loaded = Boolean(query.data);
  const statusCount = (s: ScreeningStatus) => statusBase.filter((r) => r.status === s).length;

  const statusOptions: FilterOption<ScreeningStatus>[] = SCREENING_STATUSES.map((s) => ({
    value: s,
    label: SCREENING_STATUS_LABELS[s],
    tone: statusTone(s, 'screening'),
    count: loaded ? statusCount(s) : undefined,
  }));
  const quickItems: QuickFilterItem<ScreeningStatus>[] = [
    { value: '', label: t('screenings.quick.all'), count: loaded ? statusBase.length : undefined },
    ...SCREENING_STATUSES.map((s) => ({ value: s, label: SCREENING_STATUS_LABELS[s], count: loaded ? statusCount(s) : undefined })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;
  const patientOptions = useMemo(() => optionsFromRows(all, (s) => ({ value: s.patient_id, label: s.patient_name })), [all]);
  const specialtyOptions = useMemo(() => optionsFromRows(all, (s) => ({ value: s.specialty_name, label: s.specialty_name })), [all]);

  return (
    <div>
      <PageHeader
        title={t('screenings.title')}
        description={t('screenings.description')}
        actions={<ButtonLink to="/patients">{t('screenings.choosePatient')}</ButtonLink>}
      />
      <DataTable
        id="agent.screenings"
        caption={t('screenings.title')}
        table={table}
        columns={COLUMNS}
        rows={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowHref={(s) => (s.status === 'draft' ? `/screenings/${s.id}/edit` : `/screenings/${s.id}`)}
        rowLabel={(s) => t('screenings.openRow', { name: s.patient_name })}
        emptyTitle={t('screenings.emptyTitle')}
        emptyDescription={t('screenings.emptyDescription')}
        emptyAction={<ButtonLink to="/patients">{t('screenings.choosePatient')}</ButtonLink>}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('screenings.filters.screeningStatus')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('screenings.filters.searchPlaceholder'), label: t('screenings.filters.searchLabel') }}
            onReset={table.resetFilters}
            actions={<ExportButton filename="screenings" columns={COLUMNS} rows={rows} />}
            more={
              <SelectFilter
                label={t('screenings.filters.specialty')}
                icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
                value={filters.specialty}
                onChange={(v) => setFilter('specialty', v)}
                options={specialtyOptions}
                searchable
              />
            }
          >
            <MultiSelectFilter label={t('screenings.filters.status')} value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label={t('screenings.filters.urgency')}
              icon={<ShieldAlert className="size-3.5 opacity-70" aria-hidden />}
              value={filters.urgency}
              onChange={(v) => setFilter('urgency', v)}
              options={URGENCIES.map((u) => ({
                value: u,
                label: URGENCY_LABELS[u],
                tone: statusTone(u, 'urgency'),
                count: loaded ? all.filter((s) => s.urgency === u).length : undefined,
              }))}
            />
            <SelectFilter
              label={t('screenings.filters.patient')}
              icon={<User className="size-3.5 opacity-70" aria-hidden />}
              value={filters.patient}
              onChange={(v) => setFilter('patient', v)}
              options={patientOptions}
              searchable
            />
            <DateRangeFilter label={t('screenings.filters.submitted')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
    </div>
  );
}
