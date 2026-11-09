import type { ReactNode } from 'react';

/**
 * Top block of a detail drawer (agent, user, booking): status badges + primary actions, an optional meta
 * line and an optional status track - the drawer counterpart of `DetailHero` on full detail pages.
 */
export function DrawerSummary({
  avatar,
  badges,
  meta,
  actions,
  children,
}: {
  avatar?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  /** below the badge row (status track, banners) */
  children?: ReactNode;
}) {
  return (
    <div className="-mx-5 -mt-4 mb-5 border-b border-border bg-surface-2/60 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {avatar}
          <div className="min-w-0">
            {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
            {meta && <div className="mt-1.5 text-sm text-muted">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  );
}

/** Big number tiles for a drawer (totals, counts). */
export function StatTiles({ items }: { items: readonly { label: string; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'warning' | 'danger' }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <dt className="text-xs text-muted">{t.label}</dt>
          <dd
            className={
              t.tone === 'success'
                ? 'mt-0.5 font-semibold tabular-nums text-success-ink'
                : t.tone === 'warning'
                  ? 'mt-0.5 font-semibold tabular-nums text-warning-ink'
                  : t.tone === 'danger'
                    ? 'mt-0.5 font-semibold tabular-nums text-danger-ink'
                    : 'mt-0.5 font-semibold tabular-nums text-fg'
            }
          >
            {t.value}
          </dd>
          {t.hint && <dd className="text-[11px] text-muted">{t.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
