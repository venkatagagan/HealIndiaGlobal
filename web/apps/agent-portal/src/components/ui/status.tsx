import {
  AGENT_STATUS_LABELS,
  BOOKING_STATUS_LABELS,
  CASE_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  KYC_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  SCREENING_STATUS_LABELS,
  SETTLEMENT_ITEM_STATUS_LABELS,
  URGENCY_LABELS,
  humanize,
  type AgentStatus,
  type BookingStatus,
  type CaseStatus,
  type DocumentStatus,
  type KycStatus,
  type OrderStatus,
  type PayoutStatus,
  type QuoteStatus,
  type ScreeningStatus,
  type SettlementItemStatus,
  type Urgency,
} from '@hig/shared/api';
import { formatMoney } from '../../lib/shared';
import { Badge, type BadgeTone } from './core';

type Kind =
  | 'case'
  | 'quote'
  | 'booking'
  | 'screening'
  | 'kyc'
  | 'agent'
  | 'document'
  | 'order'
  | 'settlement'
  | 'payout'
  | 'urgency';

const TONES: Record<Kind, Record<string, BadgeTone>> = {
  case: {
    enquiry: 'info',
    quoted: 'accent',
    accepted: 'warning',
    booked: 'success',
    in_treatment: 'success',
    completed: 'neutral',
    cancelled: 'danger',
    declined: 'danger',
  },
  quote: { draft: 'neutral', sent: 'accent', accepted: 'success', rejected: 'danger', expired: 'neutral', withdrawn: 'neutral' },
  booking: { pending_payment: 'warning', confirmed: 'success', admitted: 'info', completed: 'neutral', cancelled: 'danger' },
  screening: { draft: 'neutral', processing: 'info', completed: 'success', failed: 'danger' },
  kyc: { not_submitted: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger' },
  agent: { pending: 'warning', active: 'success', suspended: 'danger', rejected: 'danger' },
  document: { uploaded: 'info', verified: 'success', rejected: 'danger' },
  order: {
    created: 'neutral',
    pending: 'warning',
    paid: 'success',
    partially_refunded: 'accent',
    refunded: 'accent',
    failed: 'danger',
    expired: 'neutral',
    cancelled: 'neutral',
  },
  settlement: { pending: 'neutral', eligible: 'info', on_hold: 'warning', batched: 'accent', paid: 'success', reversed: 'danger' },
  payout: { queued: 'neutral', processing: 'info', processed: 'success', failed: 'danger', reversed: 'danger' },
  urgency: { routine: 'success', soon: 'info', urgent: 'warning', emergency: 'danger' },
};

const LABELS: Record<Kind, Record<string, string>> = {
  case: CASE_STATUS_LABELS satisfies Record<CaseStatus, string>,
  quote: QUOTE_STATUS_LABELS satisfies Record<QuoteStatus, string>,
  booking: BOOKING_STATUS_LABELS satisfies Record<BookingStatus, string>,
  screening: SCREENING_STATUS_LABELS satisfies Record<ScreeningStatus, string>,
  kyc: KYC_STATUS_LABELS satisfies Record<KycStatus, string>,
  agent: AGENT_STATUS_LABELS satisfies Record<AgentStatus, string>,
  document: DOCUMENT_STATUS_LABELS satisfies Record<DocumentStatus, string>,
  order: ORDER_STATUS_LABELS satisfies Record<OrderStatus, string>,
  settlement: SETTLEMENT_ITEM_STATUS_LABELS satisfies Record<SettlementItemStatus, string>,
  payout: PAYOUT_STATUS_LABELS satisfies Record<PayoutStatus, string>,
  urgency: URGENCY_LABELS satisfies Record<Urgency, string>,
};

export function StatusBadge({ kind, status, className }: { kind: Kind; status: string | null | undefined; className?: string }) {
  if (!status) return null;
  const tone = TONES[kind][status] ?? 'neutral';
  const label = LABELS[kind][status] ?? humanize(status);
  return (
    <Badge tone={tone} className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </Badge>
  );
}

export function Money({
  minor,
  currency,
  className,
  compact,
}: {
  minor: number | null | undefined;
  currency: string | null | undefined;
  className?: string;
  compact?: boolean;
}) {
  return <span className={className ? `tabular-nums ${className}` : 'tabular-nums'}>{formatMoney(minor, currency, undefined, { compact })}</span>;
}
