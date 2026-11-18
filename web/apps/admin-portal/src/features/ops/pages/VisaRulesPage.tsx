/**
 * Visa help (travel module): per-nationality rules (e-visa / regular visa / no visa, attendants, processing time,
 * official link) and the document checklist for each route (optionally specific to one nationality). The patient
 * apps show this guide; the hospital invitation letter uses it. "Load defaults" inserts the built-in rules and
 * checklist items that are missing (edited rows are kept). List: staff; writes: admin | super_admin.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { DatabaseZap, Globe2, Route } from 'lucide-react';
import type { CrudEndpoints } from '@hig/shared/api';
import { filterParam, formatNumber, useTableState } from '@hig/shared/lib';
import { Badge, Button as UiButton, PageHeader, SelectFilter, TextCell, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { ConfirmDialog, Tabs } from '../ui';
import { CrudSection, type FieldDef } from '../components/CrudSection';
import { checklistEntityId } from '../components/ContentTranslations';
import { countryName } from '../lib/lookups';
import { useDocumentTitle } from '../lib/format';
import { useOpsMutation } from '../lib/mutations';
import { useOpsPermissions } from '../lib/session';
import {
  phase1AdminApi,
  phase1Keys,
  VISA_ROUTES,
  type VisaChecklistItemIn,
  type VisaChecklistItemOut,
  type VisaCountryRuleIn,
  type VisaCountryRuleOut,
  type VisaRoute,
} from '../lib/phase1Api';

const TABS = ['rules', 'checklist'] as const;
type TabKey = (typeof TABS)[number];

const ROUTE_TONES: Record<VisaRoute, 'info' | 'warning' | 'success'> = {
  e_visa: 'info',
  regular_visa: 'warning',
  not_required: 'success',
};

const routeLabel = (t: TFunction, route: VisaRoute) => t(`visaRules.routes.${route}`);
const routeOptions = (t: TFunction) => VISA_ROUTES.map((r) => ({ value: r, label: routeLabel(t, r) }));

function RouteBadge({ route }: { route: VisaRoute }) {
  const { t } = useAppTranslation();
  return <Badge tone={ROUTE_TONES[route] ?? 'neutral'}>{routeLabel(t, route)}</Badge>;
}

const rulesEndpoints: CrudEndpoints<VisaCountryRuleOut, VisaCountryRuleIn> = {
  list: () => phase1AdminApi.listVisaRules(),
  get: async (id) => {
    const rows = await phase1AdminApi.listVisaRules({ q: id });
    const row = rows.find((r) => r.nationality === id);
    if (!row) throw new Error(id);
    return row;
  },
  create: (body) => phase1AdminApi.createVisaRule(body),
  update: (nationality, body) => phase1AdminApi.updateVisaRule(nationality, body),
  delete: async (nationality) => {
    await phase1AdminApi.deleteVisaRule(nationality);
  },
};

const checklistEndpoints: CrudEndpoints<VisaChecklistItemOut, VisaChecklistItemIn> = {
  list: () => phase1AdminApi.listChecklistItems(),
  get: async (id) => {
    const row = (await phase1AdminApi.listChecklistItems()).find((r) => r.id === id);
    if (!row) throw new Error(id);
    return row;
  },
  create: (body) => phase1AdminApi.createChecklistItem(body),
  update: (id, body) => phase1AdminApi.updateChecklistItem(id, body),
  delete: async (id) => {
    await phase1AdminApi.deleteChecklistItem(id);
  },
};

export default function VisaRulesPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('visaRules.title'));
  const perms = useOpsPermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(raw) ? (raw as TabKey) : 'rules';
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const loadDefaults = useOpsMutation({
    mutationFn: () => phase1AdminApi.loadVisaDefaults(),
    success: (r) =>
      t('visaRules.defaults.loaded', {
        rules: formatNumber(r.rules_added),
        items: formatNumber(r.checklist_items_added),
      }),
    invalidate: [phase1Keys.visaRules, phase1Keys.visaChecklist],
    onSuccess: () => setConfirmDefaults(false),
  });

  return (
    <div>
      <PageHeader
        title={t('visaRules.title')}
        description={t('visaRules.description')}
        actions={
          perms.editCatalog ? (
            <UiButton variant="outline" size="sm" leftIcon={<DatabaseZap className="size-4" aria-hidden />} onClick={() => setConfirmDefaults(true)}>
              {t('visaRules.defaults.button')}
            </UiButton>
          ) : undefined
        }
      />
      <Tabs
        tabs={[
          { key: 'rules', label: t('visaRules.tabs.rules') },
          { key: 'checklist', label: t('visaRules.tabs.checklist') },
        ]}
        value={tab}
        onChange={(k) => setParams(k === 'rules' ? {} : { tab: k }, { replace: true })}
      />
      {tab === 'rules' && <RulesSection canEdit={perms.editCatalog} />}
      {tab === 'checklist' && <ChecklistSection canEdit={perms.editCatalog} />}
      <ConfirmDialog
        open={confirmDefaults}
        title={t('visaRules.defaults.title')}
        message={t('visaRules.defaults.message')}
        confirmLabel={t('visaRules.defaults.confirm')}
        loading={loadDefaults.isPending}
        onClose={() => setConfirmDefaults(false)}
        onConfirm={() => loadDefaults.mutate()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
const RULE_FILTERS = { q: filterParam.text(), route: filterParam.text() };

function RulesSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useAppTranslation();
  const table = useTableState({ filters: RULE_FILTERS, defaultSort: 'country' });
  const { filters, setFilter } = table;
  const fields = useMemo<FieldDef<VisaCountryRuleOut>[]>(
    () => [
      {
        name: 'nationality',
        label: t('visaRules.fields.nationality'),
        kind: 'text',
        required: true,
        maxLength: 2,
        uppercase: true,
        createOnly: true,
        hint: t('visaRules.fields.nationalityHint'),
      },
      { name: 'country_name', label: t('visaRules.fields.countryName'), kind: 'text', maxLength: 100, hint: t('visaRules.fields.countryNameHint') },
      { name: 'visa_route', label: t('visaRules.fields.route'), kind: 'select', required: true, options: routeOptions(t), defaultValue: 'e_visa' },
      { name: 'max_attendants', label: t('visaRules.fields.maxAttendants'), kind: 'int', min: 0, max: 10, defaultValue: '2', required: true },
      { name: 'typical_processing_days', label: t('visaRules.fields.processingDays'), kind: 'int', min: 0, max: 365 },
      { name: 'official_url', label: t('visaRules.fields.officialUrl'), kind: 'url', maxLength: 1024, wide: true },
      { name: 'notes', label: t('visaRules.fields.notes'), kind: 'textarea', maxLength: 5000, hint: t('visaRules.fields.notesHint') },
      { name: 'source', label: t('visaRules.fields.source'), kind: 'textarea', maxLength: 5000, hint: t('visaRules.fields.sourceHint') },
    ],
    [t],
  );
  const nameOf = (r: VisaCountryRuleOut) => r.country_name || countryName(r.nationality);
  const columns: DataTableColumn<VisaCountryRuleOut>[] = [
    {
      key: 'country',
      header: t('visaRules.columns.country'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      sortValue: nameOf,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <Badge tone="neutral">{r.nationality}</Badge>
          <span className="font-medium">{nameOf(r)}</span>
        </span>
      ),
      mobileCell: nameOf,
      exportValue: (r) => `${r.nationality} ${nameOf(r)}`,
    },
    {
      key: 'route',
      header: t('visaRules.columns.route'),
      sortable: true,
      mobile: 'badge',
      sortValue: (r) => r.visa_route,
      cell: (r) => <RouteBadge route={r.visa_route} />,
      exportValue: (r) => r.visa_route,
    },
    {
      key: 'attendants',
      header: t('visaRules.columns.attendants'),
      align: 'end',
      sortable: true,
      sortValue: (r) => r.max_attendants,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.max_attendants)}</span>,
      exportValue: (r) => r.max_attendants,
    },
    {
      key: 'processing',
      header: t('visaRules.columns.processing'),
      align: 'end',
      sortable: true,
      sortValue: (r) => r.typical_processing_days ?? -1,
      cell: (r) =>
        r.typical_processing_days != null ? (
          t('visaRules.days', { count: r.typical_processing_days })
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (r) => r.typical_processing_days ?? '',
    },
    {
      key: 'official',
      header: t('visaRules.columns.official'),
      hideOnMobile: true,
      className: 'max-w-56',
      cell: (r) =>
        r.official_url ? (
          <a href={r.official_url} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-primary-ink hover:underline" dir="ltr" onClick={(e) => e.stopPropagation()}>
            {r.official_url.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-xs text-warning-ink">{t('visaRules.noOfficialLink')}</span>
        ),
      exportValue: (r) => r.official_url ?? '',
    },
    {
      key: 'notes',
      header: t('visaRules.columns.notes'),
      hideOnMobile: true,
      className: 'max-w-64',
      cell: (r) => <TextCell primary={<span className="line-clamp-2 text-xs text-muted">{r.notes ?? '—'}</span>} />,
      exportValue: (r) => r.notes ?? '',
    },
  ];
  return (
    <CrudSection<VisaCountryRuleOut, VisaCountryRuleIn>
      id="admin.visa.rules"
      table={table}
      entityName={t('visaRules.entities.rule')}
      entityPlural={t('visaRules.entities.rules')}
      queryKey={phase1Keys.visaRules}
      endpoints={rulesEndpoints}
      fields={fields}
      columns={columns}
      rowKey={(r) => r.nationality}
      rowLabel={(r) => `${r.nationality} ${nameOf(r)}`}
      canEdit={canEdit}
      translations={{ entityType: 'visa_rule' }}
      searchText={(r) => `${r.nationality} ${nameOf(r)} ${r.country_name ?? ''}`}
      filterRow={(r) => !filters.route || r.visa_route === filters.route}
      description={t('visaRules.rulesDescription')}
      filters={
        <SelectFilter
          label={t('visaRules.filters.route')}
          icon={<Route className="size-3.5 opacity-70" aria-hidden />}
          value={filters.route}
          onChange={(v) => setFilter('route', v)}
          options={routeOptions(t)}
        />
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------------
const CHECKLIST_FILTERS = { q: filterParam.text(), route: filterParam.text(), nationality: filterParam.text() };
const ALL = '*';

function ChecklistSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useAppTranslation();
  const table = useTableState({ filters: CHECKLIST_FILTERS, defaultSort: 'order' });
  const { filters, setFilter } = table;
  const fields = useMemo<FieldDef<VisaChecklistItemOut>[]>(
    () => [
      { name: 'visa_route', label: t('visaRules.fields.route'), kind: 'select', required: true, options: routeOptions(t), defaultValue: 'e_visa', createOnly: true },
      {
        name: 'nationality',
        label: t('visaRules.fields.onlyNationality'),
        kind: 'text',
        maxLength: 2,
        uppercase: true,
        createOnly: true,
        hint: t('visaRules.fields.onlyNationalityHint'),
      },
      {
        name: 'item_key',
        label: t('visaRules.fields.itemKey'),
        kind: 'text',
        required: true,
        maxLength: 60,
        createOnly: true,
        hint: t('visaRules.fields.itemKeyHint'),
      },
      { name: 'title', label: t('visaRules.fields.title'), kind: 'text', required: true, maxLength: 200, wide: true },
      { name: 'description', label: t('visaRules.fields.description'), kind: 'textarea', maxLength: 5000 },
      { name: 'sort_order', label: t('visaRules.fields.sortOrder'), kind: 'int', min: 0, max: 10000, defaultValue: '0' },
      { name: 'required', label: t('visaRules.fields.required'), kind: 'bool', defaultValue: true },
    ],
    [t],
  );
  const scopeOf = (r: VisaChecklistItemOut) => (r.nationality ? `${r.nationality} · ${countryName(r.nationality)}` : t('visaRules.allNationalities'));
  const columns: DataTableColumn<VisaChecklistItemOut>[] = [
    {
      key: 'title',
      header: t('visaRules.columns.item'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-xl',
      sortValue: (r) => r.title,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{r.title}</span>
          {r.description && <span className="line-clamp-2 text-xs text-muted">{r.description}</span>}
          <span className="font-mono text-[11px] text-muted">{r.item_key}</span>
        </span>
      ),
      mobileCell: (r) => r.title,
      exportValue: (r) => r.title,
    },
    {
      key: 'route',
      header: t('visaRules.columns.route'),
      sortable: true,
      mobile: 'badge',
      sortValue: (r) => r.visa_route,
      cell: (r) => <RouteBadge route={r.visa_route} />,
      exportValue: (r) => r.visa_route,
    },
    {
      key: 'scope',
      header: t('visaRules.columns.appliesTo'),
      sortable: true,
      mobile: 'secondary',
      sortValue: (r) => r.nationality ?? '',
      cell: (r) => <span className="text-sm">{scopeOf(r)}</span>,
      exportValue: (r) => r.nationality ?? '',
    },
    {
      key: 'required',
      header: t('visaRules.columns.required'),
      sortable: true,
      sortValue: (r) => (r.required ? 1 : 0),
      cell: (r) => (r.required ? <Badge tone="warning">{t('visaRules.required')}</Badge> : <Badge tone="neutral">{t('visaRules.optional')}</Badge>),
      exportValue: (r) => (r.required ? 'required' : 'optional'),
    },
    {
      key: 'order',
      header: t('visaRules.columns.order'),
      align: 'end',
      sortable: true,
      sortValue: (r) => `${r.visa_route}-${String(r.sort_order).padStart(6, '0')}`,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.sort_order)}</span>,
      exportValue: (r) => r.sort_order,
    },
  ];
  // same cache entry as the CrudSection list
  const items = useQuery({ queryKey: [...phase1Keys.visaChecklist, {}], queryFn: () => checklistEndpoints.list() });
  const nationalityOptions = [
    { value: ALL, label: t('visaRules.allNationalities') },
    ...[...new Set((items.data ?? []).map((r) => r.nationality).filter((n): n is string => !!n))]
      .sort()
      .map((n) => ({ value: n, label: countryName(n), description: n })),
  ];
  return (
    <CrudSection<VisaChecklistItemOut, VisaChecklistItemIn>
      id="admin.visa.checklist"
      table={table}
      entityName={t('visaRules.entities.item')}
      entityPlural={t('visaRules.entities.items')}
      queryKey={phase1Keys.visaChecklist}
      endpoints={checklistEndpoints}
      fields={fields}
      columns={columns}
      rowKey={(r) => r.id}
      rowLabel={(r) => r.title}
      canEdit={canEdit}
      translations={{ entityType: 'visa_checklist', entityId: (r) => checklistEntityId(r.visa_route, r.nationality, r.item_key) }}
      searchText={(r) => `${r.title} ${r.item_key} ${r.nationality ?? ''} ${r.description ?? ''}`}
      filterRow={(r) =>
        (!filters.route || r.visa_route === filters.route) &&
        (!filters.nationality || (filters.nationality === ALL ? !r.nationality : r.nationality === filters.nationality))
      }
      description={t('visaRules.checklistDescription')}
      filters={
        <>
          <SelectFilter
            label={t('visaRules.filters.route')}
            icon={<Route className="size-3.5 opacity-70" aria-hidden />}
            value={filters.route}
            onChange={(v) => setFilter('route', v)}
            options={routeOptions(t)}
          />
          <SelectFilter
            label={t('visaRules.filters.appliesTo')}
            icon={<Globe2 className="size-3.5 opacity-70" aria-hidden />}
            value={filters.nationality}
            onChange={(v) => setFilter('nationality', v)}
            options={nationalityOptions}
          />
        </>
      }
    />
  );
}
