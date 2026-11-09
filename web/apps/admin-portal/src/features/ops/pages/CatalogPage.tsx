import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Globe2, Stethoscope, Syringe } from 'lucide-react';
import {
  adminApi,
  request,
  type CostBenchmarkIn,
  type CostBenchmarkOut,
  type ProcedureIn,
  type ProcedureOut,
  type SpecialtyIn,
  type SpecialtyOut,
} from '@hig/shared/api';
import { filterParam, formatMoneyRange, useDocumentTitle, useTableState } from '@hig/shared/lib';
import {
  Badge,
  PageHeader,
  SelectFilter,
  StatCard,
  TextCell,
  type DataTableColumn,
  type FilterOption,
} from '@hig/shared/ui';
import { Tabs } from '../ui';
import { CrudSection, type FieldDef } from '../components/CrudSection';
import { countryName } from '../lib/lookups';
import { opsKeys } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const TABS = ['specialties', 'procedures', 'benchmarks'] as const;
type TabKey = (typeof TABS)[number];

const specialtiesKey = [...opsKeys.catalog, 'specialties'];
const proceduresKey = [...opsKeys.catalog, 'procedures'];
const benchmarksKey = [...opsKeys.catalog, 'cost-benchmarks'];

const SLUG_HINT = 'Lowercase letters, digits and dashes; used in public URLs.';

const ACTIVE_OPTIONS: FilterOption<'active' | 'inactive'>[] = [
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'inactive', label: 'Inactive', tone: 'danger' },
];
const matchesActive = (filter: string, active: boolean | undefined) =>
  !filter || (filter === 'active' ? active !== false : active === false);

function ActiveBadge({ active }: { active: boolean | undefined }) {
  return active === false ? <Badge tone="danger">Inactive</Badge> : <Badge tone="success">Active</Badge>;
}

function activeColumn<T extends { is_active?: boolean }>(): DataTableColumn<T> {
  return {
    key: 'active',
    header: 'Status',
    mobile: 'badge',
    sortable: true,
    sortValue: (r) => r.is_active !== false,
    cell: (r) => <ActiveBadge active={r.is_active} />,
    exportValue: (r) => (r.is_active === false ? 'Inactive' : 'Active'),
  };
}

/** GET /admin/catalog/benchmark-gaps: active procedures without a home-country cost benchmark for a top
 * patient country (US, GB, NG, AE/OM, BD). Benchmarks are entered by staff from a cited source. */
interface BenchmarkGaps {
  countries: string[];
  total_active_procedures: number;
  procedures_with_gaps: number;
  procedures_without_any_benchmark: number;
  items: { procedure_id: string; procedure_name: string; missing_countries: string[] }[];
}
const benchmarkGapsKey = [...opsKeys.catalog, 'benchmark-gaps'];

/** Warning tile shown only while some active procedure lacks a benchmark for a top patient country. */
function BenchmarkGapsTile({ onOpen }: { onOpen: () => void }) {
  const gaps = useQuery({
    queryKey: benchmarkGapsKey,
    queryFn: () => request<BenchmarkGaps>('GET', '/admin/catalog/benchmark-gaps'),
    staleTime: 60_000,
  });
  const data = gaps.data;
  if (!data || data.procedures_with_gaps === 0) return null;
  const sample = data.items
    .slice(0, 3)
    .map((i) => `${i.procedure_name} (${i.missing_countries.join(', ')})`)
    .join('; ');
  return (
    <div className="mb-4 max-w-xl">
      <StatCard
        tone="warning"
        icon={<AlertTriangle className="size-5" aria-hidden />}
        label={`Procedures missing cost benchmarks (${data.countries.join(', ')})`}
        value={`${data.procedures_with_gaps} of ${data.total_active_procedures}`}
        hint={`${data.procedures_without_any_benchmark} with none at all. ${sample}${data.items.length > 3 ? '; ...' : ''}`}
        onClick={onOpen}
      />
    </div>
  );
}

export default function CatalogPage() {
  useDocumentTitle('Catalog');
  const perms = useOpsPermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'specialties';

  return (
    <div>
      <PageHeader
        title="Catalog"
        description="Specialties, procedures and home-country cost benchmarks used by search, AI matching and the cost comparison tool."
      />
      <BenchmarkGapsTile onOpen={() => setParams({ tab: 'benchmarks' }, { replace: true })} />
      <Tabs
        tabs={[
          { key: 'specialties', label: 'Specialties' },
          { key: 'procedures', label: 'Procedures' },
          { key: 'benchmarks', label: 'Cost benchmarks' },
        ]}
        value={tab}
        onChange={(k) => setParams(k === 'specialties' ? {} : { tab: k }, { replace: true })}
      />
      {tab === 'specialties' && <SpecialtiesSection canEdit={perms.editCatalog} />}
      {tab === 'procedures' && <ProceduresSection canEdit={perms.editCatalog} />}
      {tab === 'benchmarks' && <BenchmarksSection canEdit={perms.editCatalog} />}
    </div>
  );
}

