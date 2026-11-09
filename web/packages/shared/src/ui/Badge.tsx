import type { ComponentProps, ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  AGENT_STATUS_LABELS,
  BOOKING_STATUS_LABELS,
  CASE_STATUS_LABELS,
  CHECKLIST_STATUS_LABELS,
  CONSULTATION_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  HOSPITAL_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
  ITINERARY_STATUS_LABELS,
  JOB_STATUS_LABELS,
  KYC_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYOUT_ACCOUNT_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SCREENING_STATUS_LABELS,
  SERVICE_BOOKING_STATUS_LABELS,
  SETTLEMENT_BATCH_STATUS_LABELS,
  SETTLEMENT_ITEM_STATUS_LABELS,
  SOS_STATUS_LABELS,
  URGENCY_LABELS,
  USER_STATUS_LABELS,
  VISA_STATUS_LABELS,
  humanize,
} from '../api/enums';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { normalizeTone, TONE_SOFT, TONE_SOLID, type SemanticTone, type Tone } from './tone';

// -----------------------------------------------------------------------------------------------------------
// Badge
// -----------------------------------------------------------------------------------------------------------
export type BadgeTone = Tone;

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  /** small coloured dot before the label */
  dot?: boolean;
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', size = 'sm', dot = false, icon, className, children, ...rest }: BadgeProps) {
  const t = normalizeTone(tone);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ring-current/15',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        TONE_SOFT[t],
        className,
      )}
      {...rest}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', TONE_SOLID[t])} aria-hidden />}
      {icon}
      {/* svgs are display:block (preflight): keep icons passed as children inline with the label */}
      <span className="truncate [&_svg]:-mt-0.5 [&_svg]:me-1 [&_svg]:inline-block [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:align-middle">
        {children}
      </span>
    </span>
  );
}

// -----------------------------------------------------------------------------------------------------------
// StatusBadge: every PLAN section 5 status enum -> colour + label
// -----------------------------------------------------------------------------------------------------------
export type StatusKind =
  | 'user'
  | 'kyc'
  | 'hospital'
  | 'agent'
  | 'screening'
  | 'urgency'
  | 'case'
  | 'quote'
  | 'booking'
  | 'consultation'
  | 'checklist'
  | 'itinerary'
  | 'visa'
  | 'serviceBooking'
  | 'sos'
  | 'document'
  | 'order'
  | 'payment'
  | 'refund'
  | 'installment'
  | 'settlementItem'
  /** alias of settlementItem */
  | 'settlement'
  | 'settlementBatch'
  | 'payout'
  | 'payoutAccount'
  | 'job'
  | 'review';

/** Default tone per status value (used when no `kind` is given or the kind has no override). */
export const STATUS_TONES: Readonly<Record<string, SemanticTone>> = {
  // positive / done
  active: 'success',
  approved: 'success',
  completed: 'success',
  verified: 'success',
  paid: 'success',
  captured: 'success',
  processed: 'success',
  succeeded: 'success',
  done: 'success',
  confirmed: 'success',
  booked: 'success',
  published: 'success',
  resolved: 'success',
  accepted: 'success',
  // in progress
  processing: 'info',
  in_progress: 'info',
  in_treatment: 'info',
  admitted: 'info',
  scheduled: 'info',
  sent: 'info',
  quoted: 'info',
  applied: 'info',
  invitation_issued: 'info',
  authorized: 'info',
  running: 'info',
  eligible: 'info',
  soon: 'info',
  uploaded: 'info',
  batched: 'accent',
  enquiry: 'accent',
  // needs attention
  pending: 'warning',
  pending_review: 'warning',
  pending_verification: 'warning',
  pending_payment: 'warning',
  pending_approval: 'warning',
  documents_pending: 'warning',
  on_hold: 'warning',
  due: 'warning',
  partially_refunded: 'warning',
  partially_failed: 'warning',
  requested: 'warning',
  acknowledged: 'warning',
  urgent: 'warning',
  // negative
  rejected: 'danger',
  failed: 'danger',
  suspended: 'danger',
  declined: 'danger',
  overdue: 'danger',
  dead: 'danger',
  reversed: 'danger',
  emergency: 'danger',
  open: 'danger',
  // neutral / inactive
  draft: 'neutral',
  not_started: 'neutral',
  not_submitted: 'neutral',
  cancelled: 'neutral',
  expired: 'neutral',
  withdrawn: 'neutral',
  refunded: 'neutral',
  hidden: 'neutral',
  disabled: 'neutral',
  deleted: 'neutral',
  created: 'neutral',
  queued: 'neutral',
  routine: 'neutral',
};

/** Per-enum overrides where the same value means something different. */
const KIND_TONES: Partial<Record<StatusKind, Readonly<Record<string, SemanticTone>>>> = {
  case: { accepted: 'warning', completed: 'success', cancelled: 'neutral' },
  settlementItem: { pending: 'neutral', paid: 'success' },
  settlement: { pending: 'neutral', paid: 'success' },
  checklist: { pending: 'neutral' },
  refund: { approved: 'info' },
  settlementBatch: { approved: 'info' },
  order: { pending: 'warning', created: 'neutral' },
};

