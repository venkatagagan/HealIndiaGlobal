import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, Languages, MapPin, Tag } from 'lucide-react';
import {
  ACCOMMODATION_TYPES,
  ACCOMMODATION_TYPE_LABELS,
  adminApi,
  enumOptions,
  RATE_UNITS,
  RATE_UNIT_LABELS,
  SERVICE_KINDS,
  SERVICE_KIND_LABELS,
  type AccommodationProviderIn,
  type AccommodationProviderOut,
  type CulturalTipIn,
  type CulturalTipOut,
  type FxRateIn,
  type FxRateOut,
  type ServiceProviderIn,
  type ServiceProviderOut,
} from '@hig/shared/api';
import { filterParam, formatMoney, fromMinor, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { Badge, DateCell, MoneyCell, PageHeader, SelectFilter, TextCell, type DataTableColumn, type FilterOption } from '@hig/shared/ui';
import { Tabs } from '../ui';
import { CrudSection, type FieldDef } from '../components/CrudSection';
import { opsKeys } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';

const TABS = ['tips', 'accommodation', 'services', 'fx'] as const;
type TabKey = (typeof TABS)[number];

const ACTIVE_OPTIONS: FilterOption<'active' | 'inactive'>[] = [
  { value: 'active', label: 'Active', tone: 'success' },
  { value: 'inactive', label: 'Inactive', tone: 'danger' },
];
function ActiveBadge({ active }: { active: boolean | undefined }) {
  return active === false ? <Badge tone="danger">Inactive</Badge> : <Badge tone="success">Active</Badge>;
}
const matchesActive = (filter: string, active: boolean | undefined) =>
  !filter || (filter === 'active' ? active !== false : active === false);

const unique = (values: (string | null | undefined)[]): FilterOption[] =>
  [...new Set(values.filter((v): v is string => !!v))].sort().map((v) => ({ value: v, label: v }));

export default function ContentPage() {
  useDocumentTitle('Content');
  const perms = useOpsPermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'tips';
  return (
    <div>
      <PageHeader title="Content" description="Patient-facing tips, partner stays and services, and the currency rates used at checkout." />
      <Tabs
        tabs={[
          { key: 'tips', label: 'Cultural tips' },
          { key: 'accommodation', label: 'Accommodation providers' },
          { key: 'services', label: 'Service providers' },
          { key: 'fx', label: 'FX rates' },
        ]}
        value={tab}
        onChange={(k) => setParams(k === 'tips' ? {} : { tab: k }, { replace: true })}
      />
      {tab === 'tips' && <TipsSection canEdit={perms.editCatalog} />}
      {tab === 'accommodation' && <AccommodationSection canEdit={perms.editCatalog} />}
      {tab === 'services' && <ServicesSection canEdit={perms.editCatalog} />}
      {tab === 'fx' && <FxSection canEdit={perms.editCatalog} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
const TIP_FIELDS: FieldDef<CulturalTipOut>[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true, maxLength: 200, wide: true },
  { name: 'body', label: 'Text', kind: 'textarea', required: true, maxLength: 4000 },
  { name: 'category', label: 'Category', kind: 'text', maxLength: 60, hint: 'e.g. food, etiquette, money' },
  { name: 'sort_order', label: 'Sort order', kind: 'int', defaultValue: '0', min: 0 },
  { name: 'image_url', label: 'Image URL', kind: 'url', maxLength: 500, wide: true },
  { name: 'is_active', label: 'Active', kind: 'bool', defaultValue: true },
];

const TIP_COLUMNS: DataTableColumn<CulturalTipOut>[] = [
  {
    key: 'title',
    header: 'Tip',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-xl',
    cell: (t) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{t.title}</span>
        <span className="line-clamp-2 text-xs text-muted">{t.body}</span>
      </span>
    ),
    mobileCell: (t) => t.title,
    exportValue: (t) => t.title,
  },
  {
    key: 'category',
    header: 'Category',
    sortable: true,
    mobile: 'secondary',
    cell: (t) => (t.category ? <Badge tone="info">{t.category}</Badge> : <span className="text-muted">—</span>),
    exportValue: (t) => t.category ?? '',
  },
  { key: 'sort_order', header: 'Order', sortable: true, align: 'end', cell: (t) => <span className="tabular-nums">{t.sort_order}</span> },
  {
    key: 'active',
    header: 'Status',
    mobile: 'badge',
    sortable: true,
    sortValue: (t) => t.is_active !== false,
    cell: (t) => <ActiveBadge active={t.is_active} />,
    exportValue: (t) => (t.is_active === false ? 'Inactive' : 'Active'),
  },
];

const TIP_FILTERS = { q: filterParam.text(), category: filterParam.text(), active: filterParam.text() };

function TipsSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: TIP_FILTERS, defaultSort: 'sort_order' });
  const { filters, setFilter } = table;
  const key = [...opsKeys.content, 'cultural-tips'];
  const categories = useQuery({
    queryKey: [...key, {}],
    queryFn: () => adminApi.culturalTips.list(),
    select: (rows) => unique(rows.map((t) => t.category)),
  });
  return (
    <CrudSection<CulturalTipOut, CulturalTipIn>
      id="admin.content.tips"
      table={table}
      entityName="cultural tip"
      queryKey={key}
      endpoints={adminApi.culturalTips}
      fields={TIP_FIELDS}
      columns={TIP_COLUMNS}
      rowKey={(t) => t.id}
      rowLabel={(t) => t.title}
      canEdit={canEdit}
      searchText={(t) => `${t.title} ${t.body} ${t.category ?? ''}`}
      filterRow={(t) => (!filters.category || t.category === filters.category) && matchesActive(filters.active, t.is_active)}
      filters={
        <>
          <SelectFilter
            label="Category"
            icon={<Tag className="size-3.5 opacity-70" aria-hidden />}
            value={filters.category}
            onChange={(v) => setFilter('category', v)}
            options={categories.data ?? []}
          />
          <SelectFilter label="Status" value={filters.active} onChange={(v) => setFilter('active', v)} options={ACTIVE_OPTIONS} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const ACCOMMODATION_FIELDS: FieldDef<AccommodationProviderOut>[] = [
  { name: 'name', label: 'Name', kind: 'text', required: true, maxLength: 200 },
  {
    name: 'type',
    label: 'Type',
    kind: 'select',
    required: true,
    options: enumOptions(ACCOMMODATION_TYPES, ACCOMMODATION_TYPE_LABELS),
    defaultValue: 'hotel',
  },
  { name: 'city', label: 'City', kind: 'text', required: true, maxLength: 100 },
  { name: 'star_rating', label: 'Star rating', kind: 'int', min: 1, max: 5 },
  { name: 'address', label: 'Address', kind: 'text', maxLength: 300, wide: true },
  { name: 'lat', label: 'Latitude', kind: 'decimal', min: -90, max: 90 },
  { name: 'lng', label: 'Longitude', kind: 'decimal', min: -180, max: 180 },
  { name: 'currency', label: 'Currency', kind: 'text', defaultValue: 'INR', uppercase: true },
  { name: 'nightly_rate_minor', label: 'Nightly rate', kind: 'money', required: true, currencyField: 'currency' },
  { name: 'phone', label: 'Phone', kind: 'text', maxLength: 40 },
  { name: 'email', label: 'Email', kind: 'email', maxLength: 254 },
  { name: 'amenities', label: 'Amenities', kind: 'list', wide: true, hint: 'Comma separated, e.g. wifi, kitchen, wheelchair access' },
  { name: 'photos', label: 'Photo URLs', kind: 'list', wide: true, hint: 'Comma separated https URLs' },
  { name: 'is_active', label: 'Active', kind: 'bool', defaultValue: true },
];

const ACCOMMODATION_COLUMNS: DataTableColumn<AccommodationProviderOut>[] = [
  {
    key: 'name',
    header: 'Provider',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (a) => (
      <TextCell
        primary={<span className="font-medium">{a.name}</span>}
        secondary={`${ACCOMMODATION_TYPE_LABELS[a.type] ?? a.type}${a.star_rating ? ` · ${'★'.repeat(a.star_rating)}` : ''}`}
      />
    ),
    exportValue: (a) => a.name,
  },
  { key: 'city', header: 'City', sortable: true, mobile: 'secondary', cell: (a) => a.city, exportValue: (a) => a.city },
  {
    key: 'nightly_rate_minor',
    header: 'Nightly',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => <MoneyCell minor={a.nightly_rate_minor} currency={a.currency} />,
    exportValue: (a) => `${a.currency} ${fromMinor(a.nightly_rate_minor, a.currency)}`,
  },
  {
    key: 'amenities',
    header: 'Amenities',
    defaultHidden: true,
    className: 'max-w-56',
    cell: (a) => <TextCell primary={a.amenities.join(', ') || '—'} />,
    exportValue: (a) => a.amenities.join('; '),
  },
  {
    key: 'contact',
    header: 'Contact',
    cell: (a) => <TextCell primary={a.phone ?? '—'} secondary={a.email ?? undefined} />,
    exportValue: (a) => a.phone ?? a.email ?? '',
  },
  {
    key: 'active',
    header: 'Status',
    mobile: 'badge',
    sortable: true,
    sortValue: (a) => a.is_active !== false,
    cell: (a) => <ActiveBadge active={a.is_active} />,
    exportValue: (a) => (a.is_active === false ? 'Inactive' : 'Active'),
  },
];

const ACCOMMODATION_FILTERS = { q: filterParam.text(), type: filterParam.text(), city: filterParam.text(), active: filterParam.text() };

function AccommodationSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: ACCOMMODATION_FILTERS, defaultSort: 'name' });
  const { filters, setFilter } = table;
  const all = useQuery({
    queryKey: [...opsKeys.content, 'accommodation-providers', {}],
    queryFn: () => adminApi.accommodationProviders.list(),
  });
  return (
    <CrudSection<AccommodationProviderOut, AccommodationProviderIn>
      id="admin.content.accommodation"
      table={table}
      entityName="accommodation provider"
      queryKey={[...opsKeys.content, 'accommodation-providers']}
      endpoints={adminApi.accommodationProviders}
      fields={ACCOMMODATION_FIELDS}
      columns={ACCOMMODATION_COLUMNS}
      rowKey={(a) => a.id}
      rowLabel={(a) => a.name}
      canEdit={canEdit}
      searchText={(a) => `${a.name} ${a.city} ${a.address ?? ''}`}
      filterRow={(a) =>
        (!filters.type || a.type === filters.type) && (!filters.city || a.city === filters.city) && matchesActive(filters.active, a.is_active)
      }
      filters={
        <>
          <SelectFilter
            label="Type"
            icon={<BedDouble className="size-3.5 opacity-70" aria-hidden />}
            value={filters.type}
            onChange={(v) => setFilter('type', v)}
            options={ACCOMMODATION_TYPES.map((t) => ({ value: t, label: ACCOMMODATION_TYPE_LABELS[t] }))}
          />
          <SelectFilter
            label="City"
            icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
            value={filters.city}
            onChange={(v) => setFilter('city', v)}
            options={unique((all.data ?? []).map((a) => a.city))}
            searchable
          />
          <SelectFilter label="Status" value={filters.active} onChange={(v) => setFilter('active', v)} options={ACTIVE_OPTIONS} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const SERVICE_FIELDS: FieldDef<ServiceProviderOut>[] = [
  { name: 'name', label: 'Name', kind: 'text', required: true, maxLength: 200 },
  {
    name: 'kind',
    label: 'Service',
    kind: 'select',
    required: true,
    options: enumOptions(SERVICE_KINDS, SERVICE_KIND_LABELS),
    defaultValue: 'translator',
  },
  { name: 'city', label: 'City', kind: 'text', maxLength: 100 },
  { name: 'languages', label: 'Languages', kind: 'list', hint: 'Comma separated, e.g. English, Arabic, French' },
  { name: 'currency', label: 'Currency', kind: 'text', defaultValue: 'INR', uppercase: true },
  { name: 'rate_minor', label: 'Rate', kind: 'money', currencyField: 'currency' },
  { name: 'rate_unit', label: 'Rate unit', kind: 'select', options: enumOptions(RATE_UNITS, RATE_UNIT_LABELS) },
  { name: 'phone', label: 'Phone', kind: 'text', maxLength: 40 },
  { name: 'email', label: 'Email', kind: 'email', maxLength: 254 },
  { name: 'is_active', label: 'Active', kind: 'bool', defaultValue: true },
];

const SERVICE_COLUMNS: DataTableColumn<ServiceProviderOut>[] = [
  {
    key: 'name',
    header: 'Provider',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (s) => <TextCell primary={<span className="font-medium">{s.name}</span>} secondary={SERVICE_KIND_LABELS[s.kind] ?? s.kind} />,
    exportValue: (s) => s.name,
  },
  {
    key: 'kind',
    header: 'Service',
    sortable: true,
    defaultHidden: true,
    cell: (s) => <Badge tone="accent">{SERVICE_KIND_LABELS[s.kind] ?? s.kind}</Badge>,
    exportValue: (s) => SERVICE_KIND_LABELS[s.kind] ?? s.kind,
  },
  { key: 'city', header: 'City', sortable: true, mobile: 'secondary', cell: (s) => s.city ?? <span className="text-muted">—</span>, exportValue: (s) => s.city ?? '' },
  {
    key: 'languages',
    header: 'Languages',
    className: 'max-w-56',
    cell: (s) => <TextCell primary={s.languages.join(', ') || '—'} />,
    exportValue: (s) => s.languages.join('; '),
  },
  {
    key: 'rate_minor',
    header: 'Rate',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (s) => (
      <MoneyCell minor={s.rate_minor} currency={s.currency} secondary={s.rate_unit && s.rate_unit !== 'fixed' ? `per ${RATE_UNIT_LABELS[s.rate_unit]?.toLowerCase() ?? s.rate_unit}` : undefined} />
    ),
    exportValue: (s) => (s.rate_minor != null ? formatMoney(s.rate_minor, s.currency) : ''),
  },
  {
    key: 'rating_avg',
    header: 'Rating',
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (s) => (s.rating_avg != null ? <span className="tabular-nums">{s.rating_avg} ★</span> : <span className="text-muted">—</span>),
    exportValue: (s) => s.rating_avg ?? '',
  },
  {
    key: 'active',
    header: 'Status',
    mobile: 'badge',
    sortable: true,
    sortValue: (s) => s.is_active !== false,
    cell: (s) => <ActiveBadge active={s.is_active} />,
    exportValue: (s) => (s.is_active === false ? 'Inactive' : 'Active'),
  },
];

const SERVICE_FILTERS = { q: filterParam.text(), kind: filterParam.text(), language: filterParam.text(), active: filterParam.text() };

function ServicesSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: SERVICE_FILTERS, defaultSort: 'name' });
  const { filters, setFilter } = table;
  const all = useQuery({
    queryKey: [...opsKeys.content, 'service-providers', {}],
    queryFn: () => adminApi.serviceProviders.list(),
  });
  return (
    <CrudSection<ServiceProviderOut, ServiceProviderIn>
      id="admin.content.services"
      table={table}
      entityName="service provider"
      queryKey={[...opsKeys.content, 'service-providers']}
      endpoints={adminApi.serviceProviders}
      fields={SERVICE_FIELDS}
      columns={SERVICE_COLUMNS}
      rowKey={(s) => s.id}
      rowLabel={(s) => s.name}
      canEdit={canEdit}
      searchText={(s) => `${s.name} ${s.city ?? ''} ${s.languages.join(' ')}`}
      filterRow={(s) =>
        (!filters.kind || s.kind === filters.kind) &&
        (!filters.language || s.languages.includes(filters.language)) &&
        matchesActive(filters.active, s.is_active)
      }
      filters={
        <>
          <SelectFilter
            label="Service"
            value={filters.kind}
            onChange={(v) => setFilter('kind', v)}
            options={SERVICE_KINDS.map((k) => ({ value: k, label: SERVICE_KIND_LABELS[k] }))}
          />
          <SelectFilter
            label="Language"
            icon={<Languages className="size-3.5 opacity-70" aria-hidden />}
            value={filters.language}
            onChange={(v) => setFilter('language', v)}
            options={unique((all.data ?? []).flatMap((s) => s.languages))}
            searchable
          />
          <SelectFilter label="Status" value={filters.active} onChange={(v) => setFilter('active', v)} options={ACTIVE_OPTIONS} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const FX_FIELDS: FieldDef<FxRateOut>[] = [
  { name: 'quote_currency', label: 'Currency', kind: 'text', required: true, maxLength: 3, uppercase: true, hint: 'ISO-4217, e.g. USD' },
  {
    name: 'rate',
    label: 'INR per 1 unit',
    kind: 'decimal',
    required: true,
    decimalAsString: true,
    min: 0,
    hint: 'e.g. 83.25 means 1 USD = ₹83.25',
  },
  { name: 'source', label: 'Source', kind: 'text', maxLength: 100, defaultValue: 'manual' },
];

const FX_COLUMNS: DataTableColumn<FxRateOut>[] = [
  {
    key: 'quote_currency',
    header: 'Currency',
    sortable: true,
    sticky: true,
    mobile: 'primary',
    cell: (r) => <Badge tone="accent">{r.quote_currency}</Badge>,
    exportValue: (r) => r.quote_currency,
  },
  {
    key: 'rate',
    header: 'Rate',
    align: 'end',
    sortable: true,
    sortValue: (r) => Number(r.rate),
    cell: (r) => (
      <span className="tabular-nums">
        1 {r.quote_currency} = ₹{Number(r.rate).toLocaleString('en-IN', { maximumFractionDigits: 6 })}
      </span>
    ),
    exportValue: (r) => String(r.rate),
  },
  { key: 'source', header: 'Source', sortable: true, cell: (r) => r.source ?? <span className="text-muted">—</span>, exportValue: (r) => r.source ?? '' },
  {
    key: 'as_of',
    header: 'As of',
    sortable: true,
    sortDescFirst: true,
    cell: (r) => <DateCell value={r.as_of} display="datetime" />,
    exportValue: (r) => r.as_of,
  },
];

const FX_FILTERS = { q: filterParam.text() };

function FxSection({ canEdit }: { canEdit: boolean }) {
  const table = useTableState({ filters: FX_FILTERS, defaultSort: 'quote_currency' });
  return (
    <CrudSection<FxRateOut, FxRateIn>
      id="admin.content.fx"
      table={table}
      entityName="FX rate"
      queryKey={[...opsKeys.content, 'fx-rates']}
      endpoints={adminApi.fxRates}
      fields={FX_FIELDS}
      columns={FX_COLUMNS}
      rowKey={(r) => r.quote_currency}
      rowId={(r) => r.id ?? r.quote_currency}
      rowLabel={(r) => r.quote_currency}
      canEdit={canEdit}
      searchText={(r) => `${r.quote_currency} ${r.source ?? ''}`}
      description="Base currency is INR. Rates are snapshotted onto each payment order at checkout; changing a rate does not alter existing orders."
    />
  );
}
