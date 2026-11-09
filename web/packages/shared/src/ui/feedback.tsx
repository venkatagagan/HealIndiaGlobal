import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Toaster as SonnerToaster, toast, type ToasterProps as SonnerToasterProps } from 'sonner';
import { errorMessage } from '../api/client';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { normalizeTone, TONE_SOLID, type Tone } from './tone';

// -----------------------------------------------------------------------------------------------------------
// Skeleton
// -----------------------------------------------------------------------------------------------------------
export interface SkeletonProps {
  className?: string;
  /** render N stacked text lines instead of one block */
  lines?: number;
  rounded?: 'md' | 'lg' | 'full';
}

/** Placeholder shimmer while content loads (aria-hidden; pair with a visually hidden status text). */
export function Skeleton({ className, lines, rounded = 'md' }: SkeletonProps) {
  const radius = rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-md';
  if (lines && lines > 1) {
    return (
      <div className={cn('flex flex-col gap-2', className)} aria-hidden>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={cn('h-3.5 animate-pulse bg-surface-2', radius, i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    );
  }
  return <div className={cn('h-4 animate-pulse bg-surface-2', radius, className)} aria-hidden />;
}

// -----------------------------------------------------------------------------------------------------------
// Loading / empty / error states
// -----------------------------------------------------------------------------------------------------------
export interface LoadingStateProps {
  label?: string;
  className?: string;
  /** fill the viewport (route-level loading) */
  fullScreen?: boolean;
}

export function LoadingState({ label, className, fullScreen = false }: LoadingStateProps) {
  const { t } = useCommonTranslation();
  const text = label ?? t('states.loading');
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-12 text-sm text-muted',
        fullScreen && 'min-h-screen py-0',
        className,
      )}
    >
      <Spinner size="sm" label={text} />
      <span aria-hidden>{text}</span>
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** call to action (e.g. a Button) */
  action?: ReactNode;
  className?: string;
  /** less vertical padding (inside cards / tables) */
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact = false }: EmptyStateProps) {
  const { t } = useCommonTranslation();
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </div>
      <p className="text-sm font-semibold text-fg">{title ?? t('states.empty')}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  /** the thrown error (ApiError message is shown) */
  error?: unknown;
  title?: ReactNode;
  /** overrides the message derived from `error` */
  message?: ReactNode;
  /** alias of `message` */
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  error,
  title,
  message,
  description,
  onRetry,
  retryLabel,
  className,
  compact = false,
}: ErrorStateProps) {
  const { t } = useCommonTranslation();
  const text = message ?? description ?? (error !== undefined ? errorMessage(error, t('states.errorDescription')) : t('states.errorDescription'));
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-4 text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-fg">{title ?? t('states.error')}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{text}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" leftIcon={<RefreshCw className="size-4" aria-hidden />} onClick={onRetry}>
          {retryLabel ?? t('actions.retry')}
        </Button>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------------------
// ProgressBar
// -----------------------------------------------------------------------------------------------------------
export interface ProgressBarProps {
  value: number;
  max?: number;
  /** accessible name; shown above the bar unless `hideLabel` */
  label?: ReactNode;
  hideLabel?: boolean;
  /** show "45%" next to the label */
  showValue?: boolean;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  hideLabel = false,
  showValue = false,
  tone = 'primary',
  size = 'md',
  className,
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = Math.round((clamped / safeMax) * 100);
  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';
  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && !hideLabel && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
          {label && <span className="font-medium text-fg">{label}</span>}
          {showValue && <span className="tabular-nums text-muted">{pct}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-label={typeof label === 'string' ? label : undefined}
        className={cn('w-full overflow-hidden rounded-full bg-surface-2', height)}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', TONE_SOLID[normalizeTone(tone)])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------------------------------------
// Toaster (sonner) - themed. Use `toast.success('Saved')` etc.
// -----------------------------------------------------------------------------------------------------------
export type ToasterProps = SonnerToasterProps;

/** Mount once near the root. Follows the app theme (dark/light). */
export function Toaster(props: ToasterProps) {
  const { isDark } = useTheme();
  return (
    <SonnerToaster
      richColors
      closeButton
      position="top-right"
      theme={isDark ? 'dark' : 'light'}
      {...props}
    />
  );
}

export { toast };
