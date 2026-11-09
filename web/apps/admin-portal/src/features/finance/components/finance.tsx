/**
 * Finance-specific display helpers: money, status badges, enum selects, reason prompts and URL-backed
 * filter state.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage, humanize } from '@hig/shared/api';
import { cn, formatMoney, useDebouncedValue } from '../lib/shared';
import { Badge, Button, Field, Input, Modal, Select, Textarea, type Tone } from './ui';

// ---------------------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------------------
/** All amounts are integer minor units; rendering always goes through formatMoney(minor, currency). */
export function Money({ minor, currency, className, signed = false, muted = false }: {
  minor: number | null | undefined;
  currency: string | null | undefined;
  className?: string;
  /** color negatives red (clawbacks, credits) */
  signed?: boolean;
  muted?: boolean;
}) {
  const negative = typeof minor === 'number' && minor < 0;
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        signed && negative && 'text-red-600 dark:text-red-400',
        muted && 'text-slate-500 dark:text-slate-400',
        className,
      )}
    >
      {formatMoney(minor, currency)}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------------------------------------
const STATUS_TONES: Record<string, Tone> = {
  // orders / payments
  created: 'neutral',
  pending: 'warning',
  paid: 'success',
  captured: 'success',
  authorized: 'info',
  partially_refunded: 'accent',
  refunded: 'accent',
  failed: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
  // refunds
  requested: 'warning',
  approved: 'info',
  processing: 'info',
  processed: 'success',
  rejected: 'danger',
  // settlements
  eligible: 'info',
  on_hold: 'danger',
  batched: 'accent',
  reversed: 'neutral',
  draft: 'neutral',
  pending_approval: 'warning',
  completed: 'success',
  partially_failed: 'danger',
  queued: 'warning',
  needs_reconciliation: 'danger',
  // accounts
  active: 'success',
  disabled: 'neutral',
};

export function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {humanize(status)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Enum select
// ---------------------------------------------------------------------------------------------------------
export function EnumSelect<T extends string>({
  id,
  value,
  onChange,
  values,
  labels,
  allLabel = 'All',
  includeAll = true,
  disabled,
  className,
}: {
  id?: string;
  value: T | '' | undefined;
  onChange: (value: T | '') => void;
  values: readonly T[];
  labels?: Partial<Record<T, string>>;
  allLabel?: string;
  includeAll?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      id={id}
      value={value ?? ''}
      disabled={disabled}
      className={className}
      onChange={(e) => onChange(e.target.value as T | '')}
    >
      {includeAll && <option value="">{allLabel}</option>}
      {values.map((v) => (
        <option key={v} value={v}>
          {labels?.[v] ?? humanize(v)}
        </option>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Reason prompt (hold, reject, mark failed ...)
// ---------------------------------------------------------------------------------------------------------
export function ReasonDialog({
  open,
  title,
  description,
  label = 'Reason',
  confirmLabel,
  confirmVariant = 'danger',
  required = true,
  maxLength = 500,
  loading,
  onConfirm,
  onClose,
  singleLine,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  label?: string;
  confirmLabel: string;
  confirmVariant?: 'danger' | 'primary' | 'accent';
  required?: boolean;
  maxLength?: number;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  /** single-line input (e.g. a UTR) instead of a textarea */
  singleLine?: boolean;
  /** extra content above the field */
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm">
      {open && (
        <ReasonForm
          label={label}
          confirmLabel={confirmLabel}
          confirmVariant={confirmVariant}
          required={required}
          maxLength={maxLength}
          loading={loading}
          onConfirm={onConfirm}
          onCancel={onClose}
          singleLine={singleLine}
        >
          {children}
        </ReasonForm>
      )}
    </Modal>
  );
}

function ReasonForm({ label, confirmLabel, confirmVariant, required, maxLength, loading, onConfirm, onCancel, singleLine, children }: {
  label: string;
  confirmLabel: string;
  confirmVariant: 'danger' | 'primary' | 'accent';
  required: boolean;
  maxLength: number;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  singleLine?: boolean;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const trimmed = reason.trim();
  const error = touched && required && !trimmed ? `${label} is required` : null;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (required && !trimmed) return;
        onConfirm(trimmed);
      }}
    >
      {children}
      <Field label={label} required={required} error={error} hint={singleLine ? undefined : `${trimmed.length}/${maxLength}`}>
        {(p) =>
          singleLine ? (
            <Input {...p} value={reason} maxLength={maxLength} autoComplete="off" onChange={(e) => setReason(e.target.value)} />
          ) : (
            <Textarea
              {...p}
              value={reason}
              maxLength={maxLength}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
            />
          )
        }
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" variant={confirmVariant} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Mutations feedback
// ---------------------------------------------------------------------------------------------------------
export function notifyError(error: unknown, fallback?: string): void {
  toast.error(errorMessage(error, fallback));
}

export function notifySuccess(message: string): void {
  toast.success(message);
}

/**
 * Text box state that commits to the URL (or any sink) after the user pauses typing.
 * const [text, setText] = useSearchBox(f.q, (q) => setF({ q }))
 */
export function useSearchBox(committed: string, commit: (value: string) => void, delayMs = 350) {
  const [text, setText] = useState(committed);
  const debounced = useDebouncedValue(text.trim(), delayMs);
  const commitRef = useRef(commit);
  const committedRef = useRef(committed);
  useEffect(() => {
    commitRef.current = commit;
    committedRef.current = committed;
  });
  useEffect(() => {
    if (debounced !== committedRef.current) commitRef.current(debounced);
  }, [debounced]);
  return [text, setText] as const;
}

/** Monospace code / reference text */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs text-slate-600 dark:text-slate-300', className)}>{children}</span>;
}
