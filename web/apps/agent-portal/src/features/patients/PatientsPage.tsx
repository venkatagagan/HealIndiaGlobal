import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Briefcase, Globe2, UserPlus } from 'lucide-react';
import {
  AGENT_CONSENT_STATUSES,
  AGENT_CONSENT_STATUS_LABELS,
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
import { ageFromDob, fetchAllPages, filterParam, useDocumentTitle, useTableState, type FilterValues } from '../../lib/shared';
import { PatientFormDialog } from './PatientForm';

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
const CONSENT_SHORT: Record<AgentConsentStatus, string> = {
  confirmed: 'Confirmed',
  pending_patient_confirmation: 'Awaiting patient',
  not_recorded: 'Not recorded',
  withdrawn: 'Withdrawn',
};
const QUICK_CONSENT: AgentConsentStatus[] = ['confirmed', 'pending_patient_confirmation', 'not_recorded', 'withdrawn'];

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function personLine(p: AgentPatientOut): string {
  const age = ageFromDob(p.date_of_birth);
  return [p.gender ? p.gender[0]!.toUpperCase() + p.gender.slice(1) : null, age !== null ? `${age} yrs` : null].filter(Boolean).join(' · ');
}

const COLUMNS: DataTableColumn<AgentPatientOut>[] = [
  {
    key: 'patient',
    header: 'Patient',
    sortable: true,
    sortKey: 'name',
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (p) => <PersonCell name={patientName(p)} secondary={personLine(p) || undefined} />,
    exportValue: (p) => patientName(p),
  },
  {
    key: 'consent',
    header: 'Consent',
    mobile: 'badge',
    cell: (p) => {
      const status = p.consent?.status ?? 'not_recorded';
      return <StatusBadgeCell status={status} label={CONSENT_SHORT[status]} tone={CONSENT_TONES[status]} />;
    },
    exportValue: (p) => AGENT_CONSENT_STATUS_LABELS[p.consent?.status ?? 'not_recorded'],
  },
  {
    key: 'nationality',
    header: 'Nationality',
    cell: (p) => (
      <TextCell
        primary={countryName(p.nationality)}
        secondary={p.country_of_residence && p.country_of_residence !== p.nationality ? `Lives in ${countryName(p.country_of_residence)}` : undefined}
      />
    ),
    exportValue: (p) => p.nationality ?? '',
  },
  {
    key: 'contact',
    header: 'Contact',
    className: 'max-w-60',
    cell: (p) => <TextCell primary={p.email ?? <span className="text-muted">No email</span>} secondary={p.phone ?? undefined} />,
    exportValue: (p) => [p.email, p.phone].filter(Boolean).join(' / '),
  },
  {
    key: 'cases',
    header: 'Cases',
    align: 'end',
    cell: (p) => (
      <span className="inline-flex flex-col items-end leading-tight">
        <span className="font-medium tabular-nums">{p.cases_count ?? 0}</span>
        {(p.active_cases_count ?? 0) > 0 && <span className="text-xs text-primary-ink">{p.active_cases_count} active</span>}
      </span>
    ),
    mobileCell: (p) => `${p.cases_count ?? 0} cases${(p.active_cases_count ?? 0) > 0 ? ` (${p.active_cases_count} active)` : ''}`,
    exportValue: (p) => p.cases_count ?? 0,
  },
  {
    key: 'screenings',
    header: 'Screenings',
    align: 'end',
    cell: (p) => <span className="tabular-nums">{p.screenings_count ?? 0}</span>,
    mobileCell: (p) => `${p.screenings_count ?? 0} screenings`,
    exportValue: (p) => p.screenings_count ?? 0,
  },
  {
    key: 'created',
    header: 'Added',
    sortable: true,
    sortKey: 'created_at',
    sortDescFirst: true,
    cell: (p) => <DateCell value={p.created_at} display="date" />,
    exportValue: (p) => p.created_at,
  },
  {
    key: 'updated',
    header: 'Updated',
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
  useDocumentTitle('Patients');
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
    .sort((a, b) => a.label.localeCompare(b.label));
  const quickItems: QuickFilterItem<AgentConsentStatus>[] = [
    { value: '', label: 'All patients', count: counts.data?.total },
    ...QUICK_CONSENT.filter((s) => s !== 'withdrawn' || (counts.data?.counts.withdrawn ?? 0) > 0 || filters.consent.includes(s)).map((s) => ({
      value: s,
      label: s === 'pending_patient_confirmation' ? 'Awaiting confirmation' : CONSENT_SHORT[s],
      count: counts.data?.counts[s],
    })),
  ];
  const quickValue = filters.consent.length === 0 ? '' : filters.consent.length === 1 ? filters.consent[0]! : null;

  return (
    <div>
      <PageHeader
        title="Patients"
        description="Patients you manage or referred. Add a patient to start a screening or send an enquiry on their behalf."
        actions={
          <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setAddOpen(true)}>
            Add patient
          </Button>
        }
      />
      <DataTable
        id="agent.patients"
        caption="Patients"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(p) => `/patients/${p.id}`}
        rowLabel={(p) => `Open patient ${patientName(p)}`}
        emptyTitle="No patients yet"
        emptyDescription="Add your first patient to begin a screening or send an enquiry to hospitals."
        emptyAction={
          <Button icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setAddOpen(true)}>
            Add patient
          </Button>
        }
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Consent status" items={quickItems} value={quickValue} onChange={(s) => setFilter('consent', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name, email or phone…', label: 'Search patients' }}
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
            <MultiSelectFilter label="Consent" value={filters.consent} onChange={(v) => setFilter('consent', v)} options={consentOptions} />
            <MultiSelectFilter
              label="Nationality"
              icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
              value={filters.nationality}
              onChange={(v) => setFilter('nationality', v)}
              options={nationalityOptions}
              searchable
            />
            <SelectFilter
              label="Cases"
              icon={<Briefcase className="size-3.5 opacity-70" aria-hidden />}
              value={filters.active}
              onChange={(v) => setFilter('active', v)}
              options={[
                { value: 'yes', label: 'Has an active case', tone: 'success' },
                { value: 'no', label: 'No active case' },
              ]}
            />
            <DateRangeFilter label="Added" value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />
      <PatientFormDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={(p) => navigate(`/patients/${p.id}`)} />
    </div>
  );
}
