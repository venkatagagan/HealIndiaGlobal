import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Check, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatDate, formatDateTime, formatRelative, formatTime, toDate } from '../lib/dates';
import { useCommonTranslation } from '../lib/i18n';
import { formatMoney, type FormatMoneyOptions } from '../lib/money';
import { Skeleton } from './feedback';
import { normalizeTone, TONE_SOFT, type Tone } from './tone';

// -----------------------------------------------------------------------------------------------------------
// PageHeader
// -----------------------------------------------------------------------------------------------------------
export interface Breadcrumb {
  label: ReactNode;
  to?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** right-aligned buttons */
  actions?: ReactNode;
  breadcrumbs?: readonly Breadcrumb[];
  /** small "back" link above the title */
  back?: { to: string; label?: ReactNode };
  /** badges etc. next to the title */
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, breadcrumbs, back, meta, className }: PageHeaderProps) {
  const { t } = useCommonTranslation();
  return (
    <header className={cn('mb-6 flex flex-col gap-3', className)}>
      {back && (
        <Link
          to={back.to}
          className="inline-flex w-fit items-center gap-1 rounded text-sm font-medium text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label ?? t('actions.back')}
        </Link>
      )}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
            {breadcrumbs.map((crumb, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
                {crumb.to && i < breadcrumbs.length - 1 ? (
                  <Link to={crumb.to} className="hover:text-fg hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
            {meta}
          </div>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------------------------------------------
// StatCard (KPI tile)
// -----------------------------------------------------------------------------------------------------------
export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  /** change vs previous period, in percent (positive = up) */
  trend?: { value: number; label?: ReactNode; /** true when "down" is good (e.g. refunds) */ invert?: boolean };
  loading?: boolean;
  /** makes the tile a link */
  to?: string;
  onClick?: () => void;
  className?: string;
}

export function StatCard({ label, value, hint, icon, tone = 'primary', trend, loading = false, to, onClick, className }: StatCardProps) {
  const toneClass = TONE_SOFT[normalizeTone(tone)];
  const positive = trend ? (trend.invert ? trend.value <= 0 : trend.value >= 0) : true;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', toneClass)}>{icon}</div>}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight text-fg">{value}</p>
      )}
      {(trend || hint) && !loading && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {trend && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium', positive ? 'text-success-ink' : 'text-danger-ink')}>
              {trend.value >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
              {`${trend.value >= 0 ? '+' : ''}${Number(trend.value.toFixed(1))}%`}
              {trend.label && <span className="font-normal text-muted">{trend.label}</span>}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </>
  );
  const classes = cn(
    'block rounded-xl border border-border bg-surface p-4 text-start shadow-card sm:p-5',
    (to || onClick) &&
      'w-full transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  );
  if (to) {
    return (
      <Link to={to} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}

// -----------------------------------------------------------------------------------------------------------
// Avatar
// -----------------------------------------------------------------------------------------------------------
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const AVATAR_SIZES: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
};

const AVATAR_COLORS = [
  'bg-primary-soft text-primary-ink',
  'bg-accent-soft text-accent-ink',
  'bg-info-soft text-info-ink',
  'bg-warning-soft text-warning-ink',
  'bg-danger-soft text-danger-ink',
];

/** "Asha Rao" -> "AR" */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** alt text (default: name) */
  alt?: string;
}

export function Avatar({ name, src, size = 'md', className, alt }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = Boolean(src) && failed !== src;
  const colour = AVATAR_COLORS[Math.abs(hashCode(name ?? '')) % AVATAR_COLORS.length];
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold',
        AVATAR_SIZES[size],
        !showImage && colour,
        className,
      )}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : (alt ?? name ?? undefined)}
    >
      {showImage ? (
        <img src={src ?? undefined} alt={alt ?? name ?? ''} className="size-full object-cover" onError={() => setFailed(src ?? null)} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}

function hashCode(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return hash;
}

// -----------------------------------------------------------------------------------------------------------
// Stepper
// -----------------------------------------------------------------------------------------------------------
export interface StepItem {
  label: ReactNode;
  description?: ReactNode;
}

export interface StepperProps {
  steps: readonly (StepItem | string)[];
  /** 0-based index of the current step; steps before it are complete */
  current: number;
  /** makes completed steps clickable */
  onStepClick?: (index: number) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Stepper({ steps, current, onStepClick, orientation = 'horizontal', className }: StepperProps) {
  const { t } = useCommonTranslation();
  const vertical = orientation === 'vertical';
  return (
    <nav aria-label={t('stepper.progress', { current: Math.min(current + 1, steps.length), total: steps.length })} className={className}>
      <ol className={cn('flex', vertical ? 'flex-col gap-4' : 'items-start gap-2 overflow-x-auto')}>
        {steps.map((raw, index) => {
          const step: StepItem = typeof raw === 'string' ? { label: raw } : raw;
          const done = index < current;
          const active = index === current;
          const clickable = done && Boolean(onStepClick);
          const marker = (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                done && 'border-primary bg-primary text-primary-fg',
                active && 'border-primary bg-surface text-primary-ink',
                !done && !active && 'border-border bg-surface text-muted',
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
          );
          const text = (
            <span className="min-w-0 text-start">
              <span className={cn('block text-sm font-medium', active || done ? 'text-fg' : 'text-muted')}>{step.label}</span>
              {step.description && <span className="block text-xs text-muted">{step.description}</span>}
              <span className="sr-only">{done ? ` (${t('stepper.completed')})` : active ? ` (${t('stepper.current')})` : ''}</span>
            </span>
          );
          return (
            <li
              key={index}
              aria-current={active ? 'step' : undefined}
              className={cn('flex min-w-0 gap-3', vertical ? 'items-start' : 'flex-1 items-center')}
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(index)}
                  className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {marker}
                  {text}
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-3">
                  {marker}
                  {text}
                </div>
              )}
              {!vertical && index < steps.length - 1 && (
                <span className={cn('hidden h-0.5 min-w-6 flex-1 rounded sm:block', done ? 'bg-primary' : 'bg-border')} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// -----------------------------------------------------------------------------------------------------------
// MoneyText & DateText
// -----------------------------------------------------------------------------------------------------------
export interface MoneyTextProps extends FormatMoneyOptions {
  /** integer minor units (PLAN: *_minor) */
  minor: number | null | undefined;
  currency: string | null | undefined;
  locale?: string;
  className?: string;
  /** shown for null / undefined (default "—") */
  fallback?: ReactNode;
}

/** Formats integer minor units with `formatMoney` (tabular numbers). */
export function MoneyText({ minor, currency, locale, className, fallback = '—', ...options }: MoneyTextProps) {
  if (minor === null || minor === undefined || Number.isNaN(minor)) {
    return <span className={cn('tabular-nums text-muted', className)}>{fallback}</span>;
  }
  return <span className={cn('tabular-nums', className)}>{formatMoney(minor, currency, locale, options)}</span>;
}

export type DateTextFormat = 'date' | 'datetime' | 'time' | 'relative';

export interface DateTextProps {
  value: string | number | Date | null | undefined;
  /** preset or a date-fns pattern (default "date") */
  format?: DateTextFormat | (string & {});
  fallback?: string;
  className?: string;
  /** tooltip with the full date-time (default true) */
  withTitle?: boolean;
}

/** `<time>` element with a formatted API date ("21 Oct 2026", "3 minutes ago", ...). */
export function DateText({ value, format = 'date', fallback = '—', className, withTitle = true }: DateTextProps) {
  const date = toDate(value);
  if (!date) return <span className={cn('text-muted', className)}>{fallback}</span>;
  const text =
    format === 'date'
      ? formatDate(date)
      : format === 'datetime'
        ? formatDateTime(date)
        : format === 'time'
          ? formatTime(date)
          : format === 'relative'
            ? formatRelative(date)
            : formatDate(date, format);
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <time
      dateTime={dateOnly ? (value as string) : date.toISOString()}
      title={withTitle ? (dateOnly ? formatDate(date, 'EEEE, d MMMM yyyy') : formatDateTime(date)) : undefined}
      className={className}
    >
      {text}
    </time>
  );
}
