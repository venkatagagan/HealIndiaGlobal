import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
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
import { filterParam, formatMoney, formatNumber, fromMinor, useDocumentTitle, useTableState } from '@hig/shared/lib';
import { Badge, DateCell, MoneyCell, PageHeader, SelectFilter, TextCell, type DataTableColumn, type FilterOption } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { Tabs } from '../ui';
import { CrudSection, type FieldDef } from '../components/CrudSection';
import { opsKeys } from '../lib/mutations';
import { FxPendingPanel, fxRatesQueryKey } from '../components/DualControl';
import type { FxRateWithPending } from '../lib/phase1Api';
import { useOpsPermissions } from '../lib/session';

const TABS = ['tips', 'accommodation', 'services', 'fx'] as const;
type TabKey = (typeof TABS)[number];

const activeOptions = (t: TFunction): FilterOption<'active' | 'inactive'>[] => [
  { value: 'active', label: t('content.status.active'), tone: 'success' },
  { value: 'inactive', label: t('content.status.inactive'), tone: 'danger' },
];
function ActiveBadge({ active }: { active: boolean | undefined }) {
  const { t } = useAppTranslation();
  return active === false ? <Badge tone="danger">{t('content.status.inactive')}</Badge> : <Badge tone="success">{t('content.status.active')}</Badge>;
}
const matchesActive = (filter: string, active: boolean | undefined) =>
  !filter || (filter === 'active' ? active !== false : active === false);
const activeText = (t: TFunction, active: boolean | undefined) =>
  active === false ? t('content.status.inactive') : t('content.status.active');

const unique = (values: (string | null | undefined)[]): FilterOption[] =>
  [...new Set(values.filter((v): v is string => !!v))].sort().map((v) => ({ value: v, label: v }));

