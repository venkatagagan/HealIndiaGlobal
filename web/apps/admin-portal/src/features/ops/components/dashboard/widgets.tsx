import { useId, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { cn } from '../../lib/format';

/** Section heading used between dashboard blocks. */
export function SectionHeading({
  title,
  description,
  actions,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Card shell matching the shared DataTable card (rounded-xl, soft border). */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  footer,
  labelledBy,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  const autoId = useId();
  const headingId = labelledBy ?? `${autoId}-title`;
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface shadow-card', className)}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h3 id={headingId} className="text-sm font-semibold text-fg">
                {title}
              </h3>
            )}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('flex-1 px-4 py-4 sm:px-5', bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-border px-4 py-2.5 text-sm sm:px-5">{footer}</footer>}
    </section>
  );
}

/** Small info icon that reveals an explanation on hover and keyboard focus. */
export function InfoTip({ text, label = 'About this metric' }: { text: string; label?: string }) {
  const id = useId();
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="rounded-full text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-30 mt-1.5 w-60 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal leading-relaxed text-fg opacity-0 shadow-lg transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** Signed change vs the previous period; color = direction x whether up is good. */
export function Delta({
  current,
  previous,
  kind = 'ratio',
  upIsGood = true,
  suffix,
}: {
  current: number;
  previous: number;
  /** ratio: relative %, points: percentage-point difference of two 0..1 rates */
  kind?: 'ratio' | 'points';
  upIsGood?: boolean;
  suffix?: string;
}) {
  let text: string;
  let dir: 1 | 0 | -1;
  if (kind === 'points') {
    const diff = (current - previous) * 100;
    dir = Math.abs(diff) < 0.05 ? 0 : diff > 0 ? 1 : -1;
    text = dir === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} pts`;
  } else if (previous === 0) {
    dir = current > 0 ? 1 : 0;
    text = current > 0 ? 'New' : 'No change';
  } else {
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    dir = Math.abs(pct) < 0.5 ? 0 : pct > 0 ? 1 : -1;
    text = dir === 0 ? 'No change' : `${pct > 0 ? '+' : ''}${Math.abs(pct) >= 100 ? Math.round(pct) : pct.toFixed(1)}%`;
  }
  const good = dir === 0 ? null : (dir === 1) === upIsGood;
  const Icon = dir === 1 ? ArrowUpRight : dir === -1 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold',
          good === null && 'bg-neutral-soft text-neutral-ink',
          good === true && 'bg-success-soft text-success-ink',
          good === false && 'bg-danger-soft text-danger-ink',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {text}
      </span>
      {suffix && <span className="text-muted">{suffix}</span>}
    </span>
  );
}

/** "35 min" / "5 h" / "3 d" since an ISO timestamp. */
export function ageText(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function hoursSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return (now - new Date(iso).getTime()) / 3_600_000;
}
