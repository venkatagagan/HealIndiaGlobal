import { formatMoneyRange, formatMoney } from '@/lib/money';
import type { FxTable } from '@/lib/data/types';
import { intlLocale } from '@/i18n/format';
import { ApproxPrice } from './approx-price';

/**
 * "₹2,50,000 – ₹4,50,000" plus an approximate conversion ("≈ $2,800 – $5,100") into the visitor's display currency
 * (components/visitor-provider.tsx; USD in the cached HTML). Pass `fx` to show the conversion.
 */
export function PriceRange({
  min,
  max,
  currency,
  fx,
  approxLabel,
  className = '',
  stacked = false,
}: {
  min: number | null;
  max: number | null;
  currency: string;
  /** Any value turns the approximate conversion on (the rates come from the VisitorProvider). */
  fx?: FxTable;
  approxLabel: string;
  className?: string;
  stacked?: boolean;
}) {
  if (min === null && max === null) return null;
  const lo = min ?? max ?? 0;
  const hi = max ?? min ?? 0;
  const intl = intlLocale();
  const main = formatMoneyRange(lo, hi, currency, intl);
  return (
    <span className={`${stacked ? 'flex flex-col' : 'inline'} ${className}`}>
      <span className="font-semibold whitespace-nowrap">{main}</span>
      {fx ? <ApproxPrice min={lo} max={hi} currency={currency} label={approxLabel} stacked={stacked} /> : null}
    </span>
  );
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  return <>{formatMoney(minor, currency, intlLocale())}</>;
}
