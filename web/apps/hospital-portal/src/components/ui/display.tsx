import type { ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Star } from 'lucide-react';
import { errorMessage, humanize } from '@hig/shared/api';
import { cn } from '../../lib/format';
import { Button } from './controls';

// ------------------------------------------------------------------------------------------------ Card
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-surface shadow-card',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

// ------------------------------------------------------------------------------------------------ Badges
export type Tone = 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'violet';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  green: 'bg-success-soft text-success-ink',
  blue: 'bg-info-soft text-info-ink',
  amber: 'bg-warning-soft text-warning-ink',
  red: 'bg-danger-soft text-danger-ink',
  violet: 'bg-accent-soft text-accent-ink',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  // generic
  active: 'green',
  approved: 'green',
  verified: 'green',
  completed: 'green',
  paid: 'green',
  processed: 'green',
  done: 'green',
  published: 'green',
  accepted: 'green',
  confirmed: 'green',
  booked: 'green',
  eligible: 'blue',
  // in progress
  enquiry: 'blue',
  quoted: 'violet',
  sent: 'violet',
  admitted: 'violet',
  in_treatment: 'violet',
  processing: 'blue',
  scheduled: 'blue',
  invitation_issued: 'violet',
  applied: 'blue',
  batched: 'blue',
  queued: 'blue',
  in_progress: 'blue',
  requested: 'blue',
  // waiting
  pending: 'amber',
  pending_review: 'amber',
  pending_payment: 'amber',
  draft: 'neutral',
  not_started: 'neutral',
  not_submitted: 'neutral',
  documents_pending: 'amber',
  on_hold: 'amber',
  uploaded: 'amber',
  soon: 'amber',
  routine: 'green',
  // bad
  rejected: 'red',
  declined: 'red',
  cancelled: 'red',
  suspended: 'red',
  failed: 'red',
  reversed: 'red',
  expired: 'neutral',
  withdrawn: 'neutral',
  urgent: 'red',
  emergency: 'red',
  hidden: 'neutral',
  disabled: 'neutral',
};

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <Badge>—</Badge>;
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{label ?? humanize(status)}</Badge>;
}

// ------------------------------------------------------------------------------------------------ States
export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={cn('h-5 w-5 animate-spin text-primary', className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="h-7 w-7" />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-border', className)} aria-hidden />;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 rounded-full bg-surface-2 p-3 text-muted">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Could not load this',
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="mb-3 rounded-full bg-danger-soft p-3 text-danger-ink">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Page header / stats
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** StatCard: solid gradient icon tile + accent bar per tone */
const STAT_TONES: Record<Tone, { tile: string; bar: string }> = {
  green: { tile: 'from-emerald-500 to-green-700 shadow-emerald-700/25', bar: 'from-emerald-400 to-green-600' },
  blue: { tile: 'from-sky-500 to-blue-700 shadow-blue-700/25', bar: 'from-sky-400 to-blue-600' },
  amber: { tile: 'from-amber-400 to-orange-600 shadow-orange-700/25', bar: 'from-amber-300 to-orange-500' },
  red: { tile: 'from-rose-500 to-red-700 shadow-red-700/25', bar: 'from-rose-400 to-red-600' },
  violet: { tile: 'from-violet-500 to-purple-700 shadow-violet-700/25', bar: 'from-violet-400 to-purple-600' },
  neutral: { tile: 'from-slate-500 to-slate-700 shadow-slate-700/25', bar: 'from-slate-300 to-slate-500' },
};

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'green',
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const solid = STAT_TONES[tone];
  return (
    <Card className="relative min-w-0 overflow-hidden p-4 transition hover:shadow-raised sm:p-5">
      <span className={cn('absolute inset-x-0 top-0 h-1 bg-linear-to-r', solid.bar)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold leading-tight tracking-tight text-fg tabular-nums sm:text-[1.75rem]">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {icon && (
          <div className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-md [&_svg]:size-5', solid.tile)}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

export function DescriptionList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">{item.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-fg">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

// ------------------------------------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 overflow-x-auto border-b border-border', className)}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'border-primary text-primary-ink'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total?: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm"
    >
      <span className="text-muted">
        Page {page} of {pages}
        {total !== undefined && ` · ${total} total`}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft className="h-4 w-4" aria-hidden />}
        >
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

// ------------------------------------------------------------------------------------------------ Rating
export function Stars({ value, size = 'sm' }: { value: number | null | undefined; size?: 'sm' | 'md' }) {
  const v = value ?? 0;
  const cls = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(cls, i <= Math.round(v) ? 'fill-amber-400 text-amber-400' : 'text-border-strong')}
        />
      ))}
    </span>
  );
}

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return src ? (
    <img src={src} alt="" className={cn('h-9 w-9 rounded-full object-cover', className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink',
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}

export function Alert({
  tone = 'blue',
  title,
  children,
  icon,
  actions,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div role="status" className={cn('flex flex-wrap items-start gap-3 rounded-xl px-4 py-3', toneClass[tone])}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-0.5 text-sm opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
