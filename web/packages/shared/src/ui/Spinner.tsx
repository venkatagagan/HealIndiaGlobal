import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZES: Record<SpinnerSize, string> = {
  xs: 'size-3',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
};

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  /** accessible label (visually hidden); default "Loading…" */
  label?: string;
}

/** Animated loading indicator with a screen-reader label. */
export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  const { t } = useCommonTranslation();
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <Loader2 className={cn('animate-spin text-current', SIZES[size])} aria-hidden />
      <span className="sr-only">{label ?? t('states.loading')}</span>
    </span>
  );
}
