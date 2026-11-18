/**
 * Ledger adjustments under maker-checker (GET/POST /finance/ledger/adjustments, .../approve, .../reject):
 * tax remittance (GST/TDS paid to the government), FX differences and manual corrections. A request posts
 * nothing; a different finance user approves it, which posts one balanced journal entry.
 */
import { useMemo, useState } from 'react';
import { Trans } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, Plus, Trash2, X } from 'lucide-react';
import {
  ENTRY_DIRECTIONS,
  financeApi,
  type EntryDirection,
  type LedgerAdjustmentKind,
  type LedgerAdjustmentListParams,
  type LedgerAdjustmentOut,
  type LedgerAdjustmentStatus,
} from '@hig/shared/api';
import { fetchAllPages, filterParam, fromMinor, useTableState, type FilterValues } from '@hig/shared/lib';
import {
  AmountRangeFilter,
  Button as SharedButton,
  DataTable,
  DateCell,
  DateRangeFilter,
  ExportButton,
  FilterBar,
  MoneyCell,
  MultiSelectFilter,
  PageHeader,
  QuickFilters,
  StatusBadgeCell,
  TextCell,
  statusTone,
  type DataTableColumn,
  type QuickFilterItem,
} from '@hig/shared/ui';
import { formatMoney, toMinor, useDocumentTitle } from '../../lib/shared';
import { enumLabel, ft, useFinanceTranslation } from '../../lib/i18n';
import {
  financeKeys,
  useAdjustments,
  useApproveAdjustment,
  useCreateAdjustment,
  useLedgerAccounts,
  useRejectAdjustment,
} from '../../api/queries';
import { Mono, notifyError, notifySuccess, ReasonDialog } from '../../components/finance';
import { LedgerTabs, TransactionModal } from '../../components/ledger';
import { notifyApprovalError, useStaffName } from '../../components/reviews';
import { useFinancePermissions } from '../../lib/permissions';
import { listOrUndefined, minorOrUndefined } from '../../lib/tables';
import { Button, Callout, Field, Input, Modal, Select, Textarea } from '../../components/ui';

/** Catalog: adjustments.kinds.<kind>.{label,help} and adjustments.statuses.<status> */
const KINDS = ['tax_remittance', 'fx_difference', 'manual'] as const satisfies readonly LedgerAdjustmentKind[];
const STATUSES = ['pending_approval', 'posted', 'rejected'] as const satisfies readonly LedgerAdjustmentStatus[];
const kindLabel = (kind: LedgerAdjustmentKind) => ft(`adjustments.kinds.${kind}.label`, { defaultValue: kind });
const statusLabel = (status: LedgerAdjustmentStatus) => ft(`adjustments.statuses.${status}`, { defaultValue: status });

const FILTERS = {
  q: filterParam.text(),
  status: filterParam.list(STATUSES),
  kind: filterParam.list(KINDS),
  from: filterParam.date(),
  to: filterParam.date(),
  min: filterParam.number(),
  max: filterParam.number(),
};
const SORT_KEYS = ['created_at', 'approved_at', 'amount_minor', 'status', 'kind'] as const;

function toApiFilters(f: FilterValues<typeof FILTERS>): Omit<LedgerAdjustmentListParams, 'page' | 'page_size' | 'sort' | 'status'> {
  return {
    q: f.q.trim() || undefined,
    kind: listOrUndefined(f.kind),
    created_from: f.from || undefined,
    created_to: f.to || undefined,
    min_amount: minorOrUndefined(f.min),
    max_amount: minorOrUndefined(f.max),
  };
}

