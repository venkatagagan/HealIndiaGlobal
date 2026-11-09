/**
 * Settlement building blocks: section tabs, payee filter, payee picker, generate-batch dialog and payout action
 * dialogs.
 */
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, Layers, ListChecks, Send } from 'lucide-react';
import {
  adminApi,
  isReferenceRequired,
  PAYEE_TYPES,
  PAYEE_TYPE_LABELS,
  type PayeeType,
  type PayoutOut,
  type Uuid,
} from '@hig/shared/api';
import { SelectFilter, type FilterOption } from '@hig/shared/ui';
import { cn, formatMoney, todayIsoDate } from '../lib/shared';
import {
  useAgentLookup,
  useCreateBatch,
  useFinanceReviewCounts,
  useHospitalLookup,
  useMarkPayoutFailed,
  useMarkPayoutPaid,
} from '../api/queries';
import { financePath } from '../paths';
import { EnumSelect, notifyError, notifySuccess, ReasonDialog, useSearchBox } from './finance';
import { Callout, Field, Input, Modal, Select, Button, Textarea } from './ui';
import { isPayoutAwaitingConfirmation, isPayoutReversalPending, PayoutConfirmationActions, PayoutReversalActions } from './reviews';
import { useFinancePermissions } from '../lib/permissions';

type TabKey = 'items' | 'batches' | 'payouts' | 'documents';

const TABS: { key: TabKey; to: string; label: string; end: boolean; icon: typeof Layers }[] = [
  { key: 'items', to: financePath('settlements'), label: 'Items', end: true, icon: ListChecks },
  { key: 'batches', to: financePath('settlements/batches'), label: 'Batches', end: false, icon: Layers },
  { key: 'payouts', to: financePath('settlements/payouts'), label: 'Payouts', end: false, icon: Send },
  { key: 'documents', to: financePath('settlements/documents'), label: 'Invoices & credit notes', end: false, icon: FileText },
];

/**
 * Segmented section switcher for the settlement pages. Batches / Payouts carry an attention count (batches to
 * approve; payouts waiting for reconciliation or a second finance user) from the finance review counts.
 */
