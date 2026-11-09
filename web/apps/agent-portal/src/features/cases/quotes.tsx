import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  QUOTE_LINE_CATEGORY_LABELS,
  casesApi,
  errorMessage,
  type CaseOut,
  type QuoteLineItem,
  type QuoteOut,
} from '@hig/shared/api';
import { DataTable, MoneyCell, TextCell, isEmergencyAckError, isGuestUpgradeError, type DataTableColumn } from '@hig/shared/ui';
import { Button, Checkbox, ConfirmDialog, Modal, Money, StatusBadge } from '../../components/ui';
import { daysUntil, formatDate } from '../../lib/shared';

export function isQuoteActionable(caseStatus: CaseOut['status'], quote: QuoteOut): boolean {
  if (quote.status !== 'sent' || caseStatus !== 'quoted') return false;
  const left = daysUntil(quote.valid_until);
  return left === null || left >= 0;
}

type LineRow = QuoteLineItem & { id: string };

function lineColumns(quote: QuoteOut): DataTableColumn<LineRow>[] {
  return [
    {
      key: 'item',
      header: 'Item',
      sortable: true,
      sortValue: (item) => QUOTE_LINE_CATEGORY_LABELS[item.category] ?? item.category,
      cell: (item) => <TextCell primary={QUOTE_LINE_CATEGORY_LABELS[item.category] ?? item.category} secondary={item.description ?? undefined} />,
    },
    {
      key: 'share',
      header: 'Share',
      sortable: true,
      sortValue: (item) => item.amount_minor,
      cell: (item) => {
        const share = quote.total_minor > 0 ? Math.max(0, Math.round((item.amount_minor / quote.total_minor) * 100)) : 0;
        return (
          <span className="flex items-center gap-2 text-xs text-muted tabular-nums">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, share)}%` }} />
            </span>
            {share}%
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      sortable: true,
      sortDescFirst: true,
      sortValue: (item) => item.amount_minor,
      cell: (item) => <MoneyCell minor={item.amount_minor} currency={quote.currency} />,
    },
  ];
}

export function QuoteDetails({ quote }: { quote: QuoteOut }) {
  const left = daysUntil(quote.valid_until);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge kind="quote" status={quote.status} />
        <span className="text-muted">
          Sent {formatDate(quote.created_at)}
          {quote.prepared_by_name ? ` by ${quote.prepared_by_name}` : ''}
        </span>
        {quote.valid_until && (
          <span className={left !== null && left < 0 ? 'text-danger' : left !== null && left <= 3 ? 'text-warning' : 'text-muted'}>
            · Valid until {formatDate(quote.valid_until)}
            {left !== null && left >= 0 ? ` (${left} day${left === 1 ? '' : 's'} left)` : left !== null ? ' (expired)' : ''}
          </span>
        )}
      </div>
      {quote.treatment_plan && <p className="text-sm whitespace-pre-line">{quote.treatment_plan}</p>}
      <DataTable
        caption="Quote line items"
        columns={lineColumns(quote)}
        rows={quote.line_items.map((item, i) => ({ ...item, id: `${item.category}-${i}` }))}
        defaultSort={null}
        density="compact"
        className="rounded-lg"
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3">
        <span className="text-sm font-semibold">
          Total
          {quote.estimated_stay_days ? <span className="ml-1 font-normal text-muted">· {quote.estimated_stay_days} days in hospital</span> : null}
        </span>
        <Money minor={quote.total_minor} currency={quote.currency} className="text-lg font-bold tabular-nums" />
      </div>
    </div>
  );
}

/**
 * Accept a quote (case -> accepted). Optionally cancels the patient's other open enquiries for the same
 * treatment (`siblings`) so hospitals stop working on them.
 */
/** Server-side gates that block quote acceptance / booking for the agent's patient. */
export type CareGate = 'emergency' | 'guest';

export function careGateOf(error: unknown): CareGate | null {
  if (isEmergencyAckError(error)) return 'emergency';
  if (isGuestUpgradeError(error)) return 'guest';
  return null;
}

export const CARE_GATE_MESSAGES: Record<CareGate, string> = {
  emergency: 'This case was screened as a possible emergency. Review and acknowledge the emergency guidance first.',
  guest: 'The patient is on a guest account and must create a full account before quotes can be accepted or booked.',
};

export function AcceptQuoteDialog({
  open,
  onClose,
  caseItem,
  quote,
  siblings = [],
  onBlocked,
}: {
  open: boolean;
  onClose: () => void;
  caseItem: Pick<CaseOut, 'id' | 'case_number' | 'hospital'>;
  quote: QuoteOut | null;
  siblings?: Pick<CaseOut, 'id' | 'case_number' | 'hospital' | 'status'>[];
  /** 409 `emergency_ack_required` / 403 `guest_upgrade_required`; defaults to opening the case page */
  onBlocked?: (gate: CareGate) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openSiblings = siblings.filter((s) => s.id !== caseItem.id && ['enquiry', 'quoted'].includes(s.status));
  const [cancelOthers, setCancelOthers] = useState(true);
  useEffect(() => {
    if (open) setCancelOthers(true);
  }, [open]);

  const accept = useMutation({
    mutationFn: async () => {
      if (!quote) throw new Error('No quote selected');
      const accepted = await casesApi.acceptQuote(caseItem.id, quote.id);
      const failures: string[] = [];
      if (cancelOthers) {
        for (const s of openSiblings) {
          try {
            await casesApi.changeStatus(s.id, {
              to_status: 'cancelled',
              note: `Patient chose another hospital (${caseItem.case_number})`,
            });
          } catch {
            failures.push(s.case_number);
          }
        }
      }
      return { accepted, failures };
    },
    onSuccess: ({ failures }) => {
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      if (failures.length) toast.warning(`Quote accepted. Could not cancel: ${failures.join(', ')}`);
      else toast.success('Quote accepted — you can now book the treatment');
      onClose();
      navigate(`/cases/${caseItem.id}/book`);
    },
    onError: (error) => {
      const gate = careGateOf(error);
      if (!gate) {
        toast.error(errorMessage(error));
        return;
      }
      toast.error(CARE_GATE_MESSAGES[gate]);
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      onClose();
      if (onBlocked) onBlocked(gate);
      else navigate(`/cases/${caseItem.id}`);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Accept this quote?"
      description={caseItem.hospital.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={accept.isPending}>
            Cancel
          </Button>
          <Button loading={accept.isPending} onClick={() => accept.mutate()}>
            Accept quote
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          The hospital is notified and the case moves to <strong>accepted</strong>. Next you choose the admission date and
          payment option to create the booking.
        </p>
        {quote && (
          <p>
            Total: <Money minor={quote.total_minor} currency={quote.currency} className="font-semibold" />
          </p>
        )}
        {openSiblings.length > 0 && (
          <Checkbox
            checked={cancelOthers}
            onChange={(e) => setCancelOthers(e.target.checked)}
            label={`Cancel the ${openSiblings.length} other open enquir${openSiblings.length === 1 ? 'y' : 'ies'}`}
            description={openSiblings.map((s) => `${s.hospital.name} (${s.case_number})`).join(', ')}
          />
        )}
      </div>
    </Modal>
  );
}

export function RejectQuoteDialog({
  open,
  onClose,
  caseId,
  quote,
}: {
  open: boolean;
  onClose: () => void;
  caseId: string;
  quote: QuoteOut | null;
}) {
  const queryClient = useQueryClient();
  const reject = useMutation({
    mutationFn: (reason: string) => {
      if (!quote) throw new Error('No quote selected');
      return casesApi.rejectQuote(caseId, quote.id, reason ? { reason } : {});
    },
    onSuccess: () => {
      toast.success('Quote declined');
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={(reason) => reject.mutate(reason)}
      title="Decline this quote?"
      description="The hospital can send a revised quote."
      confirmLabel="Decline quote"
      tone="danger"
      loading={reject.isPending}
      reason={{ label: 'Reason (shared with the hospital)', placeholder: 'e.g. Budget too high, prefer shorter stay' }}
    />
  );
}
