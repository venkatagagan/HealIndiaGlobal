import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Award, MapPin, Star, Stethoscope } from 'lucide-react';
import {
  adminApi,
  HOSPITAL_STATUSES,
  HOSPITAL_STATUS_LABELS,
  KYC_STATUSES,
  KYC_STATUS_LABELS,
  type AdminHospitalListParams,
  type HospitalProfileOut,
  type HospitalStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Badge,
  DataTable,
  DateCell,
  ExportButton,
  FilterBar,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  SelectFilter,
  StatusBadgeCell,
  TextCell,
  ToggleFilter,
  statusTone,
  type DataTableColumn,
  type FilterOption,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatBps } from '../lib/format';
import { useAdminFacets, useSpecialtyOptions } from '../lib/lookups';
import { opsKeys } from '../lib/mutations';
import { opsPaths } from '../lib/paths';

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(HOSPITAL_STATUSES),
  kyc_status: filterParam.list(KYC_STATUSES),
  city: filterParam.list(),
  state: filterParam.list(),
  accreditation: filterParam.list(),
  specialty_id: filterParam.text(),
  featured: filterParam.boolean(),
};
const SORT_KEYS = ['name', 'city', 'created_at', 'updated_at', 'rating_avg'] as const;
type HospitalFilters = FilterValues<typeof FILTERS>;

function toApiFilters(f: HospitalFilters): Omit<AdminHospitalListParams, 'page' | 'page_size' | 'sort'> {
  return {
    q: f.q.trim() || undefined,
    status: f.status.length ? f.status : undefined,
    kyc_status: f.kyc_status.length ? f.kyc_status : undefined,
    city: f.city.length ? f.city : undefined,
    state: f.state.length ? f.state : undefined,
    accreditation: f.accreditation.length ? f.accreditation : undefined,
    specialty_id: f.specialty_id || undefined,
    is_featured: f.featured || undefined,
  };
}

const QUICK: { value: HospitalStatus; label: string }[] = [
  { value: 'pending_review', label: 'Approval queue' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'draft', label: 'Draft' },
];