export default function AdjustmentsPage() {
  const { t } = useFinanceTranslation();
  useDocumentTitle(t('adjustments.documentTitle'));
  const perms = useFinancePermissions();
  const nameOf = useStaffName();
  const table = useTableState({ filters: FILTERS, defaultSort: '-created_at', sortKeys: SORT_KEYS, defaultPageSize: 25 });
  const { filters, setFilter, setFilters } = table;
  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);
  const listParams: LedgerAdjustmentListParams = {
    ...apiFilters,
    status: listOrUndefined(filters.status),
    sort: table.sortParam,
    page: table.page,
    page_size: table.pageSize,
  };
  const list = useAdjustments(listParams);
  const counts = useQuery({
    queryKey: [...financeKeys.all, 'adjustments', 'status-counts', apiFilters],
    queryFn: () => financeApi.adjustmentStatusCounts(apiFilters),
    placeholderData: keepPreviousData,
  });
  const approve = useApproveAdjustment();
  const reject = useRejectAdjustment();
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<LedgerAdjustmentOut | null>(null);
  const [rejecting, setRejecting] = useState<LedgerAdjustmentOut | null>(null);
  const [txnId, setTxnId] = useState<string | null>(null);

  const columns = useMemo<DataTableColumn<LedgerAdjustmentOut>[]>(
    () => [
      {
        key: 'kind',
        header: t('adjustments.columns.adjustment'),
        sortable: true,
        sticky: true,
        mobile: 'primary',
        className: 'max-w-96',
        cell: (a) => (
          <TextCell
            primary={<span className="font-medium">{kindLabel(a.kind)}</span>}
            secondary={[a.external_reference, a.description].filter(Boolean).join(' · ')}
          />
        ),
        exportValue: (a) => kindLabel(a.kind),
      },
      {
        key: 'description',
        header: t('ledger.txn.description'),
        defaultHidden: true,
        className: 'max-w-80',
        cell: (a) => <span className="line-clamp-2">{a.description}</span>,
        exportValue: (a) => a.description,
      },
      {
        key: 'amount',
        header: t('orders.columns.amount'),
        align: 'end',
        sortable: true,
        sortKey: 'amount_minor',
        sortDescFirst: true,
        cell: (a) => <MoneyCell minor={a.amount_minor} currency={a.currency} />,
        exportValue: (a) => fromMinor(a.amount_minor, a.currency),
      },
      {
        key: 'status',
        header: t('orders.columns.status'),
        sortable: true,
        mobile: 'badge',
        cell: (a) => (
          <span className="flex flex-col items-start gap-1">
            <StatusBadgeCell status={a.status} label={statusLabel(a.status)} />
            {a.rejection_reason && (
              <span className="max-w-48 truncate text-xs text-danger-ink" title={a.rejection_reason}>
                {a.rejection_reason}
              </span>
            )}
          </span>
        ),
        exportValue: (a) => statusLabel(a.status),
      },
      {
        key: 'requested',
        header: t('orderDetail.refunds.requested'),
        sortable: true,
        sortKey: 'created_at',
        sortDescFirst: true,
        cell: (a) => <DateCell value={a.created_at} display="relative" secondary={nameOf(a.requested_by)} />,
        exportValue: (a) => a.created_at,
      },
      {
        key: 'decided',
        header: t('adjustments.columns.decided'),
        sortable: true,
        sortKey: 'approved_at',
        sortDescFirst: true,
        cell: (a) =>
          a.approved_by ? (
            <DateCell value={a.approved_at} display="relative" secondary={nameOf(a.approved_by)} />
          ) : (
            <span className="text-muted">—</span>
          ),
        exportValue: (a) => a.approved_at ?? '',
      },
      {
        key: 'actions',
        header: <span className="sr-only">{t('orderDetail.actions')}</span>,
        title: t('orderDetail.actions'),
        align: 'end',
        hideable: false,
        exportable: false,
        cell: (a) => {
          if (a.ledger_transaction_id)
            return (
              <Button size="sm" variant="ghost" onClick={() => setTxnId(a.ledger_transaction_id)}>
                {t('adjustments.viewEntry')}
              </Button>
            );
          if (!perms.finance || a.status !== 'pending_approval') return null;
          const own = Boolean(perms.userId && a.requested_by === perms.userId);
          return (
            <span className="flex flex-wrap justify-end gap-1.5">
              <Button size="sm" disabled={own} onClick={() => setApproving(a)} icon={<Check className="size-3.5" aria-hidden />}
                title={own ? t('adjustments.ownTitle') : undefined}>
                {t('reviews.approve')}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRejecting(a)} icon={<X className="size-3.5" aria-hidden />}>
                {t('reviews.reject')}
              </Button>
              {own && <span className="basis-full text-end text-xs text-warning-ink">{t('refunds.needsSecond')}</span>}
            </span>
          );
        },
      },
    ],
    [nameOf, perms.finance, perms.userId, t],
  );

  const c = counts.data;
  const quickItems: QuickFilterItem<LedgerAdjustmentStatus>[] = [
    { value: '', label: t('common.all'), count: c?.total },
    ...STATUSES.map((s) => ({ value: s, label: statusLabel(s), count: c?.counts[s] })),
  ];
  const quickValue = filters.status.length === 0 ? '' : filters.status.length === 1 ? filters.status[0]! : null;

  return (
    <div>
      <PageHeader
        title={t('nav.items.ledger')}
        description={t('adjustments.description')}
        actions={
          perms.finance && (
            <SharedButton leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('adjustments.newAdjustment')}
            </SharedButton>
          )
        }
      />
      <LedgerTabs />
      <DataTable
        id="admin.finance.ledger.adjustments"
        caption={t('adjustments.documentTitle')}
        table={table}
        columns={columns}
        rows={list.data?.items}
        total={list.data?.total}
        loading={list.isLoading}
        fetching={list.isFetching && !list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle={t('adjustments.emptyTitle')}
        emptyDescription={t('adjustments.emptyDescription')}
        header={
          <div className="border-b border-border px-2 sm:px-3">
            <QuickFilters label={t('adjustments.statusLabel')} items={quickItems} value={quickValue} onChange={(s) => setFilter('status', s ? [s] : [])} />
          </div>
        }
        toolbar={
          <FilterBar
            search={{ value: filters.q, onChange: (q) => setFilter('q', q), placeholder: t('adjustments.searchPlaceholder') }}
            onReset={table.resetFilters}
            actions={
              <ExportButton
                filename="ledger-adjustments"
                columns={columns}
                rows={list.data?.items}
                total={list.data?.total}
                fetchAll={() =>
                  fetchAllPages((page, size) =>
                    financeApi.listAdjustments({ ...listParams, page, page_size: size }),
                  )
                }
              />
            }
          >
            <MultiSelectFilter
              label={t('adjustments.kind')}
              value={filters.kind}
              onChange={(v) => setFilter('kind', v)}
              options={KINDS.map((k) => ({ value: k, label: kindLabel(k) }))}
            />
            <MultiSelectFilter
              label={t('orders.columns.status')}
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={STATUSES.map((s) => ({ value: s, label: statusLabel(s), count: c?.counts[s], tone: statusTone(s) }))}
            />
            <AmountRangeFilter label={t('orders.columns.amount')} currency="INR" value={{ min: filters.min, max: filters.max }} onChange={({ min, max }) => setFilters({ min, max })} />
            <DateRangeFilter label={t('orderDetail.refunds.requested')} value={{ from: filters.from, to: filters.to }} onChange={({ from, to }) => setFilters({ from, to })} />
          </FilterBar>
        }
      />

      <Modal open={creating} onClose={() => setCreating(false)} title={t('adjustments.requestTitle')} size="lg"
        description={t('adjustments.requestDescription')}>
        {creating && <AdjustmentForm onDone={() => setCreating(false)} />}
      </Modal>

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={t('adjustments.approveTitle')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproving(null)} disabled={approve.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() =>
                approving &&
                approve.mutate(approving.id, {
                  onSuccess: () => {
                    notifySuccess(ft('adjustments.posted'));
                    setApproving(null);
                  },
                  onError: (e) => notifyApprovalError(e, ft('adjustments.approveFailed'), 'adjustment'),
                })
              }
            >
              {t('adjustments.approveAndPost')}
            </Button>
          </>
        }
      >
        {approving && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              <Trans
                t={t}
                i18nKey="adjustments.approveBody"
                values={{
                  kind: kindLabel(approving.kind),
                  amount: formatMoney(approving.amount_minor, approving.currency),
                  description: approving.description,
                }}
                components={{ 0: <strong /> }}
              />
            </p>
            <EntryPreview entries={approving.entries} currency={approving.currency} />
            <p className="text-xs text-slate-500">{t('adjustments.permanent')}</p>
          </div>
        )}
      </Modal>

      <ReasonDialog
        open={rejecting !== null}
        title={t('adjustments.rejectTitle')}
        description={rejecting ? `${kindLabel(rejecting.kind)} · ${formatMoney(rejecting.amount_minor, rejecting.currency)}` : undefined}
        confirmLabel={t('reviews.reject')}
        loading={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) =>
          rejecting &&
          reject.mutate(
            { id: rejecting.id, reason },
            {
              onSuccess: () => {
                notifySuccess(ft('adjustments.rejected'));
                setRejecting(null);
              },
              onError: (e) => notifyError(e, ft('adjustments.rejectFailed')),
            },
          )
        }
      />
      <TransactionModal id={txnId} onClose={() => setTxnId(null)} />
    </div>
  );
}

