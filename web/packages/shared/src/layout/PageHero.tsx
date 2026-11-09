import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { BrandMark } from './Brand';

export interface PageHeroProps {
  /** small line above the title (date, section name, ...) */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** buttons / links; style them with heroActionClass() */
  actions?: ReactNode;
  /** right-hand side (e.g. a few <HeroStat>s) */
  aside?: ReactNode;
  /** extra content under the description (search box, chips, ...) */
  children?: ReactNode;
  className?: string;
}

/**
 * Brand-gradient welcome banner for dashboards and start pages (white text, AA on every gradient stop) with the
 * lotus mark as a watermark.
 */
export function PageHero({ eyebrow, title, description, actions, aside, children, className }: PageHeroProps) {
  return (
    <section
      className={cn(
        'relative mb-6 overflow-hidden rounded-3xl bg-brand-gradient px-5 py-6 text-white shadow-glow sm:px-8 sm:py-8',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_90%_at_100%_0%,rgb(255_255_255/0.2),transparent_60%),radial-gradient(40%_70%_at_0%_100%,rgb(255_255_255/0.1),transparent_70%)]"
        aria-hidden
      />
      <BrandMark mono className="pointer-events-none absolute -end-8 -top-8 hidden size-56 text-white/10 md:block" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          {eyebrow && <p className="text-sm font-medium text-white/85">{eyebrow}</p>}
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 text-sm text-white/90 sm:text-base">{description}</p>}
          {children}
          {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
        </div>
        {aside}
      </div>
    </section>
  );
}

/** Classes for actions inside <PageHero>: `solid` = white button, `glass` = translucent outline button. */
export function heroActionClass(variant: 'solid' | 'glass' = 'solid', className?: string): string {
  return cn(
    'inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
    variant === 'solid'
      ? 'bg-white text-emerald-800 shadow-raised hover:bg-white/90'
      : 'bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20',
    className,
  );
}

/** Compact KPI on the hero gradient. */
export function HeroStat({ icon, label, value }: { icon?: ReactNode; label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/12 px-4 py-3 ring-1 ring-white/20 backdrop-blur">
      {icon && <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20 [&_svg]:size-5">{icon}</span>}
      <span className="min-w-0">
        <span className="block truncate text-xl font-bold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block truncate text-xs text-white/85">{label}</span>
      </span>
    </div>
  );
}
