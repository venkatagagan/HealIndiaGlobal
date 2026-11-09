import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Route, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import {
  financeApi,
  isMakerChecker,
  PAYEE_TYPE_LABELS,
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
import { financeKeys, useVerifyPayoutAccount } from '../api/queries';
import { Mono, notifyError, notifySuccess } from '../components/finance';
import { PAYEE_TYPE_OPTIONS, PayeeFilter, parsePayee } from '../components/settlements';
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

const ROUTE_OPTIONS = [
  { value: 'razorpay_route' as const, label: 'Razorpay Route (automatic)' },
  { value: 'manual' as const, label: 'Manual bank transfer' },
];

// ---------------------------------------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------------------------------------
function baseColumns(): DataTableColumn<PayoutAccountOut>[] {
  return [
    {
      key: 'owner',
      header: 'Owner',
      sticky: true,
      mobile: 'primary',
      className: 'max-w-60',
      cell: (a) => (
        <TextCell primary={<span className="font-medium">{a.owner_name ?? `${a.owner_id.slice(0, 8)}…`}</span>} secondary={PAYEE_TYPE_LABELS[a.owner_type]} />
      ),
      exportValue: (a) => a.owner_name ?? a.owner_id,
    },
    {
      key: 'account',
      header: 'Account',
      sortable: true,
      sortKey: 'account_holder_name',
      mobile: 'secondary',
      className: 'max-w-60',
      cell: (a) => <TextCell primary={a.account_holder_name} secondary={<span className="font-mono">{a.account_number_masked}</span>} />,
      exportValue: (a) => `${a.account_holder_name} ${a.account_number_masked}`,
    },
    {
      key: 'bank',
      header: 'Bank',
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
      header: 'Payout route',
      cell: (a) => (a.razorpay_linked_account_id ? <Badge tone="accent">Razorpay Route</Badge> : <Badge tone="neutral">Manual transfer</Badge>),
      exportValue: (a) => (a.razorpay_linked_account_id ? 'Razorpay Route' : 'Manual transfer'),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'badge',
      cell: (a) => (
        <span className="flex flex-wrap gap-1">
          {a.status !== 'active' ? (
            <Badge tone="neutral" dot>
              Disabled
            </Badge>
          ) : a.is_verified ? (
            <Badge tone="success" dot>
              Verified
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Awaiting verification
            </Badge>
          )}
          {a.is_primary && <Badge tone="info">Primary</Badge>}
        </span>
      ),
      exportValue: (a) => (a.status !== 'active' ? 'Disabled' : a.is_verified ? 'Verified' : 'Awaiting verification'),
    },
    {
      key: 'created',
      header: 'Added',
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

const EXPORT_COLUMNS = baseColumns();

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------
export default function PayoutAccountsPage() {
  useDocumentTitle('Payout accounts');
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

  const columns: DataTableColumn<PayoutAccountOut>[] = [
    ...baseColumns(),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      title: 'Actions',
      align: 'end',
      hideable: false,
      exportable: false,
      mobile: 'secondary',
      cell: (a) =>
        perms.finance && !a.is_verified && a.status === 'active' ? (
          <span className="flex flex-col items-end gap-0.5">
            <Button size="xs" onClick={() => setVerifying(a)} leftIcon={<ShieldCheck className="size-3.5" aria-hidden />}>
              Verify
            </Button>
            {isSubmitter(a) && <span className="text-xs text-warning-ink">You submitted these details</span>}
          </span>
        ) : null,
    },
  ];

  const c = counts.data;
  const quickItems: QuickFilterItem<Verification>[] = [
    { value: '', label: 'All', count: c?.total },
    { value: 'unverified', label: 'Awaiting verification', count: c?.counts.unverified, tone: 'warning' },
    { value: 'verified', label: 'Verified', count: c?.counts.verified, tone: 'success' },
    { value: 'disabled', label: 'Disabled', count: c?.counts.disabled },
  ];
  const quickValue = effectiveVerification(filters);

  return (
    <div>
      <PageHeader
        title="Payout accounts"
        description="Bank accounts hospitals and agents registered for settlements (account numbers encrypted and masked). Verify each against the bank proof before it receives payouts."
      />
      <DataTable
        id="admin.finance.payout-accounts"
        caption="Payout accounts"
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No payout accounts yet"
        emptyDescription="Hospitals and agents add payout accounts from their portals."
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters
              label="Verification"
              items={quickItems}
              value={quickValue}
              onChange={(v) => setFilters({ verification: v, verified: undefined })}
            />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: 'Holder, bank, IFSC, last 4 digits or owner…' }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="payout-accounts"
                columns={EXPORT_COLUMNS}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) => financeApi.listPayoutAccountsPage({ ...api.list, sort: table.sortParam, page, page_size: size }))
                }
              />
            }
          >
            <SelectFilter
              label="Owner type"
              icon={<Users className="size-3.5 opacity-70" aria-hidden />}
              value={filters.owner_type}
              onChange={(v) => setFilters({ owner_type: v, owner: '' })}
              options={PAYEE_TYPE_OPTIONS}
            />
            <PayeeFilter label="Owner" value={filters.owner} onChange={(v) => setFilter('owner', v)} payeeType={filters.owner_type} />
            <SelectFilter
              label="Payout route"
              icon={<Route className="size-3.5 opacity-70" aria-hidden />}
              value={filters.route}
              onChange={(v) => setFilter('route', v)}
              options={ROUTE_OPTIONS}
            />
          </FilterBar>
        }
      />

      <Modal
        open={verifying !== null}
        onClose={closeVerify}
        title="Verify payout account"
        description="Confirm the account details match the owner's bank proof document."
        footer={
          <>
            <DialogButton variant="secondary" onClick={closeVerify} disabled={verify.isPending}>
              Cancel
            </DialogButton>
            <DialogButton
              loading={verify.isPending}
              disabled={blocked || (verifying ? isSubmitter(verifying) : false)}
              title={verifying && isSubmitter(verifying) ? 'You submitted these bank details; a different finance user must verify them' : undefined}
              icon={<BadgeCheck className="size-4" aria-hidden />}
              onClick={() =>
                verifying &&
                verify.mutate(verifying.id, {
                  onSuccess: () => {
                    notifySuccess('Payout account verified');
                    closeVerify();
                  },
                  onError: (e) => {
                    if (isMakerChecker(e)) {
                      setBlocked(true);
                      return;
                    }
                    notifyError(e, 'Could not verify the account');
                  },
                })
              }
            >
              Mark verified
            </DialogButton>
          </>
        }
      >
        {verifying && (blocked || isSubmitter(verifying)) && (
          <div className="mb-3">
            <Callout tone="warning" title="Maker-checker: you cannot verify this account">
              <span className="inline-flex items-start gap-1.5">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  These bank details were submitted by {nameOf(verifying.submitted_by)}. The person who submits payout
                  details cannot also verify them: ask a different finance user to check the bank proof and verify.
                </span>
              </span>
            </Callout>
          </div>
        )}
        {verifying && (
          <DescriptionList
            items={[
              { label: 'Owner', value: `${verifying.owner_name ?? verifying.owner_id} (${PAYEE_TYPE_LABELS[verifying.owner_type]})` },
              { label: 'Account holder', value: verifying.account_holder_name },
              { label: 'Account number', value: <Mono>{verifying.account_number_masked}</Mono> },
              { label: 'IFSC', value: <Mono>{verifying.ifsc ?? '—'}</Mono> },
              { label: 'Bank', value: verifying.bank_name ?? '—' },
              { label: 'SWIFT', value: <Mono>{verifying.swift ?? '—'}</Mono> },
              { label: 'Added', value: formatDateTime(verifying.created_at) },
              { label: 'Details submitted by', value: nameOf(verifying.submitted_by) },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}