function useSpecialties() {
  return useQuery({ queryKey: [...specialtiesKey, {}], queryFn: () => adminApi.specialties.list() });
}
function useProcedures() {
  return useQuery({ queryKey: [...proceduresKey, {}], queryFn: () => adminApi.procedures.list() });
}

// ---------------------------------------------------------------------------------------------------------
const SPECIALTY_FIELDS: FieldDef<SpecialtyOut>[] = [
  { name: 'name', label: 'Name', kind: 'text', required: true, maxLength: 120 },
  { name: 'slug', label: 'Slug', kind: 'text', required: true, maxLength: 120, hint: SLUG_HINT },
  { name: 'icon', label: 'Icon', kind: 'text', maxLength: 60, hint: 'Lucide icon name, e.g. heart-pulse' },
  { name: 'sort_order', label: 'Sort order', kind: 'int', defaultValue: '0', min: 0 },
  { name: 'savings_min_pct', label: 'Savings min (%)', kind: 'int', min: 0, max: 100 },
  { name: 'savings_max_pct', label: 'Savings max (%)', kind: 'int', min: 0, max: 100 },
  { name: 'description', label: 'Description', kind: 'textarea', maxLength: 2000 },
  { name: 'is_active', label: 'Active', kind: 'bool', defaultValue: true },
];

const SPECIALTY_COLUMNS: DataTableColumn<SpecialtyOut>[] = [
  {
    key: 'name',
    header: 'Specialty',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    cell: (s) => <TextCell primary={<span className="font-medium">{s.name}</span>} secondary={<span className="font-mono">{s.slug}</span>} />,
    exportValue: (s) => s.name,
  },
  {
    key: 'procedures_count',
    header: 'Procedures',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    mobile: 'secondary',
    cell: (s) => <span className="tabular-nums">{s.procedures_count}</span>,
    mobileCell: (s) => `${s.procedures_count} procedures`,
  },
  {
    key: 'savings',
    header: 'Savings',
    sortable: true,
    sortValue: (s) => s.savings_max_pct ?? s.savings_min_pct ?? null,
    cell: (s) => (s.savings_min_pct != null ? `${s.savings_min_pct}–${s.savings_max_pct ?? s.savings_min_pct}%` : <span className="text-muted">—</span>),
    exportValue: (s) => (s.savings_min_pct != null ? `${s.savings_min_pct}-${s.savings_max_pct ?? s.savings_min_pct}%` : ''),
  },
  { key: 'sort_order', header: 'Order', align: 'end', sortable: true, cell: (s) => <span className="tabular-nums">{s.sort_order ?? '—'}</span> },
  activeColumn<SpecialtyOut>(),
];

const SPECIALTY_FILTERS = { q: filterParam.text(), active: filterParam.text() };

function SpecialtiesSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: SPECIALTY_FILTERS, defaultSort: 'sort_order' });
  const { filters, setFilter } = table;
  return (
    <CrudSection<SpecialtyOut, SpecialtyIn>
      id="admin.catalog.specialties"
      table={table}
      entityName="specialty"
      entityPlural="specialties"
      queryKey={specialtiesKey}
      endpoints={adminApi.specialties}
      fields={SPECIALTY_FIELDS}
      columns={SPECIALTY_COLUMNS}
      rowKey={(s) => s.id}
      rowLabel={(s) => s.name}
      canEdit={canEdit}
      searchText={(s) => `${s.name} ${s.slug}`}
      filterRow={(s) => matchesActive(filters.active, s.is_active)}
      filters={<SelectFilter label="Status" value={filters.active} onChange={(v) => setFilter('active', v)} options={ACTIVE_OPTIONS} />}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const PROCEDURE_COLUMNS: DataTableColumn<ProcedureOut>[] = [
  {
    key: 'name',
    header: 'Procedure',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-72',
    cell: (p) => <TextCell primary={<span className="font-medium">{p.name}</span>} secondary={<span className="font-mono">{p.slug}</span>} />,
    exportValue: (p) => p.name,
  },
  {
    key: 'specialty',
    header: 'Specialty',
    sortable: true,
    sortValue: (p) => p.specialty?.name ?? null,
    mobile: 'secondary',
    cell: (p) => p.specialty?.name ?? <span className="text-muted">—</span>,
    exportValue: (p) => p.specialty?.name ?? '',
  },
  {
    key: 'price',
    header: 'India price',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    sortValue: (p) => p.india_price_min_minor ?? null,
    cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatMoneyRange(p.india_price_min_minor, p.india_price_max_minor, p.currency)}</span>,
    exportValue: (p) => formatMoneyRange(p.india_price_min_minor, p.india_price_max_minor, p.currency),
  },
  {
    key: 'stay',
    header: 'Stay / recovery',
    cell: (p) => `${p.hospital_stay_days ?? '—'} / ${p.recovery_days ?? '—'} days`,
    exportValue: (p) => `${p.hospital_stay_days ?? ''}/${p.recovery_days ?? ''}`,
  },
  {
    key: 'benchmarks',
    header: 'Benchmarks',
    align: 'end',
    sortable: true,
    sortValue: (p) => p.benchmarks?.length ?? 0,
    cell: (p) => <span className="tabular-nums">{p.benchmarks?.length ?? 0}</span>,
    exportValue: (p) => p.benchmarks?.length ?? 0,
  },
  activeColumn<ProcedureOut>(),
];