function HospitalCell({ h }: { h: HospitalProfileOut }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {h.logo_url ? (
        <img src={h.logo_url} alt="" className="size-9 shrink-0 rounded-lg border border-border object-cover" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-semibold text-primary-ink" aria-hidden>
          {h.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1 truncate font-medium text-fg">
          <span className="truncate">{h.name}</span>
          {h.is_featured && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />}
        </span>
        <span className="block truncate text-xs text-muted">{h.legal_name ?? h.email ?? h.slug}</span>
      </span>
    </span>
  );
}

const COLUMNS: DataTableColumn<HospitalProfileOut>[] = [
  {
    key: 'name',
    header: 'Hospital',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-72',
    cell: (h) => <HospitalCell h={h} />,
    mobileCell: (h) => <span className="font-medium">{h.name}</span>,
    exportValue: (h) => h.name,
  },
  {
    key: 'city',
    header: 'Location',
    title: 'Location',
    sortable: true,
    mobile: 'secondary',
    cell: (h) => <TextCell primary={h.city} secondary={h.state ?? undefined} />,
    mobileCell: (h) => [h.city, h.state].filter(Boolean).join(', '),
    exportValue: (h) => [h.city, h.state].filter(Boolean).join(', '),
  },
  {
    key: 'status',
    header: 'Status',
    mobile: 'badge',
    cell: (h) => <StatusBadgeCell status={h.status} kind="hospital" />,
    exportValue: (h) => HOSPITAL_STATUS_LABELS[h.status],
  },
  {
    key: 'kyc',
    header: 'KYC',
    cell: (h) => <StatusBadgeCell status={h.kyc_status} kind="kyc" />,
    exportValue: (h) => KYC_STATUS_LABELS[h.kyc_status],
  },
  {
    key: 'accreditations',
    header: 'Accreditations',
    cell: (h) =>
      h.accreditations.length === 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {h.accreditations.map((a) => (
            <Badge key={a} tone="info">
              {a.toUpperCase()}
            </Badge>
          ))}
        </span>
      ),
    exportValue: (h) => h.accreditations.map((a) => a.toUpperCase()).join(' '),
  },
  {
    key: 'specialties',
    header: 'Specialties',
    defaultHidden: true,
    className: 'max-w-64',
    cell: (h) => <TextCell primary={h.specialties.slice(0, 3).join(', ') || '—'} secondary={h.specialties.length > 3 ? `+${h.specialties.length - 3} more` : undefined} />,
    exportValue: (h) => h.specialties.join('; '),
  },
  {
    key: 'rating_avg',
    header: 'Rating',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    defaultHidden: true,
    cell: (h) =>
      h.rating_avg != null && h.rating_count > 0 ? (
        <span className="tabular-nums">
          {Number(h.rating_avg).toFixed(1)} <span className="text-xs text-muted">({h.rating_count})</span>
        </span>
      ) : (
        <span className="text-muted">—</span>
      ),
    exportValue: (h) => h.rating_avg ?? '',
  },
  {
    key: 'commission',
    header: 'Commission',
    align: 'end',
    cell: (h) => (h.commission_rate_bps == null ? <span className="text-muted">Default</span> : <span className="tabular-nums">{formatBps(h.commission_rate_bps)}</span>),
    exportValue: (h) => (h.commission_rate_bps == null ? 'Default' : formatBps(h.commission_rate_bps)),
  },
  {
    key: 'created_at',
    header: 'Registered',
    sortable: true,
    sortDescFirst: true,
    cell: (h) => <DateCell value={h.created_at} display="date" />,
    exportValue: (h) => h.created_at,
  },
  {
    key: 'updated_at',
    header: 'Updated',
    sortable: true,
    sortDescFirst: true,
    defaultHidden: true,
    cell: (h) => <DateCell value={h.updated_at} display="relative" className="text-muted" />,
    exportValue: (h) => h.updated_at,
  },
];

export default function HospitalsPage() {
  useDocumentTitle('Hospitals');
  const table = useTableState({ filters: FILTERS, sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: AdminHospitalListParams = { ...apiFilters, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...opsKeys.hospitals, 'list', listParams],
    queryFn: () => adminApi.listHospitals(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...opsKeys.hospitals, 'status-counts', apiFilters],
    queryFn: () => adminApi.hospitalStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const facets = useAdminFacets();
  const specialties = useSpecialtyOptions();

  const statusOptions: FilterOption<HospitalStatus>[] = HOSPITAL_STATUSES.map((s) => ({
    value: s,
    label: HOSPITAL_STATUS_LABELS[s],
    tone: statusTone(s, 'hospital'),
    count: counts.data?.counts[s],
  }));
  const quickItems: QuickFilterItem<HospitalStatus>[] = [
    { value: '', label: 'All', count: counts.data?.total },
    ...QUICK.map((q) => ({ ...q, count: counts.data?.counts[q.value], tone: q.value === 'pending_review' ? ('warning' as const) : undefined })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;
  const toOptions = (values: string[] | undefined, upper = false): FilterOption[] =>
    (values ?? []).map((v) => ({ value: v, label: upper ? v.toUpperCase() : v }));

  return (
    <div>
      <PageHeader
        title="Hospitals"
        description="Partner hospitals — review KYC, approve new registrations and manage commercial terms."
      />
      <DataTable
        id="admin.hospitals"
        caption="Hospitals"
        table={table}
        columns={COLUMNS}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowHref={(h) => opsPaths.hospital(h.id)}
        rowLabel={(h) => `Open ${h.name}`}
        emptyTitle="No hospitals yet"
        emptyDescription="Hospitals appear here as soon as they register on the hospital portal."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label="Hospital status" items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Name, city or email…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="hospitals"
                columns={COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() => fetchAllPages((page, size) => adminApi.listHospitals({ ...apiFilters, sort: table.sortParam, page, page_size: size }))}
              />
            }
            more={
              <>
                <MultiSelectFilter
                  label="State"
                  value={filters.state}
                  onChange={(v) => setFilter('state', v)}
                  options={toOptions(facets.data?.hospital_states)}
                  loading={facets.isLoading}
                  searchable
                />
                <MultiSelectFilter
                  label="KYC"
                  value={filters.kyc_status}
                  onChange={(v) => setFilter('kyc_status', v)}
                  options={KYC_STATUSES.map((k) => ({ value: k, label: KYC_STATUS_LABELS[k], tone: statusTone(k, 'kyc') }))}
                />
                <ToggleFilter
                  label="Featured only"
                  icon={<Star className="size-3.5 opacity-70" aria-hidden />}
                  pressed={filters.featured === true}
                  onChange={(on) => setFilter('featured', on ? true : undefined)}
                />
              </>
            }
          >
            <MultiSelectFilter label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
            <MultiSelectFilter
              label="City"
              icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
              value={filters.city}
              onChange={(v) => setFilter('city', v)}
              options={toOptions(facets.data?.hospital_cities)}
              loading={facets.isLoading}
              searchable
            />
            <SelectFilter
              label="Specialty"
              icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
              value={filters.specialty_id}
              onChange={(v) => setFilter('specialty_id', v)}
              options={specialties.data ?? []}
              loading={specialties.isLoading}
              searchable
            />
            <MultiSelectFilter
              label="Accreditation"
              icon={<Award className="size-3.5 opacity-70" aria-hidden />}
              value={filters.accreditation}
              onChange={(v) => setFilter('accreditation', v)}
              options={toOptions(facets.data?.hospital_accreditations, true)}
              loading={facets.isLoading}
            />
          </FilterBar>
        }
      />
    </div>
  );
}
