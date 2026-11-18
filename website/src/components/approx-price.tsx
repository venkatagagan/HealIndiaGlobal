'use client';

import { convertMinor, formatMoneyRange } from '@/lib/money';
import { useIntlLocale } from './locale-provider';
import { useVisitor } from './visitor-provider';

/**
 * "(≈ $2,800 – $5,100)": an approximate conversion into the visitor's display currency (USD until the visitor is
 * known, so cached pages are the same for everyone). Hidden when the price is already in that currency.
 */
export function ApproxPrice({
  min,
  max,
  currency,
  label,
  stacked = false,
}: {
  min: number;
  max: number;
  currency: string;
  /** "≈ {amount}" */
  label: string;
  stacked?: boolean;
}) {
  const { fx, currency: target } = useVisitor();
  const intl = useIntlLocale();
  if (currency === target) return null;
  const a = convertMinor(min, currency, target, fx);
  const b = convertMinor(max, currency, target, fx);
  if (a === null || b === null) return null;
  const text = label.replace('{amount}', formatMoneyRange(a, b, target, intl, { approx: true }));
  return <span className={`text-sm text-slate-600 ${stacked ? '' : 'ms-1.5'} whitespace-nowrap`}>({text})</span>;
}
