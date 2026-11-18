import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Route, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import {
  financeApi,
  isMakerChecker,
  type PayeeType,
  type PayoutAccountListParams,
  type PayoutAccountOut,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, formatDate, useDocumentTitle, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  Badge,
  Button,
  DataTable,
  DateCell,
  ExportButton,
  FilterBar,
  PageHeader,
  QuickFilters,
  SelectFilter,
  TextCell,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatDateTime } from '../lib/shared';
import { enumLabel, ft, useFinanceTranslation, type FinanceT } from '../lib/i18n';
import { financeKeys, useVerifyPayoutAccount } from '../api/queries';
import { Mono, notifyError, notifySuccess } from '../components/finance';
import { payeeTypeOptions, PayeeFilter, parsePayee } from '../components/settlements';
import { useStaffName } from '../components/reviews';
import { useFinancePermissions } from '../lib/permissions';
import { Button as DialogButton, Callout, DescriptionList, Modal } from '../components/ui';

// ---------------------------------------------------------------------------------------------------------
// URL state. `verified=false|true` (dashboard "Payout accounts to verify" card, older links) lands on the
// "Awaiting verification" / "Verified" tab.
// ---------------------------------------------------------------------------------------------------------
const PAYEE_TYPES_FILTER = ['hospital', 'agent', 'vendor'] as const satisfies readonly PayeeType[];
const VERIFICATION = ['unverified', 'verified', 'disabled'] as const;
type Verification = (typeof VERIFICATION)[number];

const FILTERS = {
  q: filterParam.text(),
  verification: filterParam.oneOf(VERIFICATION),
  owner_type: filterParam.oneOf(PAYEE_TYPES_FILTER),
  owner: filterParam.text(),
  route: filterParam.oneOf(['razorpay_route', 'manual'] as const),
  verified: filterParam.boolean(),
};
const SORT_KEYS = ['created_at', 'account_holder_name'] as const;

type AccountFilters = FilterValues<typeof FILTERS>;
type ApiFilters = Omit<PayoutAccountListParams, 'page' | 'page_size' | 'sort'>;

/** The verification tab, honouring the legacy boolean `verified` param. */
function effectiveVerification(f: AccountFilters): Verification | '' {
  if (f.verification) return f.verification;
  return f.verified === false ? 'unverified' : f.verified === true ? 'verified' : '';
}

function toApiFilters(f: AccountFilters): { list: ApiFilters; counts: ApiFilters } {
  const owner = parsePayee(f.owner);
  const base: ApiFilters = {
    q: f.q.trim() || undefined,
    owner_type: owner?.type ?? (f.owner_type || undefined),
    owner_id: owner?.id,
    route: f.route || undefined,
  };
  const verification = effectiveVerification(f);
  const state: ApiFilters =
    verification === 'unverified'
      ? { status: 'active', is_verified: false }
      : verification === 'verified'
        ? { status: 'active', is_verified: true }
        : verification === 'disabled'
          ? { status: 'disabled' }
          : {};
  return { list: { ...base, ...state }, counts: base };
}

const routeOptions = (t: FinanceT) => [
  { value: 'razorpay_route' as const, label: t('payoutAccounts.routeAutomatic') },
  { value: 'manual' as const, label: enumLabel('payoutMethod', 'manual_bank_transfer') },
];