const KIND_LABELS: Record<StatusKind, Readonly<Record<string, string>>> = {
  user: USER_STATUS_LABELS,
  kyc: KYC_STATUS_LABELS,
  hospital: HOSPITAL_STATUS_LABELS,
  agent: AGENT_STATUS_LABELS,
  screening: SCREENING_STATUS_LABELS,
  urgency: URGENCY_LABELS,
  case: CASE_STATUS_LABELS,
  quote: QUOTE_STATUS_LABELS,
  booking: BOOKING_STATUS_LABELS,
  consultation: CONSULTATION_STATUS_LABELS,
  checklist: CHECKLIST_STATUS_LABELS,
  itinerary: ITINERARY_STATUS_LABELS,
  visa: VISA_STATUS_LABELS,
  serviceBooking: SERVICE_BOOKING_STATUS_LABELS,
  sos: SOS_STATUS_LABELS,
  document: DOCUMENT_STATUS_LABELS,
  order: ORDER_STATUS_LABELS,
  payment: PAYMENT_STATUS_LABELS,
  refund: REFUND_STATUS_LABELS,
  installment: INSTALLMENT_STATUS_LABELS,
  settlementItem: SETTLEMENT_ITEM_STATUS_LABELS,
  settlement: SETTLEMENT_ITEM_STATUS_LABELS,
  settlementBatch: SETTLEMENT_BATCH_STATUS_LABELS,
  payout: PAYOUT_STATUS_LABELS,
  payoutAccount: PAYOUT_ACCOUNT_STATUS_LABELS,
  job: JOB_STATUS_LABELS,
  review: REVIEW_STATUS_LABELS,
};

const TONE_NAMES = new Set<string>([
  'neutral',
  'primary',
  'success',
  'info',
  'warning',
  'danger',
  'accent',
  'green',
  'blue',
  'amber',
  'red',
  'violet',
  'gray',
  'slate',
]);

/** Colour tone for a status value (optionally of a specific enum). */
export function statusTone(status: string | null | undefined, kind?: StatusKind): SemanticTone {
  if (!status) return 'neutral';
  const override = kind ? KIND_TONES[kind]?.[status] : undefined;
  if (override) return override;
  if (STATUS_TONES[status]) return STATUS_TONES[status];
  if (TONE_NAMES.has(status)) return normalizeTone(status as Tone);
  return 'neutral';
}

/** Human label for a status value: the enum's label map when `kind` is given, else humanized. */
export function statusLabel(status: string | null | undefined, kind?: StatusKind): string {
  if (!status) return '';
  return (kind ? KIND_LABELS[kind][status] : undefined) ?? humanize(status);
}

export interface StatusBadgeProps {
  status: string | null | undefined;
  /** which enum the value belongs to (better labels/colours for ambiguous values like "pending") */
  kind?: StatusKind;
  /** override the label */
  label?: ReactNode;
  /** override the colour */
  tone?: BadgeTone;
  /** coloured dot before the label (default true) */
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, kind, label, tone, dot = true, size = 'sm', className }: StatusBadgeProps) {
  const { t } = useCommonTranslation();
  if (!status) return null;
  const text = label ?? t(`status.${status}`, { defaultValue: statusLabel(status, kind) });
  return (
    <Badge tone={tone ?? statusTone(status, kind)} dot={dot} size={size} className={className}>
      {text}
    </Badge>
  );
}

// -----------------------------------------------------------------------------------------------------------
// Chip: selectable / removable pill (filters, multi-select answers)
// -----------------------------------------------------------------------------------------------------------
export interface ChipProps extends Omit<ComponentProps<'button'>, 'onClick'> {
  selected?: boolean;
  onClick?: () => void;
  /** shows a remove (x) button */
  onRemove?: () => void;
  /** accessible label of the remove button */
  removeLabel?: string;
  icon?: ReactNode;
  size?: 'sm' | 'md';
}

export function Chip({
  selected = false,
  onClick,
  onRemove,
  removeLabel,
  icon,
  size = 'md',
  className,
  children,
  disabled,
  ...rest
}: ChipProps) {
  const { t } = useCommonTranslation();
  const base = cn(
    'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
    size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
    selected
      ? 'border-primary bg-primary-soft text-primary-ink'
      : 'border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
    disabled && 'pointer-events-none opacity-50',
    className,
  );
  if (!onClick && onRemove) {
    return (
      <span className={base}>
        {icon}
        {children}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="-me-1 inline-flex size-5 items-center justify-center rounded-full hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={removeLabel ?? t('actions.remove')}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg')}
      {...rest}
    >
      {icon}
      {children}
      {onRemove && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-me-1 inline-flex size-5 items-center justify-center rounded-full hover:bg-border"
          aria-label={removeLabel ?? t('actions.remove')}
        >
          <X className="size-3.5" aria-hidden />
        </span>
      )}
    </button>
  );
}
