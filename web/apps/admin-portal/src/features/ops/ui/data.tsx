import type { ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { errorMessage } from '@hig/shared/api';
import { cn } from '../lib/format';
import { Button, Spinner } from './primitives';

// ---------------------------------------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------------------------------------
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  action,
  icon,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-muted">{icon ?? <Inbox className="size-6" />}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="rounded-full bg-red-100 p-3 text-danger dark:bg-red-500/15">
        <AlertTriangle className="size-6" />
      </div>
      <p className="text-sm font-medium text-fg">Could not load data</p>
      <p className="max-w-md text-xs text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------------------------------------
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'green' | 'violet' | 'amber' | 'red';
  onClick?: () => void;
}) {
  const toneCls = {
    neutral: 'bg-surface-2 text-muted',
    green: 'bg-success-soft text-success-ink',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    red: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  }[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left shadow-card',
        onClick && 'transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {icon && <div className={cn('rounded-lg p-2', toneCls)}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="mt-1 truncate text-xl font-semibold tabular-nums text-fg">{value}</p>
        {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      </div>
    </Comp>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------------------
export interface TabItem<K extends string> {
  key: K;
  label: string;
  count?: number | null;
  highlight?: boolean;
}

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1', className)}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'border-primary text-primary-ink'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  t.highlight && t.count > 0
                    ? 'bg-danger-strong text-white'
                    : 'bg-surface-2 text-muted',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** hide below the md breakpoint */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  empty?: ReactNode;
  /** visually dims the table while a new page loads */
  fetching?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  rowClassName,
  empty,
  fetching,
}: DataTableProps<T>) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows) return <LoadingState />;
  if (!rows || rows.length === 0) return <>{empty ?? <EmptyState title="No results" description="Try changing the filters." />}</>;
  return (
    <div className={cn('-mx-4 overflow-x-auto sm:mx-0', fetching && 'opacity-60 transition-opacity')}>
      <table className="min-w-full divide-y divide-border text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted',
                  c.align === 'right' && 'text-right',
                  c.hideOnMobile && 'hidden md:table-cell',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                onRowClick &&
                  'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3 py-2.5 align-middle text-fg',
                    c.align === 'right' && 'text-right tabular-nums',
                    c.hideOnMobile && 'hidden md:table-cell',
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
      <span>
        {total.toLocaleString()} result{total === 1 ? '' : 's'} · page {page} of {Math.max(pages, 1)}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
          icon={<ChevronLeft className="size-3.5" />}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
          icon={<ChevronRight className="size-3.5" />}
        />
      </div>
    </nav>
  );
}
