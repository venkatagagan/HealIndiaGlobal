/** Small presentational pieces shared by the docai components. */
import type { ReactNode } from 'react';
import { AlertTriangle, PencilLine, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import type { FindingSignificance, LabFlag } from './types';

export const FLAG_CLASSES: Record<LabFlag, string> = {
  critical: 'bg-danger-strong text-white',
  high: 'bg-warning-soft text-warning-ink',
  low: 'bg-warning-soft text-warning-ink',
  normal: 'bg-success-soft text-success-ink',
  unknown: 'bg-neutral-soft text-neutral-ink',
};

export const SIGNIFICANCE_CLASSES: Record<FindingSignificance, string> = {
  urgent: 'bg-danger-soft text-danger-ink',
  attention: 'bg-warning-soft text-warning-ink',
  normal: 'bg-success-soft text-success-ink',
};

export const ROW_TINT: Record<LabFlag, string> = {
  critical: 'border-danger/50 bg-danger-soft/40',
  high: 'border-warning/40 bg-warning-soft/30',
  low: 'border-warning/40 bg-warning-soft/30',
  normal: 'border-border',
  unknown: 'border-border',
};

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  );
}

export function EditedMark({ label }: { label: string }) {
  return (
    <Pill className="bg-accent-soft text-accent-ink">
      <PencilLine className="size-3" aria-hidden />
      {label}
    </Pill>
  );
}

export function Section({
  title,
  actions,
  marker,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  marker?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
          {title}
          {marker}
        </h4>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Banner({
  tone,
  title,
  children,
}: {
  tone: 'danger' | 'warning' | 'info';
  title: ReactNode;
  children?: ReactNode;
}) {
  const Icon = tone === 'danger' ? ShieldAlert : AlertTriangle;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-xl border p-3 text-sm',
        tone === 'danger' && 'border-danger/40 bg-danger-soft text-danger-ink',
        tone === 'warning' && 'border-warning/40 bg-warning-soft text-warning-ink',
        tone === 'info' && 'border-info/30 bg-info-soft text-info-ink',
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

export const fieldClass =
  'w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