const verificationLabel = (t: FinanceT, a: PayoutAccountOut) =>
  a.status !== 'active' ? enumLabel('status', 'disabled') : a.is_verified ? t('payoutAccounts.verified') : t('payoutAccounts.awaitingVerification');

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function baseColumns(t: FinanceT): DataTableColumn<PayoutAccountOut>[] {
  return [
    {
      key: 'owner',
      header: t('ledgerAccounts.columns.owner'),
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (a) => (
        <TextCell primary={<span className="font-medium">{a.owner_name ?? `${a.owner_id.slice(0, 8)}…`}</span>} secondary={enumLabel('payeeType', a.owner_type)} />
      ),
      exportValue: (a) => a.owner_name ?? a.owner_id,
    },
    {
      key: 'account',
      header: t('ledger.entries.account'),
      sortable: true,
      sortKey: 'account_holder_name',
      mobile: 'secondary',
      className: 'max-w-60',
      cell: (a) => <TextCell primary={a.account_holder_name} secondary={<span className="font-mono">{a.account_number_masked}</span>} />,
      exportValue: (a) => `${a.account_holder_name} ${a.account_number_masked}`,
    },
    {
      key: 'bank',
      header: t('overview.stats.bank'),
      className: 'max-w-56',
      cell: (a) => (
        <TextCell
          primary={a.bank_name ?? <span className="text-muted">—</span>}
          secondary={[a.ifsc ? `IFSC ${a.ifsc}` : null, a.swift ? `SWIFT ${a.swift}` : null].filter(Boolean).join(' · ') || undefined}
        />
      ),
      exportValue: (a) => [a.bank_name, a.ifsc, a.swift].filter(Boolean).join(' '),
    },
    {
      key: 'route',
      header: t('payoutAccounts.payoutRoute'),
      cell: (a) =>
        a.razorpay_linked_account_id ? (
          <Badge tone="accent">{enumLabel('payoutMethod', 'razorpay_route')}</Badge>
        ) : (
          <Badge tone="neutral">{t('payoutAccounts.manualTransfer')}</Badge>
        ),
      exportValue: (a) => (a.razorpay_linked_account_id ? enumLabel('payoutMethod', 'razorpay_route') : t('payoutAccounts.manualTransfer')),
    },
    {
      key: 'status',
      header: t('orders.columns.status'),
      mobile: 'badge',
      cell: (a) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={a.status !== 'active' ? 'neutral' : a.is_verified ? 'success' : 'warning'} dot>
            {verificationLabel(t, a)}
          </Badge>
          {a.is_primary && <Badge tone="info">{t('payoutAccounts.primary')}</Badge>}
        </span>
      ),
      exportValue: (a) => verificationLabel(t, a),
    },
    {
      key: 'created',
      header: t('payoutAccounts.added'),
      defaultHidden: true,
      sortable: true,
      sortKey: 'created_at',
      sortDescFirst: true,
      cell: (a) => <DateCell value={a.created_at} display="relative" className="text-muted" />,
      mobileCell: (a) => formatDate(a.created_at),
      exportValue: (a) => a.created_at,
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function PayoutAccountsPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('nav.items.payoutAccounts'));
  const perms = useFinancePermissions();
  const table = useTableState({ filters: FILTERS, sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const api = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: PayoutAccountListParams = { ...api.list, sort: table.sortParam, page: table.page, page_size: table.pageSize };

  const list = useQuery({
    queryKey: [...financeKeys.payoutAccounts(listParams), 'table'],
    queryFn: () => financeApi.listPayoutAccountsPage(listParams),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'payout-accounts', 'verification-counts', api.counts],
    queryFn: () => financeApi.payoutAccountVerificationCounts(api.counts),
    placeholderData: keepPreviousData,
  });

  const verify = useVerifyPayoutAccount();
  const [verifying, setVerifying] = useState<PayoutAccountOut | null>(null);
  const [blocked, setBlocked] = useState(false);
  const nameOf = useStaffName();
  const isSubmitter = (a: PayoutAccountOut) => Boolean(perms.userId && a.submitted_by && a.submitted_by === perms.userId);
  const closeVerify = () => {
    setVerifying(null);
    setBlocked(false);
  };

  const exportColumns = useMemo(() => baseColumns(t), [t]);
  const columns: DataTableColumn<PayoutAccountOut>[] = [
    ...exportColumns,
    {
      key: 'actions',
      header: <span className="sr-only">{t('orderDetail.actions')}</span>,
      title: t('orderDetail.actions'),
      align: 'end',
      hideable: false,
      exportable: false,
      mobile: 'secondary',
      cell: (a) =>
        perms.finance && !a.is_verified && a.status === 'active' ? (
          <span className="flex flex-col items-end gap-0.5">
            <Button size="xs" onClick={() => setVerifying(a)} leftIcon={<ShieldCheck className="size-3.5" aria-hidden />}>
              {t('payoutAccounts.verify')}
            </Button>
            {isSubmitter(a) && <span className="text-xs text-warning-ink">{t('payoutAccounts.youSubmitted')}</span>}
          </span>
        ) : null,
    },
  ];

  const c = counts.data;
  const quickItems: QuickFilterItem<Verification>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    { value: 'unverified', label: t('payoutAccounts.awaitingVerification'), count: c?.counts.unverified, tone: 'warning' },
    { value: 'verified', label: t('payoutAccounts.verified'), count: c?.counts.verified, tone: 'success' },
    { value: 'disabled', label: enumLabel('status', 'disabled'), count: c?.counts.disabled },
  ];
  const quickValue = effectiveVerification(filters);

  return (
    <div>
      <PageHeader title={t('nav.items.payoutAccounts')} description={t('payoutAccounts.description')} />
      <DataTable
        id="admin.finance.payout-accounts"
        caption={t('nav.items.payoutAccounts')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle={t('payoutAccounts.emptyTitle')}
        emptyDescription={t('payoutAccounts.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label={t('payoutAccounts.verification')}
              items={quickItems}
              value={quickValue}
              onChange={(v) => setFilters({ verification: v, verified: undefined })}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('payoutAccounts.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="payout-accounts"
                columns={exportColumns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listPayoutAccountsPage({ ...api.list, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <SelectFilter
              label={t('payoutAccounts.ownerType')}
              icon={<Users className="size-3.5 opacity-70" aria-hidden />}
              value={filters.owner_type}
              onChange={(v) => setFilters({ owner_type: v, owner: '' })}
              options={payeeTypeOptions()}
            />
            <PayeeFilter label={t('ledgerAccounts.columns.owner')} value={filters.owner} onChange={(v) => setFilter('owner', v)} payeeType={filters.owner_type} />
            <SelectFilter
              label={t('payoutAccounts.payoutRoute')}
              icon={<Route className="size-3.5 opacity-70" aria-hidden />}
              value={filters.route}
              onChange={(v) => setFilter('route', v)}
              options={routeOptions(t)}
            />
          </FilterBar>
        }
      />

      <Modal
        open={verifying !== null}
        onClose={closeVerify}
        title={t('payoutAccounts.verifyTitle')}
        description={t('payoutAccounts.verifyDescription')}
        footer={
          <>
            <DialogButton variant="secondary" onClick={closeVerify} disabled={verify.isPending}>
              {t('common.cancel')}
            </DialogButton>
            <DialogButton
              loading={verify.isPending}
              disabled={blocked || (verifying ? isSubmitter(verifying) : false)}
              title={verifying && isSubmitter(verifying) ? t('payoutAccounts.submitterTitle') : undefined}
              icon={<BadgeCheck className="size-4" aria-hidden />}
              onClick={() =>
                verifying &&
                verify.mutate(verifying.id, {
                  onSuccess: () => {
                    notifySuccess(ft('payoutAccounts.verifiedToast'));
                    closeVerify();
                  },
                  onError: (e) => {
                    if (isMakerChecker(e)) {
                      setBlocked(true);
                      return;
                    }
                    notifyError(e, ft('payoutAccounts.verifyFailed'));
                  },
                })
              }
            >
              {t('payoutAccounts.markVerified')}
            </DialogButton>
          </>
        }
      >
        {verifying && (blocked || isSubmitter(verifying)) && (
          <div className="mb-3">
            <Callout tone="warning" title={t('payoutAccounts.makerCheckerTitle')}>
              <span className="inline-flex items-start gap-1.5">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{t('payoutAccounts.makerCheckerBody', { name: nameOf(verifying.submitted_by) })}</span>
              </span>
            </Callout>
          </div>
        )}
        {verifying && (
          <DescriptionList
            items={[
              {
                label: t('ledgerAccounts.columns.owner'),
                value: `${verifying.owner_name ?? verifying.owner_id} (${enumLabel('payeeType', verifying.owner_type)})`,
              },
              { label: t('payoutAccounts.accountHolder'), value: verifying.account_holder_name },
              { label: t('payoutAccounts.accountNumber'), value: <Mono>{verifying.account_number_masked}</Mono> },
              { label: 'IFSC', value: <Mono>{verifying.ifsc ?? '—'}</Mono> },
              { label: t('overview.stats.bank'), value: verifying.bank_name ?? '—' },
              { label: 'SWIFT', value: <Mono>{verifying.swift ?? '—'}</Mono> },
              { label: t('payoutAccounts.added'), value: formatDateTime(verifying.created_at) },
              { label: t('payoutAccounts.submittedBy'), value: nameOf(verifying.submitted_by) },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
