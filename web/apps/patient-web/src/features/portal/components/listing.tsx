/**
 * Patient-portal helpers around the shared list toolkit (@hig/shared/ui: DataTable, FilterBar, QuickFilters …).
 * Plain-language status labels, the tabs strip, a sort menu for card lists and a card surface that matches the
 * DataTable card, so card grids (matches, saved items) share the same look as tables.
 */
import type { ReactNode } from 'react';
import { ArrowDownUp, Check, ChevronDown } from 'lucide-react';
import { cn } from '@hig/shared/lib';
import {
  EmptyState,
  Popover,
  QuickFilters,
  StatusBadge,
  usePopover,
  type QuickFilterItem,
  type StatusKind,
} from '@hig/shared/ui';

/** Patient-friendly wording for workflow statuses (the shared labels are written for staff). */
const PATIENT_LABELS: Partial<Record<StatusKind, Record<string, string>>> = {
  case: {
    enquiry: 'Waiting for quote',
    quoted: 'Quote received',
    accepted: 'Quote accepted',
    booked: 'Booked',
    in_treatment: 'In treatment',
    completed: 'Completed',
    cancelled: 'Cancelled',
    declined: 'Declined by hospital',
  },
  booking: { pending_payment: 'Awaiting payment', confirmed: 'Confirmed', admitted: 'Admitted', completed: 'Completed', cancelled: 'Cancelled' },
  order: {
    created: 'Not completed',
    pending: 'Processing',
    paid: 'Paid',
    partially_refunded: 'Partly refunded',
    refunded: 'Refunded',
    failed: 'Failed',
    expired: 'Expired',
    cancelled: 'Cancelled',
  },
  quote: { sent: 'Awaiting your decision', accepted: 'Accepted', rejected: 'Declined', expired: 'Expired', withdrawn: 'Withdrawn' },
  screening: { draft: 'Not finished', processing: 'Analysing', completed: 'Matches ready', failed: 'Failed' },
  document: { uploaded: 'Uploaded', verified: 'Verified', rejected: 'Needs a new copy' },
};

export function patientStatusLabel(status: string, kind: StatusKind): string | undefined {
  return PATIENT_LABELS[kind]?.[status];
}

/** Status badge with the patient wording. */
export function PatientStatus({ status, kind, className }: { status: string | null | undefined; kind: StatusKind; className?: string }) {
  if (!status) return <span className="text-muted">—</span>;
  return <StatusBadge status={status} kind={kind} label={patientStatusLabel(status, kind)} className={className} />;
}

/** QuickFilters in the DataTable `header` slot (tabs strip with a bottom border). */
export function TableTabs<V extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly QuickFilterItem<V>[];
  value: V | '' | null;
  onChange: (value: V | '') => void;
}) {
  return (
    <div className="border-b border-border px-2 sm:px-3">
      <QuickFilters label={label} items={items} value={value} onChange={onChange} />
    </div>
  );
}

/** Value of a single-status tab strip for a multi-status filter: '' = all, null = custom selection. */
export function quickValue<V extends string>(selected: readonly V[], tabs: readonly V[]): V | '' | null {
  if (selected.length === 0) return '';
  if (selected.length === 1 && tabs.includes(selected[0]!)) return selected[0]!;
  return null;
}

/** Count rows per value (client-side lists). */
export function countBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** Inclusive YYYY-MM-DD range check on an ISO date/datetime (local calendar date). */
export function inDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const d = new Date(value);
  const day = Number.isNaN(d.getTime())
    ? value.slice(0, 10)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (!from || day >= from) && (!to || day <= to);
}

export interface SortOption<V extends string> {
  value: V;
  label: string;
}

/**
 * Sort menu for card lists (toolkit gap: FilterBar has no sort control because DataTable sorts via headers).
 * Rendered as a pill like the filters; place it in FilterBar `actions`.
 */
export function SortMenu<V extends string>({
  value,
  options,
  onChange,
  label = 'Sort',
}: {
  value: V;
  options: readonly SortOption<V>[];
  onChange: (value: V) => void;
  label?: string;
}) {
  const pop = usePopover();
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <>
      <button
        type="button"
        {...pop.triggerProps}
        aria-haspopup="listbox"
        aria-label={`${label}: ${current?.label ?? ''}`}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-medium text-fg/80 shadow-xs transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowDownUp className="size-3.5 opacity-70" aria-hidden />
        <span className="hidden sm:inline">{label}:</span>
        <span className="font-semibold text-fg">{current?.label}</span>
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </button>
      <Popover {...pop.popoverProps} align="end" role="listbox" label={label} className="w-56 p-1">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => {
                onChange(o.value);
                pop.setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <Check className={cn('size-4 shrink-0 text-primary-ink', !selected && 'invisible')} aria-hidden />
              {o.label}
            </button>
          );
        })}
      </Popover>
    </>
  );
}

/** Card surface identical to the DataTable card (for card grids that use the same tabs + filter bar). */
export function ListSurface({
  header,
  toolbar,
  children,
  footer,
  className,
}: {
  header?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-surface shadow-card', className)}>
      {header}
      {toolbar ? <div className="border-b border-border px-3 py-3 sm:px-4">{toolbar}</div> : null}
      {children}
      {footer ? <div className="border-t border-border px-3 py-2.5 text-sm text-muted sm:px-4">{footer}</div> : null}
    </div>
  );
}

/** Empty states for card lists: "nothing yet" vs "no matches" (+ reset). */
export function ListEmpty({
  filtered,
  onReset,
  icon,
  title,
  description,
  action,
}: {
  filtered: boolean;
  onReset: () => void;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  if (filtered) {
    return (
      <EmptyState
        className="py-12"
        title="No matching results"
        description="Try a different search or remove a filter."
        action={
          <button
            type="button"
            onClick={onReset}
            className="h-9 rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reset filters
          </button>
        }
      />
    );
  }
  return <EmptyState className="py-12" icon={icon} title={title} description={description} action={action} />;
}
