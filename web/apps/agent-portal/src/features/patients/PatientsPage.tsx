import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Briefcase, Globe2, UserPlus } from 'lucide-react';
import {
  AGENT_CONSENT_STATUSES,
  AGENT_CONSENT_STATUS_LABELS,
  GENDER_LABELS,
  humanize,
  type Gender,
  agentPortalApi,
  type AgentConsentStatus,
  type AgentPatientListParams,
  type AgentPatientOut,
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
  StatusBadgeCell,
  TextCell,
  type BadgeTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { Button, PageHeader } from '../../components/ui';
import { countryName } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { qk } from '../../lib/queries';
import { ageFromDob, fetchAllPages, filterParam, formatNumber, intlLocale, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';
import { PatientFormDialog } from './PatientForm';
import { useAppTranslation, type AppT } from '../../i18n';

// ---------------------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------------------
const ACTIVE_VALUES = ['yes', 'no'] as const;
const FILTERS = {
  q: filterParam.text(),
  consent: filterParam.list(AGENT_CONSENT_STATUSES),
  nationality: filterParam.list(),
  active: filterParam.oneOf(ACTIVE_VALUES),
  from: filterParam.date(),
  to: filterParam.date(),
};
const SORT_KEYS = ['created_at', 'updated_at', 'name'] as const;

type PatientFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: PatientFilters): Omit<AgentPatientListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    consent: f.consent.length ? f.consent : undefined,
    nationality: f.nationality.length ? f.nationality : undefined,
    has_active_case: f.active === 'yes' ? true : f.active === 'no' ? false : undefined,
    created_from: f.from || undefined,
    created_to: f.to || undefined,
  };
}

export const CONSENT_TONES: Record<AgentConsentStatus, BadgeTone> = {
  confirmed: 'success',
  pending_patient_confirmation: 'warning',
  not_recorded: 'neutral',
  withdrawn: 'danger',
};
function consentShort(t: AppT, status: AgentConsentStatus): string {
  return {
    confirmed: t('patients.consentShort.confirmed'),
    pending_patient_confirmation: t('patients.consentShort.pending'),
    not_recorded: t('patients.consentShort.notRecorded'),
    withdrawn: t('patients.consentShort.withdrawn'),
  }[status];
}
const QUICK_CONSENT: AgentConsentStatus[] = ['confirmed', 'pending_patient_confirmation', 'not_recorded', 'withdrawn'];

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
/** "Female · 34 yrs" */
export function personLine(t: AppT, p: { gender?: string | null; date_of_birth?: string | null }): string {
  const age = ageFromDob(p.date_of_birth);
  const gender = p.gender ? (GENDER_LABELS[p.gender as Gender] ?? humanize(p.gender)) : null;
  return [gender, age !== null ? t('patients.ageYears', { count: age }) : null].filter(Boolean).join(' · ');
}

