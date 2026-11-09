import { convertMinor, formatMoneyRange, formatMoney } from '@/lib/money';
import type { FxTable } from '@/lib/data/types';

/** "₹2,50,000 – ₹4,50,000" plus an approximate conversion ("≈ $2,800 – $5,100") when FX is known. */
export function PriceRange({
  min,
  max,
  currency,
  fx,
  approxCurrency = 'USD',
  approxLabel,
  className = '',
  stacked = false,
}: {
  min: number | null;
  max: number | null;
  currency: string;
  fx?: FxTable;
  approxCurrency?: string;
  approxLabel: string;
  className?: string;
  stacked?: boolean;
}) {
  if (min === null && max === null) return null;
  const lo = min ?? max ?? 0;
  const hi = max ?? min ?? 0;
  const intl = 'en';
  const main = formatMoneyRange(lo, hi, currency, intl);
  let approx: string | null = null;
  if (fx && currency !== approxCurrency) {
    const a = convertMinor(lo, currency, approxCurrency, fx);
    const b = convertMinor(hi, currency, approxCurrency, fx);
    if (a !== null && b !== null) approx = approxLabel.replace('{amount}', formatMoneyRange(a, b, approxCurrency, intl, { approx: true }));
  }
  return (
    <span className={`${stacked ? 'flex flex-col' : 'inline'} ${className}`}>
      <span className="font-semibold whitespace-nowrap">{main}</span>
      {approx ? <span className={`text-sm text-slate-600 ${stacked ? '' : 'ms-1.5'} whitespace-nowrap`}>({approx})</span> : null}
    </span>
  );
}

export function Money({ minor, currency }: { minor: number; currency: string }) {
  return <>{formatMoney(minor, currency, 'en')}</>;
}