export function SettlementTabs() {
  const perms = useFinancePermissions();
  const review = useFinanceReviewCounts(perms.finance);
  const d = review.data;
  const attention: Partial<Record<TabKey, number>> = d
    ? {
        batches: d.batches ?? 0,
        payouts: (d.payoutConfirmations ?? 0) + (d.payoutReconciliations ?? 0) + (d.payoutReversals ?? 0),
      }
    : {};
  return (
    <nav aria-label="Settlement sections" className="-mt-2 mb-5 overflow-x-auto [scrollbar-width:none]">
      <div className="inline-flex min-w-max items-center gap-1 rounded-xl border border-border bg-surface-2/70 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = attention[t.key];
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive ? 'bg-surface text-fg shadow-sm ring-1 ring-border' : 'text-muted hover:bg-surface/60 hover:text-fg',
                )
              }
            >
              <Icon className="size-4 opacity-70" aria-hidden />
              {t.label}
              {count ? (
                <span
                  className="min-w-5 rounded-full bg-warning-soft px-1.5 text-center text-xs leading-5 font-semibold text-warning-ink tabular-nums"
                  aria-label={`${count} need attention`}
                >
                  {count}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Payee filter ("hospital:<id>" / "agent:<id>" in the URL)
// ---------------------------------------------------------------------------------------------------------
export interface PayeeRef {
  type: PayeeType;
  id: Uuid;
}

/** "hospital:0193…" -> {type, id}; anything else -> null */
export function parsePayee(value: string | null | undefined): PayeeRef | null {
  if (!value) return null;
  const [type, id] = value.split(':');
  if (!type || !id || !(PAYEE_TYPES as readonly string[]).includes(type)) return null;
  return { type: type as PayeeType, id: id as Uuid };
}

/** API params for a payee filter: an explicit payee wins over the payee-type filter. */
export function payeeParams(payee: string, payeeType: PayeeType | ''): { payee_type?: PayeeType; payee_id?: Uuid } {
  const ref = parsePayee(payee);
  if (ref) return { payee_type: ref.type, payee_id: ref.id };
  return { payee_type: payeeType || undefined };
}

export const PAYEE_TYPE_OPTIONS: FilterOption<PayeeType>[] = PAYEE_TYPES.map((t) => ({ value: t, label: PAYEE_TYPE_LABELS[t] }));

/** Hospitals and agents (first 100 each by name) as filter options keyed "type:id". */
function usePayeeOptions(types: readonly PayeeType[]) {
  const wantHospitals = types.includes('hospital');
  const wantAgents = types.includes('agent');
  const hospitals = useQuery({
    queryKey: ['finance-lookup', 'payee-options', 'hospital'] as const,
    queryFn: () => adminApi.listHospitals({ page: 1, page_size: 100 }),
    enabled: wantHospitals,
    staleTime: 5 * 60_000,
  });
  const agents = useQuery({
    queryKey: ['finance-lookup', 'payee-options', 'agent'] as const,
    queryFn: () => adminApi.listAgents({ page: 1, page_size: 100 }),
    enabled: wantAgents,
    staleTime: 5 * 60_000,
  });
  const options: FilterOption[] = [
    ...(wantHospitals ? (hospitals.data?.items ?? []) : []).map((h) => ({
      value: `hospital:${h.id}`,
      label: h.name,
      description: ['Hospital', h.city].filter(Boolean).join(' · '),
    })),
    ...(wantAgents ? (agents.data?.items ?? []) : []).map((a) => ({
      value: `agent:${a.id}`,
      label: a.agency_name,
      description: `Agent · ${a.agent_code}`,
    })),
  ];
  return { options, loading: (wantHospitals && hospitals.isLoading) || (wantAgents && agents.isLoading) };
}

/** Searchable "Payee" pill (hospitals + agents, or only the chosen payee type). */
export function PayeeFilter({ value, onChange, payeeType, label = 'Payee' }: {
  value: string;
  onChange: (value: string) => void;
  payeeType?: PayeeType | '';
  label?: string;
}) {
  const types: PayeeType[] = payeeType ? [payeeType] : ['hospital', 'agent'];
  const { options, loading } = usePayeeOptions(types);
  return (
    <SelectFilter
      label={label}
      icon={<Building2 className="size-3.5 opacity-70" aria-hidden />}
      value={value}
      onChange={onChange}
      options={options}
      loading={loading}
      searchable
    />
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pick a hospital / agent (searchable) or enter a vendor id. `value` is the payee id or '' (= all payees).
 */
export function PayeePicker({ payeeType, value, onChange, id, allowAll = true, allLabel = 'All payees', selectedLabel }: {
  payeeType: PayeeType | '';
  value: string;
  onChange: (payeeId: string) => void;
  id?: string;
  allowAll?: boolean;
  allLabel?: string;
  /** label for the current value when it is not in the loaded search results (edit forms) */
  selectedLabel?: string | null;
}) {
  const [debounced, setDebounced] = useState('');
  const [text, setText] = useSearchBox(debounced, setDebounced, 300);
  const hospitals = useHospitalLookup(debounced, payeeType === 'hospital');
  const agents = useAgentLookup(debounced, payeeType === 'agent');

  if (!payeeType) {
    return (
      <Select id={id} disabled value="">
        <option value="">Choose a payee type first</option>
      </Select>
    );
  }
  if (payeeType === 'vendor') {
    const invalid = value !== '' && !UUID_RE.test(value);
    return (
      <Input
        id={id}
        className="font-mono"
        placeholder={allowAll ? 'Vendor id (blank = all vendors)' : 'Vendor id'}
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.trim())}
      />
    );
  }

  const query = payeeType === 'hospital' ? hospitals : agents;
  const options =
    payeeType === 'hospital'
      ? (hospitals.data?.items ?? []).map((h) => ({ id: h.id, label: `${h.name}${h.city ? ` · ${h.city}` : ''}` }))
      : (agents.data?.items ?? []).map((a) => ({ id: a.id, label: `${a.agency_name} · ${a.agent_code}` }));
  const selectedMissing = value && !options.some((o) => o.id === value);

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row">
      <Input
        aria-label={`Search ${PAYEE_TYPE_LABELS[payeeType].toLowerCase()}s`}
        placeholder={`Search ${PAYEE_TYPE_LABELS[payeeType].toLowerCase()}s…`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        className="sm:w-44"
      />
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="sm:min-w-56">
        {allowAll ? <option value="">{allLabel}</option> : <option value="" disabled>Select…</option>}
        {selectedMissing && <option value={value}>{selectedLabel ?? `Selected (${value.slice(0, 8)}…)`}</option>}
        {query.isLoading && <option disabled>Loading…</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function GenerateBatchDialog({ open, onClose, defaultPayeeType }: {
  open: boolean;
  onClose: () => void;
  defaultPayeeType?: PayeeType;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate settlement batch"
      description="Collects eligible settlement items (on-hold items are skipped; negative clawback items net against the payee's positive items) into a batch that needs approval by a different finance user."
      size="lg"
    >
      {open && <GenerateBatchForm onDone={onClose} defaultPayeeType={defaultPayeeType} />}
    </Modal>
  );
}

function GenerateBatchForm({ onDone, defaultPayeeType }: { onDone: () => void; defaultPayeeType?: PayeeType }) {
  const navigate = useNavigate();
  const create = useCreateBatch();
  const [payeeType, setPayeeType] = useState<PayeeType | ''>(defaultPayeeType ?? 'hospital');
  const [payeeId, setPayeeId] = useState('');
  const [periodEnd, setPeriodEnd] = useState(todayIsoDate());
  const [submitted, setSubmitted] = useState(false);
  const payeeInvalid = payeeId !== '' && !UUID_RE.test(payeeId);
  const periodInvalid = periodEnd !== '' && periodEnd > todayIsoDate();

  const submit = () => {
    setSubmitted(true);
    if (!payeeType || payeeInvalid || periodInvalid) return;
    create.mutate(
      { payee_type: payeeType, payee_id: (payeeId || undefined) as Uuid | undefined, period_end: periodEnd || undefined },
      {
        onSuccess: (batch) => {
          notifySuccess(
            `Batch ${batch.batch_number} created: ${batch.items_count} items, net ${formatMoney(batch.total_net_minor, batch.currency)}`,
          );
          onDone();
          navigate(financePath(`settlements/batches/${batch.id}`));
        },
        onError: (e) => notifyError(e, 'Could not generate the batch'),
      },
    );
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Payee type" required error={submitted && !payeeType ? 'Choose a payee type' : null}>
        {(p) => (
          <EnumSelect
            id={p.id}
            value={payeeType}
            values={PAYEE_TYPES}
            labels={PAYEE_TYPE_LABELS}
            includeAll={false}
            onChange={(v) => {
              setPayeeType(v);
              setPayeeId('');
            }}
          />
        )}
      </Field>
      <Field label="Payee" hint="Leave as “All payees” to batch every payee of this type" error={payeeInvalid ? 'Enter a valid id' : null}>
        {(p) => <PayeePicker id={p.id} payeeType={payeeType} value={payeeId} onChange={setPayeeId} />}
      </Field>
      <Field label="Period end" hint="Include items that became eligible on or before this date"
        error={periodInvalid ? 'Period end cannot be in the future' : null}>
        {(p) => <Input {...p} type="date" max={todayIsoDate()} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />}
      </Field>
      <Callout tone="info">
        You will be recorded as the batch maker. Another finance or super-admin user must approve it before payouts are
        processed.
      </Callout>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Generate batch
        </Button>
      </div>
    </form>
  );
}

/** Failing these needs a reference and a second finance user (money may already have left: SEC-003 / SEC-004). */
export function payoutFailureNeedsSecondApprover(p: PayoutOut): boolean {
  return p.status === 'processed' || p.status === 'needs_reconciliation';
}

/** Mark a payout paid (UTR / transfer id) or failed (reason, plus a reference for processed / reconciliation payouts). */
export function PayoutActionDialogs({ payout, action, onClose }: {
  payout: PayoutOut | null;
  action: 'paid' | 'failed' | null;
  onClose: () => void;
}) {
  const markPaid = useMarkPayoutPaid();
  const label = payout ? `${payout.payee_name ?? 'Payee'} · ${formatMoney(payout.amount_minor, payout.currency)}` : undefined;
  const reconciling = payout?.status === 'needs_reconciliation';
  return (
    <>
      <ReasonDialog
        open={payout !== null && action === 'paid'}
        title={reconciling ? 'Record Razorpay transfer / UTR' : 'Record payout UTR'}
        description={label}
        label={reconciling ? 'Razorpay transfer id (trf_…) or bank UTR' : 'UTR / bank reference'}
        confirmLabel="Record reference"
        confirmVariant="primary"
        singleLine
        maxLength={64}
        loading={markPaid.isPending}
        onClose={onClose}
        onConfirm={(utr) =>
          payout &&
          markPaid.mutate(
            { id: payout.id, utr },
            {
              onSuccess: () => {
                notifySuccess('Reference recorded; a second finance user must confirm the payout');
                onClose();
              },
              onError: (e) => notifyError(e, 'Could not mark the payout paid'),
            },
          )
        }
      >
        {reconciling ? (
          <Callout tone="warning" title="Gateway outcome unknown">
            The transfer call timed out or returned an unclear answer, so it was not retried. Search the Razorpay
            dashboard (Route → Transfers) for this payout id (<span className="font-mono">notes.payout_id</span>). If
            the transfer exists, enter its <span className="font-mono">trf_…</span> id here; a different finance user
            then confirms it. If it does not exist, use <strong>Request failure</strong> instead so the items are
            batched again.
          </Callout>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Enter the UTR from the bank transfer. This records it only: a different finance user must confirm it before
            the payout is posted to the ledger (payee payable → bank).
          </p>
        )}
      </ReasonDialog>
      <Modal
        open={payout !== null && action === 'failed'}
        onClose={onClose}
        title={payout && payoutFailureNeedsSecondApprover(payout) ? 'Request payout failure' : 'Mark payout failed'}
        description={label}
        size="md"
      >
        {payout && action === 'failed' && <PayoutFailForm key={payout.id} payout={payout} onDone={onClose} />}
      </Modal>
    </>
  );
}

function PayoutFailForm({ payout, onDone }: { payout: PayoutOut; onDone: () => void }) {
  const markFailed = useMarkPayoutFailed();
  const dual = payoutFailureNeedsSecondApprover(payout);
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverRefError, setServerRefError] = useState<string | null>(null);
  const r = reason.trim();
  const ref = reference.trim();
  const reasonError = submitted && !r ? 'A reason is required' : null;
  const refError =
    serverRefError ??
    (submitted && dual && ref.length < 3 ? 'A bank return or gateway reference (at least 3 characters) is required' : null);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        setServerRefError(null);
        if (!r || (dual && ref.length < 3)) return;
        markFailed.mutate(
          { id: payout.id, reason: r, reference: ref || undefined },
          {
            onSuccess: () => {
              notifySuccess(
                dual
                  ? 'Failure requested; a different finance user must approve it'
                  : 'Payout marked as failed; its items are eligible again',
              );
              onDone();
            },
            onError: (err) => {
              if (isReferenceRequired(err)) {
                setServerRefError('A bank or gateway reference is required to fail this payout');
                return;
              }
              notifyError(err, 'Could not mark the payout failed');
            },
          },
        );
      }}
    >
      {dual ? (
        <Callout tone="warning" title="Two-person control">
          {payout.status === 'processed'
            ? 'This payout was already marked paid, so money may have left the platform. Record the bank return (bounce) reference; '
            : 'The gateway outcome of this payout is unknown, so money may have left the platform. Record the reference that proves no transfer was made (e.g. the Razorpay dashboard search); '}
          a different finance user must then approve the request before the payout{' '}
          {payout.status === 'processed' ? 'is reversed' : 'fails'} and its items return to eligible.
        </Callout>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No money has been sent for this payout yet, so it fails immediately and its items return to eligible for the
          next batch.
        </p>
      )}
      {dual && (
        <Field label="Bank / gateway reference" required error={refError} hint="Bank return reference, gateway case id, etc.">
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              value={reference}
              maxLength={100}
              onChange={(e) => {
                setReference(e.target.value);
                setServerRefError(null);
              }}
            />
          )}
        </Field>
      )}
      <Field label="Reason" required error={reasonError} hint={`${r.length}/500`}>
        {(p) => <Textarea {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={markFailed.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={markFailed.isPending}>
          {dual ? 'Request failure' : 'Mark failed'}
        </Button>
      </div>
    </form>
  );
}

/** Payouts that finance can still settle by hand (needs_reconciliation: transfer id or two-person failure). */
export function isPayoutActionable(p: PayoutOut): boolean {
  return p.status === 'queued' || p.status === 'processing' || p.status === 'needs_reconciliation';
}

/** Row actions for a payout: second-approver steps first, then the maker actions for its status. */
export function PayoutRowActions({ payout, onAction }: {
  payout: PayoutOut;
  onAction: (action: 'paid' | 'failed') => void;
}) {
  const perms = useFinancePermissions();
  if (!perms.finance) return null;
  if (isPayoutReversalPending(payout)) return <PayoutReversalActions payout={payout} />;
  if (isPayoutAwaitingConfirmation(payout)) return <PayoutConfirmationActions payout={payout} />;
  if (isPayoutActionable(payout)) {
    const reconciling = payout.status === 'needs_reconciliation';
    return (
      <div className="flex justify-end gap-1.5">
        <Button size="sm" onClick={() => onAction('paid')}>
          {reconciling ? 'Record transfer' : 'Mark paid'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAction('failed')}>
          {reconciling ? 'Request failure' : 'Mark failed'}
        </Button>
      </div>
    );
  }
  if (payout.status === 'processed') {
    return (
      <Button size="sm" variant="ghost" onClick={() => onAction('failed')} title="The bank returned this payout: request a reversal">
        Report bounce
      </Button>
    );
  }
  return null;
}
