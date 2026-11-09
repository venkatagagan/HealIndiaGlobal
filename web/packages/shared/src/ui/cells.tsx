import { useState, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/cn';
import { formatDate, formatDateTime, formatRelative, toDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { StatusBadge, type StatusKind } from './Badge';
import { Avatar } from './display';
import type { BadgeTone } from './Badge';

/**
 * Small, consistent cell renderers for DataTable columns (also fine anywhere else):
 *   cell: (r) => <MoneyCell minor={r.total_minor} currency={r.currency} />   (+ column align: 'end')
 */

export interface StatusBadgeCellProps {
  status: string | null | undefined;
  kind?: StatusKind;
  label?: ReactNode;
  tone?: BadgeTone;
}

export function StatusBadgeCell({ status, kind, label, tone }: StatusBadgeCellProps) {
  if (!status) return <span className="text-muted">—</span>;
  return <StatusBadge status={status} kind={kind} label={label} tone={tone} />;
}

export interface MoneyCellProps {
  /** integer minor units */
  minor: number | null | undefined;
  currency: string | null | undefined;
  /** small muted line under the amount (e.g. "3 installments") */
  secondary?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** Right-aligned tabular amount (pair with `align: 'end'` on the column). */
export function MoneyCell({ minor, currency, secondary, compact, className }: MoneyCellProps) {
  const empty = minor === null || minor === undefined || Number.isNaN(minor);
  return (
    <span className={cn('block text-end tabular-nums', className)}>
      <span className={cn('font-medium whitespace-nowrap', empty && 'font-normal text-muted')}>
        {empty ? '—' : formatMoney(minor, currency, undefined, compact ? { compact: true } : undefined)}
      </span>
      {secondary && <span className="block text-xs text-muted">{secondary}</span>}
    </span>
  );
}

export interface DateCellProps {
  value: string | number | Date | null | undefined;
  /** "relative" (default for activity columns): "3 hours ago" with the absolute date as tooltip;
   *  "date" / "datetime": absolute with the relative time as tooltip */
  display?: 'relative' | 'date' | 'datetime';
  /** muted second line (e.g. the relative time under an absolute date) */
  secondary?: ReactNode;
  className?: string;
}

export function DateCell({ value, display = 'date', secondary, className }: DateCellProps) {
  const date = toDate(value);
  if (!date) return <span className="text-muted">—</span>;
  const absolute = display === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(date) : formatDateTime(date);
  const relative = formatRelative(date);
  const text = display === 'relative' ? relative : display === 'datetime' ? formatDateTime(date) : formatDate(date);
  return (
    <span className={cn('block whitespace-nowrap', className)}>
      <time dateTime={date.toISOString()} title={display === 'relative' ? absolute : relative} className="tabular-nums">
        {text}
      </time>
      {secondary && <span className="block text-xs text-muted">{secondary}</span>}
    </span>
  );
}

export interface PersonCellProps {
  name: string | null | undefined;
  /** muted second line: email, nationality, agency … */
  secondary?: ReactNode;
  /** initials avatar (default true) */
  avatar?: boolean;
  src?: string | null;
  className?: string;
}

export function PersonCell({ name, secondary, avatar = true, src, className }: PersonCellProps) {
  if (!name) return <span className="text-muted">—</span>;
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      {avatar && <Avatar name={name} src={src ?? undefined} alt="" size="sm" className="shrink-0" />}
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg">{name}</span>
        {secondary && <span className="block truncate text-xs text-muted">{secondary}</span>}
      </span>
    </span>
  );
}

export interface IdCellProps {
  value: string | null | undefined;
  /** copy button (default true) */
  copy?: boolean;
  /** muted second line */
  secondary?: ReactNode;
  className?: string;
}

/** Monospace identifier (case number, reference) with a copy button that doesn't trigger the row click. */
export function IdCell({ value, copy = true, secondary, className }: IdCellProps) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted">—</span>;
  const onCopy = async (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <span className={cn('group/id block min-w-0', className)}>
      <span className="flex items-center gap-1">
        <span className="truncate font-mono text-[13px] font-medium text-fg">{value}</span>
        {copy && (
          <button
            type="button"
            onClick={onCopy}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Copy ${value}`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity group-hover/id:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? <Check className="size-3.5 text-success-ink" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          </button>
        )}
      </span>
      {secondary && <span className="block truncate text-xs text-muted">{secondary}</span>}
    </span>
  );
}

/** Two-line text cell: primary + muted secondary (hospital + procedure, …). */
export function TextCell({ primary, secondary, className }: { primary: ReactNode; secondary?: ReactNode; className?: string }) {
  return (
    <span className={cn('block min-w-0', className)}>
      <span className="block truncate text-fg">{primary ?? <span className="text-muted">—</span>}</span>
      {secondary && <span className="block truncate text-xs text-muted">{secondary}</span>}
    </span>
  );
}