const columns = (t: AppT): DataTableColumn<AgentPatientOut>[] => [
  {
    key: 'patient',
    header: t('patients.columns.patient'),
    sortable: true,
    sortKey: 'name',
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (p) => <PersonCell name={patientName(p)} secondary={personLine(t, p) || undefined} />,
    exportValue: (p) => patientName(p),
  },
  {
    key: 'consent',
    header: t('patients.columns.consent'),
    mobile: 'badge',
    cell: (p) => {
      const status = p.consent?.status ?? 'not_recorded';
      return <StatusBadgeCell status={status} label={consentShort(t, status)} tone={CONSENT_TONES[status]} />;
    },
    exportValue: (p) => AGENT_CONSENT_STATUS_LABELS[p.consent?.status ?? 'not_recorded'],
  },
  {
    key: 'nationality',
    header: t('patients.columns.nationality'),
    cell: (p) => (
      <TextCell
        primary={countryName(p.nationality)}
        secondary={p.country_of_residence && p.country_of_residence !== p.nationality ? t('patients.livesIn', { country: countryName(p.country_of_residence) }) : undefined}
      />
    ),
    exportValue: (p) => p.nationality ?? '',
  },
  {
    key: 'contact',
    header: t('patients.columns.contact'),
    className: 'max-w-60',
    cell: (p) => <TextCell primary={p.email ?? <span className="text-muted">{t('patients.noEmail')}</span>} secondary={p.phone ?? undefined} />,
    exportValue: (p) => [p.email, p.phone].filter(Boolean).join(' / '),
  },
  {
    key: 'cases',
    header: t('patients.columns.cases'),
    align: 'end',
    cell: (p) => (
      <span className="inline-flex flex-col items-end leading-tight">
        <span className="font-medium tabular-nums">{formatNumber(p.cases_count ?? 0)}</span>
        {(p.active_cases_count ?? 0) > 0 && <span className="text-xs text-primary-ink">{t('patients.activeCount', { count: p.active_cases_count ?? 0 })}</span>}
      </span>
    ),
    mobileCell: (p) =>
      (p.active_cases_count ?? 0) > 0
        ? t('patients.mobileCasesActive', { count: p.cases_count ?? 0, active: formatNumber(p.active_cases_count ?? 0) })
        : t('patients.mobileCases', { count: p.cases_count ?? 0 }),
    exportValue: (p) => p.cases_count ?? 0,
  },
  {
    key: 'screenings',
    header: t('patients.columns.screenings'),
    align: 'end',
    cell: (p) => <span className="tabular-nums">{formatNumber(p.screenings_count ?? 0)}</span>,
    mobileCell: (p) => t('patients.mobileScreenings', { count: p.screenings_count ?? 0 }),
    exportValue: (p) => p.screenings_count ?? 0,
  },
  {
    key: 'created',
    header: t('patients.columns.added'),
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (p) => <DateCell value={p.created_at} display="date" />,
    exportValue: (p) => p.created_at,
  },
  {
    key: 'updated',
    header: t('patients.columns.updated'),
    sortable: true,
    sortKey: 'updated_at',
    sortDescFirst: true,
    defaultHidden: true,
    cell: (p) => <DateCell value={p.updated_at} display="relative" className="text-muted" />,
    exportValue: (p) => p.updated_at,
  },
];

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export function PatientsPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('patients.title'));
  const COLUMNS = useMemo(() => columns(t), [t]);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const addOpen = params.get('new') === '1';
  const setAddOpen = (open: boolean) => {
    const p = new URLSearchParams(params);
    if (open) p.set('new', '1');
    else p.delete('new');
    setParams(p, { replace: true });
  };

  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: AgentPatientListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: qk.patients(listParams),
    queryFn: () => agentPortalApi.listPatients(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: qk.patients({ counts: apiFilters }),
    queryFn: () => agentPortalApi.patientCounts(apiFilters),
    placeholderData: keepPreviousData,
  });

  const consentOptions: FilterOption<AgentConsentStatus>[] = AGENT_CONSENT_STATUSES.map((s) => ({
    value: s,
    label: AGENT_CONSENT_STATUS_LABELS[s],
    tone: CONSENT_TONES[s],
    count: counts.data?.counts[s],
  }));
  const nationalityOptions: FilterOption[] = Object.entries(counts.data?.nationalities ?? {})
    .map(([code, count]) => ({ value: code, label: countryName(code), count }))
    .concat(filters.nationality.filter((c) => !(c in (counts.data?.nationalities ?? {}))).map((c) => ({ value: c, label: countryName(c), count: 0 })))
    .sort((a, b) => a.label.localeCompare(b.label, intlLocale()));
  const quickItems: QuickFilterItem<AgentConsentStatus>[] = [
    { value: '', label: t('patients.quick.all'), count: counts.data?.total },
    ...QUICK_CONSENT.filter((s) => s !== 'withdrawn' || (counts.data?.counts.withdrawn ?? 0) > 0 || filters.consent.includes(s)).map((s) => ({
      value: s,
      label: s === 'pending_patient_confirmation' ? t('patients.quick.awaitingConfirmation') : consentShort(t, s),
      count: counts.data?.counts[s],
    })),
  ];
  const quickValue = filters.consent.length === 0 ? '' : filters.consent.length === 1 ? filters.consent[0]! : null;

  return (
    <div>
      <PageHeader
        title={t('patients.title')}
        description={t('patients.description')}
        actions={
          <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setAddOpen(true)}>
            {t('patients.add')}
          </Button>
        }
      />
      <DataTable
        id="agent.patients"
        caption={t('patients.title')}
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(p) => `/patients/${p.id}`}
        rowLabel={(p) => t('patients.openRow', { name: patientName(p) })}
        emptyTitle={t('patients.emptyTitle')}
        emptyDescription={t('patients.emptyDescription')}
        emptyAction={
          <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setAddOpen(true)}>
            {t('patients.add')}
          </Button>
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('patients.filters.consentStatus')} items={quickItems} value={quickValue} onChange={(s) => setFilter('consent', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('patients.filters.searchPlaceholder'), label: t('patients.filters.searchLabel') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="patients"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => agentPortalApi.listPatients({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
          >
            <MultiSelectFilter label={t('patients.filters.consent')} value={filters.consent} onChange={(v) => setFilter('consent', v)} options={consentOptions} />
            <MultiSelectFilter
              label={t('patients.filters.nationality')}
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.nationality}
              onChange={(v) => setFilter('nationality', v)}
              options={nationalityOptions}
              searchable
            />
            <SelectFilter
              label={t('patients.filters.cases')}
              icon={<Briefcase className="size-3.5 opacity-70" aria-hidden />}
              value={filters.active}
              onChange={(v) => setFilter('active', v)}
              options={[
                { value: 'yes', label: t('patients.filters.hasActiveCase'), tone: 'success' },
                { value: 'no', label: t('patients.filters.noActiveCase') },
              ]}
            />
            <DateRangeFilter label={t('patients.filters.added')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <PatientFormDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={(p) => navigate(`/patients/${p.id}`)} />
    </div>
  );
}