export default function ContentPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('content.title'));
  const perms = useOpsPermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'tips';
  return (
    <div>
      <PageHeader title={t('content.title')} description={t('content.description')} />
      <Tabs
        tabs={[
          { key: 'tips', label: t('content.tabs.tips') },
          { key: 'accommodation', label: t('content.tabs.accommodation') },
          { key: 'services', label: t('content.tabs.services') },
          { key: 'fx', label: t('content.tabs.fx') },
        ]}
        value={tab}
        onChange={(k) => setParams(k === 'tips' ? {} : { tab: k }, { replace: true })}
      />
      {tab === 'tips' && <TipsSection canEdit={perms.editCatalog} />}
      {tab === 'accommodation' && <AccommodationSection canEdit={perms.editCatalog} />}
      {tab === 'services' && <ServicesSection canEdit={perms.editCatalog} />}
      {tab === 'fx' && <FxSection canEdit={perms.editFinanceSettings} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
const tipFields = (t: TFunction): FieldDef<CulturalTipOut>[] => [
  { name: 'title', label: t('content.fields.title'), kind: 'text', required: true, maxLength: 200, wide: true },
  { name: 'body', label: t('content.fields.text'), kind: 'textarea', required: true, maxLength: 4000 },
  { name: 'category', label: t('content.fields.category'), kind: 'text', maxLength: 60, hint: t('content.fields.categoryHint') },
  { name: 'sort_order', label: t('content.fields.sortOrder'), kind: 'int', defaultValue: '0', min: 0 },
  { name: 'image_url', label: t('content.fields.imageUrl'), kind: 'url', maxLength: 500, wide: true },
  { name: 'is_active', label: t('content.fields.active'), kind: 'bool', defaultValue: true },
];

const tipColumns = (t: TFunction): DataTableColumn<CulturalTipOut>[] => [
  {
    key: 'title',
    header: t('content.columns.tip'),
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-xl',
    cell: (tip) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-fg">{tip.title}</span>
        <span className="line-clamp-2 text-xs text-muted">{tip.body}</span>
      </span>
    ),
    mobileCell: (tip) => tip.title,
    exportValue: (tip) => tip.title,
  },
  {
    key: 'category',
    header: t('content.columns.category'),
    sortable: true,
    mobile: 'secondary',
    cell: (tip) => (tip.category ? <Badge tone="info">{tip.category}</Badge> : <span className="text-muted">—</span>),
    exportValue: (tip) => tip.category ?? '',
  },
  {
    key: 'sort_order',
    header: t('content.columns.order'),
    sortable: true,
    align: 'end',
    cell: (tip) => <span className="tabular-nums">{tip.sort_order}</span>,
  },
  {
    key: 'active',
    header: t('content.columns.status'),
    mobile: 'badge',
    sortable: true,
    sortValue: (tip) => tip.is_active !== false,
    cell: (tip) => <ActiveBadge active={tip.is_active} />,
    exportValue: (tip) => activeText(t, tip.is_active),
  },
];

const TIP_FILTERS = { q: filterParam.text(), category: filterParam.text(), active: filterParam.text() };

function TipsSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useAppTranslation();
  const table = useTableState({ filters: TIP_FILTERS, defaultSort: 'sort_order' });
  const { filters, setFilter } = table;
  const key = [...opsKeys.content, 'cultural-tips'];
  const categories = useQuery({
    queryKey: [...key, {}],
    queryFn: () => adminApi.culturalTips.list(),
    select: (rows) => unique(rows.map((tip) => tip.category)),
  });
  const fields = useMemo(() => tipFields(t), [t]);
  const columns = useMemo(() => tipColumns(t), [t]);
  return (
    <CrudSection<CulturalTipOut, CulturalTipIn>
      id="admin.content.tips"
      table={table}
      entityName={t('content.entities.tip')}
      entityPlural={t('content.entities.tips')}
      queryKey={key}
      endpoints={adminApi.culturalTips}
      fields={fields}
      columns={columns}
      rowKey={(tip) => tip.id}
      rowLabel={(tip) => tip.title}
      canEdit={canEdit}
      searchText={(tip) => `${tip.title} ${tip.body} ${tip.category ?? ''}`}
      filterRow={(tip) => (!filters.category || tip.category === filters.category) && matchesActive(filters.active, tip.is_active)}
      filters={
        <>
          <SelectFilter
            label={t('content.filters.category')}
            icon={<Tag className="size-3.5 opacity-70" aria-hidden />}
            value={filters.category}
            onChange={(v) => setFilter('category', v)}
            options={categories.data ?? []}
          />
          <SelectFilter label={t('content.filters.status')} value={filters.active} onChange={(v) => setFilter('active', v)} options={activeOptions(t)} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const accommodationFields = (t: TFunction): FieldDef<AccommodationProviderOut>[] => [
  { name: 'name', label: t('content.fields.name'), kind: 'text', required: true, maxLength: 200 },
  {
    name: 'type',
    label: t('content.fields.type'),
    kind: 'select',
    required: true,
    options: enumOptions(ACCOMMODATION_TYPES, ACCOMMODATION_TYPE_LABELS),
    defaultValue: 'hotel',
  },
  { name: 'city', label: t('content.fields.city'), kind: 'text', required: true, maxLength: 100 },
  { name: 'star_rating', label: t('content.fields.starRating'), kind: 'int', min: 1, max: 5 },
  { name: 'address', label: t('content.fields.address'), kind: 'text', maxLength: 300, wide: true },
  { name: 'lat', label: t('content.fields.latitude'), kind: 'decimal', min: -90, max: 90 },
  { name: 'lng', label: t('content.fields.longitude'), kind: 'decimal', min: -180, max: 180 },
  { name: 'currency', label: t('content.fields.currency'), kind: 'text', defaultValue: 'INR', uppercase: true },
  { name: 'nightly_rate_minor', label: t('content.fields.nightlyRate'), kind: 'money', required: true, currencyField: 'currency' },
  { name: 'phone', label: t('content.fields.phone'), kind: 'text', maxLength: 40 },
  { name: 'email', label: t('content.fields.email'), kind: 'email', maxLength: 254 },
  { name: 'amenities', label: t('content.fields.amenities'), kind: 'list', wide: true, hint: t('content.fields.amenitiesHint') },
  { name: 'photos', label: t('content.fields.photoUrls'), kind: 'list', wide: true, hint: t('content.fields.photoUrlsHint') },
  { name: 'is_active', label: t('content.fields.active'), kind: 'bool', defaultValue: true },
];

const accommodationColumns = (t: TFunction): DataTableColumn<AccommodationProviderOut>[] => [
  {
    key: 'name',
    header: t('content.columns.provider'),
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
  { key: 'city', header: t('content.columns.city'), sortable: true, mobile: 'secondary', cell: (a) => a.city, exportValue: (a) => a.city },
  {
    key: 'nightly_rate_minor',
    header: t('content.columns.nightly'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (a) => <MoneyCell minor={a.nightly_rate_minor} currency={a.currency} />,
    exportValue: (a) => `${a.currency} ${fromMinor(a.nightly_rate_minor, a.currency)}`,
  },
  {
    key: 'amenities',
    header: t('content.columns.amenities'),
    defaultHidden: true,
    className: 'max-w-56',
    cell: (a) => <TextCell primary={a.amenities.join(', ') || '—'} />,
    exportValue: (a) => a.amenities.join('; '),
  },
  {
    key: 'contact',
    header: t('content.columns.contact'),
    cell: (a) => <TextCell primary={a.phone ?? '—'} secondary={a.email ?? undefined} />,
    exportValue: (a) => a.phone ?? a.email ?? '',
  },
  {
    key: 'active',
    header: t('content.columns.status'),
    mobile: 'badge',
    sortable: true,
    sortValue: (a) => a.is_active !== false,
    cell: (a) => <ActiveBadge active={a.is_active} />,
    exportValue: (a) => activeText(t, a.is_active),
  },
];

const ACCOMMODATION_FILTERS = { q: filterParam.text(), type: filterParam.text(), city: filterParam.text(), active: filterParam.text() };

function AccommodationSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useAppTranslation();
  const table = useTableState({ filters: ACCOMMODATION_FILTERS, defaultSort: 'name' });
  const { filters, setFilter } = table;
  const all = useQuery({
    queryKey: [...opsKeys.content, 'accommodation-providers', {}],
    queryFn: () => adminApi.accommodationProviders.list(),
  });
  const fields = useMemo(() => accommodationFields(t), [t]);
  const columns = useMemo(() => accommodationColumns(t), [t]);
  return (
    <CrudSection<AccommodationProviderOut, AccommodationProviderIn>
      id="admin.content.accommodation"
      table={table}
      entityName={t('content.entities.accommodation')}
      entityPlural={t('content.entities.accommodationPlural')}
      queryKey={[...opsKeys.content, 'accommodation-providers']}
      endpoints={adminApi.accommodationProviders}
      fields={fields}
      columns={columns}
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
            label={t('content.filters.type')}
            icon={<BedDouble className="size-3.5 opacity-70" aria-hidden />}
            value={filters.type}
            onChange={(v) => setFilter('type', v)}
            options={ACCOMMODATION_TYPES.map((type) => ({ value: type, label: ACCOMMODATION_TYPE_LABELS[type] }))}
          />
          <SelectFilter
            label={t('content.filters.city')}
            icon={<MapPin className="size-3.5 opacity-70" aria-hidden />}
            value={filters.city}
            onChange={(v) => setFilter('city', v)}
            options={unique((all.data ?? []).map((a) => a.city))}
            searchable
          />
          <SelectFilter label={t('content.filters.status')} value={filters.active} onChange={(v) => setFilter('active', v)} options={activeOptions(t)} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const serviceFields = (t: TFunction): FieldDef<ServiceProviderOut>[] => [
  { name: 'name', label: t('content.fields.name'), kind: 'text', required: true, maxLength: 200 },
  {
    name: 'kind',
    label: t('content.fields.service'),
    kind: 'select',
    required: true,
    options: enumOptions(SERVICE_KINDS, SERVICE_KIND_LABELS),
    defaultValue: 'translator',
  },
  { name: 'city', label: t('content.fields.city'), kind: 'text', maxLength: 100 },
  { name: 'languages', label: t('content.fields.languages'), kind: 'list', hint: t('content.fields.languagesHint') },
  { name: 'currency', label: t('content.fields.currency'), kind: 'text', defaultValue: 'INR', uppercase: true },
  { name: 'rate_minor', label: t('content.fields.rate'), kind: 'money', currencyField: 'currency' },
  { name: 'rate_unit', label: t('content.fields.rateUnit'), kind: 'select', options: enumOptions(RATE_UNITS, RATE_UNIT_LABELS) },
  { name: 'phone', label: t('content.fields.phone'), kind: 'text', maxLength: 40 },
  { name: 'email', label: t('content.fields.email'), kind: 'email', maxLength: 254 },
  { name: 'is_active', label: t('content.fields.active'), kind: 'bool', defaultValue: true },
];

const serviceColumns = (t: TFunction): DataTableColumn<ServiceProviderOut>[] => [
  {
    key: 'name',
    header: t('content.columns.provider'),
    sortable: true,
    sticky: true,
    mobile: 'primary',
    className: 'max-w-64',
    cell: (s) => <TextCell primary={<span className="font-medium">{s.name}</span>} secondary={SERVICE_KIND_LABELS[s.kind] ?? s.kind} />,
    exportValue: (s) => s.name,
  },
  {
    key: 'kind',
    header: t('content.columns.service'),
    sortable: true,
    defaultHidden: true,
    cell: (s) => <Badge tone="accent">{SERVICE_KIND_LABELS[s.kind] ?? s.kind}</Badge>,
    exportValue: (s) => SERVICE_KIND_LABELS[s.kind] ?? s.kind,
  },
  {
    key: 'city',
    header: t('content.columns.city'),
    sortable: true,
    mobile: 'secondary',
    cell: (s) => s.city ?? <span className="text-muted">—</span>,
    exportValue: (s) => s.city ?? '',
  },
  {
    key: 'languages',
    header: t('content.columns.languages'),
    className: 'max-w-56',
    cell: (s) => <TextCell primary={s.languages.join(', ') || '—'} />,
    exportValue: (s) => s.languages.join('; '),
  },
  {
    key: 'rate_minor',
    header: t('content.columns.rate'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (s) => (
      // RATE_UNIT_LABELS already read "Per hour" / "Per day" / "Per trip"
      <MoneyCell minor={s.rate_minor} currency={s.currency} secondary={s.rate_unit && s.rate_unit !== 'fixed' ? (RATE_UNIT_LABELS[s.rate_unit] ?? s.rate_unit) : undefined} />
    ),
    exportValue: (s) => (s.rate_minor != null ? formatMoney(s.rate_minor, s.currency) : ''),
  },
  {
    key: 'rating_avg',
    header: t('content.columns.rating'),
    align: 'end',
    sortable: true,
    sortDescFirst: true,
    cell: (s) =>
      s.rating_avg != null ? <span className="tabular-nums">{formatNumber(Number(s.rating_avg))} ★</span> : <span className="text-muted">—</span>,
    exportValue: (s) => s.rating_avg ?? '',
  },
  {
    key: 'active',
    header: t('content.columns.status'),
    mobile: 'badge',
    sortable: true,
    sortValue: (s) => s.is_active !== false,
    cell: (s) => <ActiveBadge active={s.is_active} />,
    exportValue: (s) => activeText(t, s.is_active),
  },
];

const SERVICE_FILTERS = { q: filterParam.text(), kind: filterParam.text(), language: filterParam.text(), active: filterParam.text() };

function ServicesSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useAppTranslation();
  const table = useTableState({ filters: SERVICE_FILTERS, defaultSort: 'name' });
  const { filters, setFilter } = table;
  const all = useQuery({
    queryKey: [...opsKeys.content, 'service-providers', {}],
    queryFn: () => adminApi.serviceProviders.list(),
  });
  const fields = useMemo(() => serviceFields(t), [t]);
  const columns = useMemo(() => serviceColumns(t), [t]);
  return (
    <CrudSection<ServiceProviderOut, ServiceProviderIn>
      id="admin.content.services"
      table={table}
      entityName={t('content.entities.service')}
      entityPlural={t('content.entities.servicePlural')}
      queryKey={[...opsKeys.content, 'service-providers']}
      endpoints={adminApi.serviceProviders}
      fields={fields}
      columns={columns}
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
            label={t('content.filters.service')}
            value={filters.kind}
            onChange={(v) => setFilter('kind', v)}
            options={SERVICE_KINDS.map((k) => ({ value: k, label: SERVICE_KIND_LABELS[k] }))}
          />
          <SelectFilter
            label={t('content.filters.language')}
            icon={<Languages className="size-3.5 opacity-70" aria-hidden />}
            value={filters.language}
            onChange={(v) => setFilter('language', v)}
            options={unique((all.data ?? []).flatMap((s) => s.languages))}
            searchable
          />
          <SelectFilter label={t('content.filters.status')} value={filters.active} onChange={(v) => setFilter('active', v)} options={activeOptions(t)} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const fxFields = (t: TFunction): FieldDef<FxRateOut>[] => [
  {
    name: 'quote_currency',
    label: t('content.fields.currency'),
    kind: 'text',
    required: true,
    maxLength: 3,
    uppercase: true,
    hint: t('content.fields.quoteCurrencyHint'),
  },
  {
    name: 'rate',
    label: t('content.fields.inrPerUnit'),
    kind: 'decimal',
    required: true,
    decimalAsString: true,
    min: 0,
    hint: t('content.fields.inrPerUnitHint'),
  },
  { name: 'source', label: t('content.fields.source'), kind: 'text', maxLength: 100, defaultValue: 'manual' },
];

const fxColumns = (t: TFunction): DataTableColumn<FxRateOut>[] => [
  {
    key: 'quote_currency',
    header: t('content.columns.currency'),
    sortable: true,
    sticky: true,
    mobile: 'primary',
    cell: (r) => <Badge tone="accent">{r.quote_currency}</Badge>,
    exportValue: (r) => r.quote_currency,
  },
  {
    key: 'rate',
    header: t('content.columns.rate'),
    align: 'end',
    sortable: true,
    sortValue: (r) => Number(r.rate),
    cell: (r) => {
      const pending = (r as FxRateWithPending).pending_rate;
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="tabular-nums" dir="ltr">
            1 {r.quote_currency} = ₹{formatNumber(Number(r.rate), { maximumFractionDigits: 6 })}
          </span>
          {pending != null && (
            <Badge tone="warning">
              {t('security.fx.pendingBadge', { rate: formatNumber(Number(pending), { maximumFractionDigits: 6 }) })}
            </Badge>
          )}
        </span>
      );
    },
    exportValue: (r) => String(r.rate),
  },
  {
    key: 'source',
    header: t('content.columns.source'),
    sortable: true,
    cell: (r) => r.source ?? <span className="text-muted">—</span>,
    exportValue: (r) => r.source ?? '',
  },
  {
    key: 'as_of',
    header: t('content.columns.asOf'),
    sortable: true,
    sortDescFirst: true,
    cell: (r) => <DateCell value={r.as_of} display="datetime" />,
    exportValue: (r) => r.as_of,
  },
];

const FX_FILTERS = { q: filterParam.text() };

function FxSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useAppTranslation();
  const table = useTableState({ filters: FX_FILTERS, defaultSort: 'quote_currency' });
  const fields = useMemo(() => fxFields(t), [t]);
  const columns = useMemo(() => fxColumns(t), [t]);
  return (
    <>
    <FxPendingPanel />
    <CrudSection<FxRateOut, FxRateIn>
      id="admin.content.fx"
      table={table}
      entityName={t('content.entities.fx')}
      entityPlural={t('content.entities.fxPlural')}
      queryKey={fxRatesQueryKey}
      endpoints={adminApi.fxRates}
      fields={fields}
      columns={columns}
      rowKey={(r) => r.quote_currency}
      rowId={(r) => r.id ?? r.quote_currency}
      rowLabel={(r) => r.quote_currency}
      canEdit={canEdit}
      searchText={(r) => `${r.quote_currency} ${r.source ?? ''}`}
      description={
        <>
          {t('content.fx.description')} {t('security.fx.dualControlNote')}
          {!canEdit && <span className="mt-1 block text-xs">{t('security.fx.financeOnlyNote')}</span>}
        </>
      }
    />
    </>
  );
}
