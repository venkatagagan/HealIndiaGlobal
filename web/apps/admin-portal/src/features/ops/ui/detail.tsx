/**
 * Detail-page kit for the staff console (case, hospital, ...): a hero header card, a status track, a facts
 * side panel and URL-synced section tabs. Visual language matches the shared DataTable card (rounded-xl,
 * soft border, token colors) so list -> detail feels like one product.
 */
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Check, X } from 'lucide-react';
import { Tabs, type TabItem } from '@hig/shared/ui';
import { cn } from '../lib/format';

export { Panel } from '../components/dashboard/widgets';

// ---------------------------------------------------------------------------------------------------------
// Hero header
// ---------------------------------------------------------------------------------------------------------
export function DetailHero({
  back,
  eyebrow,
  title,
  badges,
  subtitle,
  actions,
  avatar,
  children,
}: {
  back: { to: string; label: string };
  eyebrow?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  avatar?: ReactNode;
  /** below the title row (status track, banners) */
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <Link
        to={back.to}
        className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden /> {back.label}
      </Link>
      <div className="rounded-xl border border-border bg-surface shadow-card">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {avatar}
            <div className="min-w-0">
              {eyebrow && <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
                {badges}
              </div>
              {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children && <div className="border-t border-border px-4 py-4 sm:px-5">{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Status track (horizontal stepper; compact progress line on phones)
// ---------------------------------------------------------------------------------------------------------
export interface TrackStep {
  key: string;
  label: string;
  /** when the step was reached */
  at?: string | null;
}

export function StatusTrack({
  steps,
  current,
  terminal,
}: {
  steps: readonly TrackStep[];
  /** index of the current step (-1 = none reached) */
  current: number;
  /** a closed outcome that ended the flow early (cancelled / declined / rejected) */
  terminal?: { label: string; at?: string | null } | null;
}) {
  const label = terminal ? terminal.label : steps[current]?.label ?? '';
  return (
    <nav aria-label="Progress">
      {/* phones */}
      <div className="sm:hidden">
        <p className="text-xs text-muted">
          {terminal ? (
            <span className="font-medium text-danger-ink">{label}</span>
          ) : (
            <>
              Step {current + 1} of {steps.length} · <span className="font-medium text-fg">{label}</span>
            </>
          )}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span
              key={s.key}
              className={cn('h-1.5 flex-1 rounded-full', i <= current ? (terminal ? 'bg-danger/60' : 'bg-primary') : 'bg-surface-2')}
            />
          ))}
        </div>
      </div>
      {/* tablet+ */}
      <ol className="hidden items-start sm:flex">
        {steps.map((s, i) => {
          const done = i < current || (i === current && i === steps.length - 1 && !terminal);
          const active = i === current && !done;
          const stopped = terminal && i === current + 1;
          return (
            <li key={s.key} aria-current={active ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span
                  className={cn('absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2', i <= current ? 'bg-primary' : 'bg-border')}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done && 'border-primary bg-primary text-primary-fg',
                  active && 'border-primary bg-surface text-primary-ink ring-4 ring-primary/15',
                  stopped && 'border-danger bg-danger text-white',
                  !done && !active && !stopped && 'border-border bg-surface text-muted',
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : stopped ? <X className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn('mt-1.5 px-1 text-xs font-medium', done || active ? 'text-fg' : stopped ? 'text-danger-ink' : 'text-muted')}>
                {stopped ? terminal.label : s.label}
              </span>
              {(stopped ? terminal.at : s.at) && (
                <span className="px-1 text-[11px] text-muted">{stopped ? terminal.at : s.at}</span>
              )}
              <span className="sr-only">{done ? ' (done)' : active ? ' (current)' : ''}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Facts list for side panels
// ---------------------------------------------------------------------------------------------------------
export function FactList({ items }: { items: readonly { label: string; value: ReactNode; icon?: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {items.map((f) => (
        <div key={f.label} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="flex shrink-0 items-center gap-2 text-muted">
            {f.icon}
            {f.label}
          </dt>
          <dd className="min-w-0 break-words text-right text-fg">{f.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/value grid used inside tab sections. */
export function FieldGrid({ items, columns = 2 }: { items: readonly { label: string; value: ReactNode }[]; columns?: 2 | 3 }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3')}>
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{f.label}</dt>
          <dd className="mt-0.5 break-words text-fg">{f.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Callout banner (emergency, rejection reason, pending approval ...). */
export function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: 'danger' | 'warning' | 'info' | 'success';
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    danger: 'border-danger/40 bg-danger-soft text-danger-ink',
    warning: 'border-warning/40 bg-warning-soft text-warning-ink',
    info: 'border-info/30 bg-info-soft text-info-ink',
    success: 'border-success/40 bg-success-soft text-success-ink',
  } as const;
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center', tones[tone])}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{title}</p>
          {children && <div className="mt-0.5 opacity-90">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// URL-synced section tabs (?tab=)
// ---------------------------------------------------------------------------------------------------------
export function useDetailTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const setTab = (t: T) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === fallback) next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true },
    );
  return [tab, setTab];
}

export function DetailTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (t: T) => void;
  label: string;
}) {
  return <Tabs aria-label={label} idPrefix="detail" tabs={tabs} value={value} onChange={onChange} className="mb-4" />;
}
