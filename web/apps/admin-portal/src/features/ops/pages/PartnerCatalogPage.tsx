/**
 * Insurance products (/insurance/products) and pay-later partners (/financing/partners): the catalog the patient
 * apps list. Heal India Global never sells insurance or lends money - it lists partners and passes leads on with
 * the patient's consent. List: any staff; create / edit / delete: admin | super_admin.
 */
import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { CircleCheck, ShieldCheck, Tags } from 'lucide-react';
import type { CrudEndpoints } from '@hig/shared/api';
import { filterParam, formatMoneyRange, formatNumber, useTableState } from '@hig/shared/lib';
import { Badge, PageHeader, SelectFilter, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { CrudSection, type FieldDef } from '../components/CrudSection';
import { Banner } from '../ui/detail';
import { countryName } from '../lib/lookups';
import { useDocumentTitle } from '../lib/format';
import { useOpsPermissions } from '../lib/session';
import { INSURANCE_CATEGORIES, partnerKeys, partnersApi, type OfferingIn, type OfferingOut, type PartnerKind } from '../lib/partnersApi';

/** Disclaimer shown at the top of every insurance / pay-later staff page. */
export function PartnerDisclaimer() {
  const { t } = useAppTranslation();
  return (
    <div className="mb-5">
      <Banner tone="info" icon={<ShieldCheck className="size-4" aria-hidden />} title={t('insurance.common.disclaimer')} />
    </div>
  );
}

const categoryLabel = (t: TFunction, category: string | null) =>
  !category ? '—' : (INSURANCE_CATEGORIES as readonly string[]).includes(category) ? t(`insurance.common.categories.${category}`) : category;

function endpointsFor(kind: PartnerKind): CrudEndpoints<OfferingOut, OfferingIn> {
  return {
    list: () => partnersApi.listOfferings(kind),
    get: async (id) => {
      const row = (await partnersApi.listOfferings(kind)).find((r) => r.id === id);
      if (!row) throw new Error(id);
      return row;
    },
    create: (body) => partnersApi.createOffering(kind, body),
    update: (id, body) => partnersApi.updateOffering(kind, id, body),
    delete: async (id) => {
      await partnersApi.deleteOffering(kind, id);
    },
  };
}

const FILTERS = { q: filterParam.text(), active: filterParam.text(), category: filterParam.text() };
const ISO2_LIST = /^\s*[A-Za-z]{2}(\s*,\s*[A-Za-z]{2})*\s*,?\s*$/;

function PartnerCatalog({ kind }: { kind: PartnerKind }) {
  const { t } = useAppTranslation();
  const ns = kind === 'insurance' ? 'insurance.products' : 'financing.partners';
  useDocumentTitle(t(`${ns}.title`));
  const perms = useOpsPermissions();
  const table = useTableState({ filters: FILTERS, defaultSort: 'sort' });
  const { filters, setFilter } = table;
  const endpoints = useMemo(() => endpointsFor(kind), [kind]);
  const isInsurance = kind === 'insurance';

  const fields = useMemo<FieldDef<OfferingOut>[]>(
    () => [
      { name: 'provider_name', label: t('insurance.common.fields.provider'), kind: 'text', required: true, maxLength: 200 },
      { name: 'product_name', label: t('insurance.common.fields.product'), kind: 'text', required: true, maxLength: 200 },
      ...(isInsurance
        ? [
            {
              name: 'category',
              label: t('insurance.common.fields.category'),
              kind: 'select',
              options: INSURANCE_CATEGORIES.map((c) => ({ value: c, label: t(`insurance.common.categories.${c}`) })),
              defaultValue: 'medical_travel',
            } satisfies FieldDef<OfferingOut>,
          ]
        : []),
      {
        name: 'summary',
        label: t('insurance.common.fields.summary'),
        kind: 'textarea',
        maxLength: 4000,
        emptyValue: '',
        hint: t('insurance.common.fields.summaryHint'),
      },
      {
        name: 'countries',
        label: t('insurance.common.fields.countries'),
        kind: 'list',
        uppercase: true,
        wide: true,
        hint: t('insurance.common.fields.countriesHint'),
        validate: (text) => (ISO2_LIST.test(text) ? null : t('insurance.common.errors.countries')),
      },
      { name: 'price_min_minor', label: t('insurance.common.fields.priceMin'), kind: 'money', currencyField: 'currency' },
      { name: 'price_max_minor', label: t('insurance.common.fields.priceMax'), kind: 'money', currencyField: 'currency' },
      // currency of the price range: rendered inside the money inputs above, sent as its own field
      { name: 'currency', label: t('insurance.common.fields.currency'), kind: 'select', options: [] },
      { name: 'price_note', label: t('insurance.common.fields.priceNote'), kind: 'text', maxLength: 200, wide: true, hint: t('insurance.common.fields.priceNoteHint') },
      {
        name: 'website_url',
        label: t('insurance.common.fields.website'),
        kind: 'url',
        maxLength: 1024,
        wide: true,
        hint: t('insurance.common.fields.websiteHint'),
        validate: (text) => (/^https:\/\/\S+$/i.test(text) ? null : t('insurance.common.errors.httpsOnly')),
      },
      { name: 'contact_email', label: t('insurance.common.fields.email'), kind: 'email', maxLength: 254 },
      { name: 'contact_phone', label: t('insurance.common.fields.phone'), kind: 'text', maxLength: 32 },
      { name: 'sort', label: t('insurance.common.fields.sort'), kind: 'int', min: -1000, max: 1000, defaultValue: '0', hint: t('insurance.common.fields.sortHint') },
      { name: 'is_active', label: t('insurance.common.fields.active'), kind: 'bool', defaultValue: true },
    ],
    [t, isInsurance],
  );

  const countriesText = (r: OfferingOut) =>
    r.countries.length === 0 ? t('insurance.common.allCountries') : r.countries.map((c) => countryName(c)).join(', ');

  const columns: DataTableColumn<OfferingOut>[] = [
    {
      key: 'name',
      header: t('insurance.common.columns.product'),
      sortable: true,
      sticky: true,
      mobile: 'primary',
      className: 'max-w-md',
      sortValue: (r) => `${r.provider_name} ${r.product_name}`,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{r.product_name}</span>
          <span className="block truncate text-xs text-muted">{r.provider_name}</span>
          {r.summary && <span className="line-clamp-2 text-xs text-muted">{r.summary}</span>}
        </span>
      ),
      mobileCell: (r) => `${r.product_name} · ${r.provider_name}`,
      exportValue: (r) => `${r.provider_name} - ${r.product_name}`,
    },
    ...(isInsurance
      ? [
          {
            key: 'category',
            header: t('insurance.common.columns.category'),
            sortable: true,
            sortValue: (r: OfferingOut) => r.category ?? '',
            cell: (r: OfferingOut) => (r.category ? <Badge tone="info">{categoryLabel(t, r.category)}</Badge> : <span className="text-muted">—</span>),
            exportValue: (r: OfferingOut) => r.category ?? '',
          } satisfies DataTableColumn<OfferingOut>,
        ]
      : []),
    {
      key: 'countries',
      header: t('insurance.common.columns.countries'),
      hideOnMobile: true,
      className: 'max-w-64',
      cell: (r) =>
        r.countries.length === 0 ? (
          <span className="text-sm text-muted">{t('insurance.common.allCountries')}</span>
        ) : (
          <span className="flex flex-wrap gap-1" title={countriesText(r)}>
            {r.countries.slice(0, 6).map((c) => (
              <Badge key={c} tone="neutral">
                {c}
              </Badge>
            ))}
            {r.countries.length > 6 && <span className="text-xs text-muted">{t('insurance.common.moreCountries', { count: r.countries.length - 6 })}</span>}
          </span>
        ),
      exportValue: (r) => r.countries.join(' '),
    },
    {
      key: 'price',
      header: t('insurance.common.columns.price'),
      hideOnMobile: true,
      cell: (r) => (
        <span className="block">
          <span className="tabular-nums">{formatMoneyRange(r.price_min_minor, r.price_max_minor, r.currency)}</span>
          {r.price_note && <span className="block text-xs text-muted">{r.price_note}</span>}
        </span>
      ),
      exportValue: (r) => formatMoneyRange(r.price_min_minor, r.price_max_minor, r.currency),
    },
    {
      key: 'website',
      header: t('insurance.common.columns.website'),
      hideOnMobile: true,
      className: 'max-w-56',
      cell: (r) =>
        r.website_url ? (
          <a
            href={r.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-primary-ink hover:underline"
            dir="ltr"
            onClick={(e) => e.stopPropagation()}
          >
            {r.website_url.replace(/^https:\/\//, '')}
          </a>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (r) => r.website_url ?? '',
    },
    {
      key: 'active',
      header: t('insurance.common.columns.status'),
      sortable: true,
      mobile: 'badge',
      sortValue: (r) => (r.is_active ? 0 : 1),
      cell: (r) =>
        r.is_active ? (
          <Badge tone="success" dot>
            {t('insurance.common.active')}
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            {t('insurance.common.inactive')}
          </Badge>
        ),
      exportValue: (r) => (r.is_active ? 'active' : 'inactive'),
    },
    {
      key: 'sort',
      header: t('insurance.common.columns.sort'),
      align: 'end',
      sortable: true,
      sortValue: (r) => r.sort,
      cell: (r) => <span className="tabular-nums">{formatNumber(r.sort)}</span>,
      exportValue: (r) => r.sort,
    },
  ];

  return (
    <div>
      <PageHeader title={t(`${ns}.title`)} description={t(`${ns}.description`)} />
      <PartnerDisclaimer />
      <CrudSection<OfferingOut, OfferingIn>
        id={isInsurance ? 'admin.insurance.products' : 'admin.financing.partners'}
        table={table}
        entityName={t(`${ns}.entity`)}
        entityPlural={t(`${ns}.entities`)}
        queryKey={partnerKeys.catalog(kind)}
        endpoints={endpoints}
        fields={fields}
        columns={columns}
        rowKey={(r) => r.id}
        rowLabel={(r) => `${r.provider_name} - ${r.product_name}`}
        canEdit={perms.editCatalog}
        searchText={(r) => `${r.provider_name} ${r.product_name} ${r.summary} ${r.countries.join(' ')}`}
        filterRow={(r) =>
          (!filters.active || (filters.active === 'active' ? r.is_active : !r.is_active)) &&
          (!filters.category || r.category === filters.category)
        }
        filters={
          <>
            <SelectFilter
              label={t('insurance.common.filters.status')}
              icon={<CircleCheck className="size-3.5 opacity-70" aria-hidden />}
              value={filters.active}
              onChange={(v) => setFilter('active', v)}
              options={[
                { value: 'active', label: t('insurance.common.active') },
                { value: 'inactive', label: t('insurance.common.inactive') },
              ]}
            />
            {isInsurance && (
              <SelectFilter
                label={t('insurance.common.filters.category')}
                icon={<Tags className="size-3.5 opacity-70" aria-hidden />}
                value={filters.category}
                onChange={(v) => setFilter('category', v)}
                options={INSURANCE_CATEGORIES.map((c) => ({ value: c, label: t(`insurance.common.categories.${c}`) }))}
              />
            )}
          </>
        }
      />
    </div>
  );
}

export function InsuranceProductsPage() {
  return <PartnerCatalog kind="insurance" />;
}

export function FinancingPartnersPage() {
  return <PartnerCatalog kind="pay_later" />;
}