const PROCEDURE_FILTERS = { q: filterParam.text(), specialty: filterParam.text(), active: filterParam.text() };

function ProceduresSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: PROCEDURE_FILTERS, defaultSort: 'name' });
  const { filters, setFilter } = table;
  const specialties = useSpecialties();
  const specialtyOptions = useMemo(() => (specialties.data ?? []).map((s) => ({ value: s.id, label: s.name })), [specialties.data]);
  const fields = useMemo<FieldDef<ProcedureOut>[]>(
    () => [
      { name: 'name', label: 'Name', kind: 'text', required: true, maxLength: 200 },
      { name: 'slug', label: 'Slug', kind: 'text', required: true, maxLength: 200, hint: SLUG_HINT },
      {
        name: 'specialty_id',
        label: 'Specialty',
        kind: 'select',
        required: true,
        options: specialtyOptions,
        getValue: (p) => p.specialty?.id,
        defaultValue: filters.specialty,
      },
      { name: 'currency', label: 'Currency', kind: 'text', defaultValue: 'INR', uppercase: true },
      { name: 'india_price_min_minor', label: 'India price from', kind: 'money', currencyField: 'currency' },
      { name: 'india_price_max_minor', label: 'India price to', kind: 'money', currencyField: 'currency' },
      { name: 'hospital_stay_days', label: 'Hospital stay (days)', kind: 'int', min: 0 },
      { name: 'recovery_days', label: 'Recovery (days)', kind: 'int', min: 0 },
      { name: 'total_stay_days', label: 'Total stay in India (days)', kind: 'int', min: 0 },
      { name: 'keywords', label: 'Keywords', kind: 'list', hint: 'Comma separated; used by search and the AI rules engine' },
      { name: 'body_areas', label: 'Body areas', kind: 'list', hint: 'Comma separated, e.g. knee, hip, lower_back' },
      { name: 'description', label: 'Description', kind: 'textarea', maxLength: 5000 },
      { name: 'is_active', label: 'Active', kind: 'bool', defaultValue: true },
    ],
    [specialtyOptions, filters.specialty],
  );
  return (
    <CrudSection<ProcedureOut, ProcedureIn>
      id="admin.catalog.procedures"
      table={table}
      entityName="procedure"
      queryKey={proceduresKey}
      endpoints={adminApi.procedures}
      fields={fields}
      columns={PROCEDURE_COLUMNS}
      rowKey={(p) => p.id}
      rowLabel={(p) => p.name}
      canEdit={canEdit}
      searchText={(p) => `${p.name} ${p.slug} ${(p.keywords ?? []).join(' ')}`}
      filterRow={(p) => (!filters.specialty || p.specialty?.id === filters.specialty) && matchesActive(filters.active, p.is_active)}
      alsoInvalidate={[specialtiesKey]}
      filters={
        <>
          <SelectFilter
            label="Specialty"
            icon={<Stethoscope className="size-3.5 opacity-70" aria-hidden />}
            value={filters.specialty}
            onChange={(v) => setFilter('specialty', v)}
            options={specialtyOptions}
            loading={specialties.isLoading}
            searchable
          />
          <SelectFilter label="Status" value={filters.active} onChange={(v) => setFilter('active', v)} options={ACTIVE_OPTIONS} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const BENCHMARK_FILTERS = { q: filterParam.text(), procedure: filterParam.text(), country: filterParam.text() };

function BenchmarksSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: BENCHMARK_FILTERS, defaultSort: 'procedure' });
  const { filters, setFilter } = table;
  const procedures = useProcedures();
  const benchmarks = useQuery({ queryKey: [...benchmarksKey, {}], queryFn: () => adminApi.costBenchmarks.list() });
  const procedureOptions = useMemo(() => (procedures.data ?? []).map((p) => ({ value: p.id, label: p.name })), [procedures.data]);
  const procedureName = useMemo(() => new Map((procedures.data ?? []).map((p) => [p.id, p.name])), [procedures.data]);
  const countryOptions = useMemo(
    () => [...new Set((benchmarks.data ?? []).map((b) => b.country_code))].sort().map((c) => ({ value: c, label: countryName(c), description: c })),
    [benchmarks.data],
  );
  const nameOf = (b: CostBenchmarkOut) => (b.procedure_id ? (procedureName.get(b.procedure_id) ?? '—') : '—');
  const fields = useMemo<FieldDef<CostBenchmarkOut>[]>(
    () => [
      {
        name: 'procedure_id',
        label: 'Procedure',
        kind: 'select',
        required: true,
        options: procedureOptions,
        defaultValue: filters.procedure,
        wide: true,
      },
      { name: 'country_code', label: 'Country (ISO-2)', kind: 'text', required: true, maxLength: 2, uppercase: true, hint: 'e.g. US, GB, NG' },
      { name: 'currency', label: 'Currency', kind: 'text', defaultValue: 'USD', uppercase: true },
      { name: 'cost_min_minor', label: 'Home cost from', kind: 'money', required: true, currencyField: 'currency' },
      { name: 'cost_max_minor', label: 'Home cost to', kind: 'money', required: true, currencyField: 'currency' },
      { name: 'wait_time_text', label: 'Typical wait time', kind: 'text', maxLength: 60, hint: 'e.g. 3–6 months' },
      { name: 'source', label: 'Source', kind: 'text', maxLength: 300, hint: 'Where the figure comes from' },
    ],
    [procedureOptions, filters.procedure],
  );
  const columns: DataTableColumn<CostBenchmarkOut>[] = [
    {
      key: 'procedure',
      header: 'Procedure',
      sortable: true,
      sticky: true,
      mobile: 'primary',
      sortValue: nameOf,
      cell: (b) => <span className="font-medium">{nameOf(b)}</span>,
      exportValue: nameOf,
    },
    {
      key: 'country',
      header: 'Country',
      sortable: true,
      mobile: 'secondary',
      sortValue: (b) => countryName(b.country_code),
      cell: (b) => (
        <span className="inline-flex items-center gap-2">
          <Badge tone="neutral">{b.country_code}</Badge>
          <span className="text-muted">{countryName(b.country_code)}</span>
        </span>
      ),
      mobileCell: (b) => countryName(b.country_code),
      exportValue: (b) => b.country_code,
    },
    {
      key: 'cost',
      header: 'Home cost',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (b) => b.cost_min_minor,
      cell: (b) => <span className="whitespace-nowrap tabular-nums">{formatMoneyRange(b.cost_min_minor, b.cost_max_minor, b.currency)}</span>,
      exportValue: (b) => formatMoneyRange(b.cost_min_minor, b.cost_max_minor, b.currency),
    },
    { key: 'wait', header: 'Wait', cell: (b) => b.wait_time_text ?? <span className="text-muted">—</span>, exportValue: (b) => b.wait_time_text ?? '' },
    {
      key: 'source',
      header: 'Source',
      className: 'max-w-56',
      cell: (b) => <TextCell primary={<span className="text-xs text-muted">{b.source ?? '—'}</span>} />,
      exportValue: (b) => b.source ?? '',
    },
  ];
  return (
    <CrudSection<CostBenchmarkOut, CostBenchmarkIn>
      id="admin.catalog.benchmarks"
      table={table}
      entityName="benchmark"
      queryKey={benchmarksKey}
      endpoints={adminApi.costBenchmarks}
      fields={fields}
      columns={columns}
      rowKey={(b) => b.id ?? `${b.procedure_id}-${b.country_code}`}
      rowLabel={(b) => `${nameOf(b)} ${b.country_code}`.trim()}
      canEdit={canEdit}
      searchText={(b) => `${nameOf(b)} ${b.country_code} ${countryName(b.country_code)}`}
      filterRow={(b) => (!filters.procedure || b.procedure_id === filters.procedure) && (!filters.country || b.country_code === filters.country)}
      alsoInvalidate={[proceduresKey]}
      description="Typical self-pay cost in the patient's home country; drives the savings shown to patients."
      filters={
        <>
          <SelectFilter
            label="Procedure"
            icon={<Syringe className="size-3.5 opacity-70" aria-hidden />}
            value={filters.procedure}
            onChange={(v) => setFilter('procedure', v)}
            options={procedureOptions}
            loading={procedures.isLoading}
            searchable
          />
          <SelectFilter
            label="Country"
            icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
            value={filters.country}
            onChange={(v) => setFilter('country', v)}
            options={countryOptions}
            searchable
          />
        </>
      }
    />
  );
}