function EntryPreview({ entries, currency }: { entries: LedgerAdjustmentOut['entries']; currency: string }) {
  const { t } = useFinanceTranslation();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-start text-xs text-slate-500">
          <th className="py-1 text-start font-medium">{t('ledger.entries.account')}</th>
          <th className="py-1 text-end font-medium">{t('ledger.entries.debit')}</th>
          <th className="py-1 text-end font-medium">{t('ledger.entries.credit')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1">
              <Mono>{e.account_code}</Mono>
            </td>
            <td className="py-1 text-end tabular-nums">{e.direction === 'debit' ? formatMoney(e.amount_minor, currency) : ''}</td>
            <td className="py-1 text-end tabular-nums">{e.direction === 'credit' ? formatMoney(e.amount_minor, currency) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface EntryDraft {
  account_code: string;
  direction: EntryDirection;
  amount: string;
}

const blankEntries = (): EntryDraft[] => [
  { account_code: '', direction: 'debit', amount: '' },
  { account_code: '', direction: 'credit', amount: '' },
];

function AdjustmentForm({ onDone }: { onDone: () => void }) {
  const { t } = useFinanceTranslation();
  const create = useCreateAdjustment();
  const accounts = useLedgerAccounts({ page_size: 100 });
  const [kind, setKind] = useState<LedgerAdjustmentKind>('tax_remittance');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [entries, setEntries] = useState<EntryDraft[]>(blankEntries);
  const [submitted, setSubmitted] = useState(false);

  const parsed = entries.map((e) => ({ ...e, minor: e.amount.trim() ? toMinor(e.amount, 'INR') : null }));
  const debits = parsed.filter((e) => e.direction === 'debit').reduce((s, e) => s + (e.minor ?? 0), 0);
  const credits = parsed.filter((e) => e.direction === 'credit').reduce((s, e) => s + (e.minor ?? 0), 0);
  const entriesValid = parsed.every((e) => e.account_code.trim().length >= 3 && e.minor !== null && e.minor > 0);
  const balanced = debits === credits && debits > 0;
  const descriptionError = submitted && description.trim().length < 3 ? t('adjustments.form.descriptionError') : null;
  const codes = useMemo(() => (accounts.data?.items ?? []).map((a) => ({ code: a.code, name: a.name })), [accounts.data]);
  const listId = 'adjustment-account-codes';

  const update = (i: number, patch: Partial<EntryDraft>) =>
    setEntries((prev) => prev.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (description.trim().length < 3 || !entriesValid || !balanced) return;
        create.mutate(
          {
            kind,
            description: description.trim(),
            external_reference: reference.trim() || null,
            entries: parsed.map((p) => ({ account_code: p.account_code.trim(), direction: p.direction, amount_minor: p.minor ?? 0 })),
          },
          {
            onSuccess: () => {
              notifySuccess(ft('adjustments.requested'));
              onDone();
            },
            onError: (err) => notifyError(err, ft('adjustments.requestFailed')),
          },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('adjustments.kind')} required hint={t(`adjustments.kinds.${kind}.help`)}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as LedgerAdjustmentKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('adjustments.form.externalReference')} hint={t('adjustments.form.externalReferenceHint')}>
          {(p) => <Input {...p} value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />}
        </Field>
      </div>
      <Field label={t('ledger.txn.description')} required error={descriptionError}>
        {(p) => <Textarea {...p} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />}
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('adjustments.form.entries')}</legend>
        <datalist id={listId}>
          {codes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </datalist>
        {entries.map((e, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_9rem_auto]">
            <Input aria-label={t('adjustments.form.entryAccount', { n: i + 1 })} placeholder={t('adjustments.form.accountPlaceholder')} list={listId}
              value={e.account_code} onChange={(ev) => update(i, { account_code: ev.target.value })} className="col-span-2 sm:col-span-1" />
            <Select aria-label={t('adjustments.form.entryDirection', { n: i + 1 })} value={e.direction} onChange={(ev) => update(i, { direction: ev.target.value as EntryDirection })}>
              {ENTRY_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {enumLabel('entryDirection', d)}
                </option>
              ))}
            </Select>
            <Input aria-label={t('adjustments.form.entryAmount', { n: i + 1 })} inputMode="decimal" placeholder="0.00" value={e.amount}
              onChange={(ev) => update(i, { amount: ev.target.value })} />
            <Button variant="ghost" size="sm" aria-label={t('adjustments.form.removeEntry', { n: i + 1 })} disabled={entries.length <= 2}
              onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" aria-hidden />} />
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" disabled={entries.length >= 20}
            onClick={() => setEntries((prev) => [...prev, { account_code: '', direction: 'debit', amount: '' }])}
            icon={<Plus className="size-3.5" aria-hidden />}>
            {t('adjustments.form.addEntry')}
          </Button>
          <span className="text-sm">
            <Trans
              t={t}
              i18nKey="adjustments.form.totals"
              values={{ debits: formatMoney(debits, 'INR'), credits: formatMoney(credits, 'INR') }}
              components={{ 0: <strong />, 1: <strong /> }}
            />
          </span>
        </div>
        {submitted && !entriesValid && <Callout tone="danger">{t('adjustments.form.entriesInvalid')}</Callout>}
        {submitted && entriesValid && !balanced && <Callout tone="danger">{t('adjustments.form.unbalanced')}</Callout>}
      </fieldset>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={create.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t('adjustments.form.submit')}
        </Button>
      </div>
    </form>
  );
}
