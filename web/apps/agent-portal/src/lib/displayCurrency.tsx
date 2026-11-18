import { useSyncExternalStore } from 'react';
import type { DisplayMoney } from '@hig/shared/api';
import { SUPPORTED_CURRENCIES, formatMoney, formatMoneyRange, prefs } from '@hig/shared/lib';
import { useAppTranslation } from '../i18n';
import { cn } from './shared';

/**
 * Display currency of the agent portal (default USD, remembered on this device only). Quotes, bookings and the
 * hospital directory are requested with `?currency=` and show the approximate `display_*` amounts the API adds
 * next to the original prices; payments always use the original amount and currency.
 */
export const DEFAULT_DISPLAY_CURRENCY = 'USD';
const PREF_KEY = 'agent.displayCurrency';
const CURRENCIES: readonly string[] = SUPPORTED_CURRENCIES;

function read(): string {
  const saved = prefs.get(PREF_KEY);
  return saved && CURRENCIES.includes(saved) ? saved : DEFAULT_DISPLAY_CURRENCY;
}

let current = typeof window === 'undefined' ? DEFAULT_DISPLAY_CURRENCY : read();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setDisplayCurrency(code: string): void {
  if (!CURRENCIES.includes(code) || code === current) return;
  current = code;
  prefs.set(PREF_KEY, code);
  for (const listener of listeners) listener();
}

/** The selected display currency (re-renders when it changes). Put it in query keys and pass it as `currency`. */
export function useDisplayCurrency(): string {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_DISPLAY_CURRENCY);
}

/** Top-bar picker of the display currency. */
export function DisplayCurrencySelect({ className }: { className?: string }) {
  const { t } = useAppTranslation();
  const currency = useDisplayCurrency();
  return (
    <label className={cn('inline-flex items-center', className)} title={t('displayCurrency.hint')}>
      <span className="sr-only">{t('displayCurrency.label')}</span>
      <select
        value={currency}
        onChange={(e) => setDisplayCurrency(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        dir="ltr"
      >
        {CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}

/** True when the display amount is a real conversion (another currency than the original). */
export function isConverted(display: DisplayMoney | null | undefined, original?: string | null): display is DisplayMoney {
  if (!display) return false;
  if (original) return display.currency.toUpperCase() !== original.toUpperCase();
  return display.approximate !== false;
}

/** "≈ $1,200" text of a converted amount ('' when there is nothing to show). */
export function approxText(display: DisplayMoney | null | undefined, original?: string | null): string {
  if (!isConverted(display, original)) return '';
  return `≈ ${formatMoney(display.amount_minor, display.currency, undefined, { trimZeros: true })}`;
}

/** "≈ $1,200 – $2,000" of a converted range ('' when either end is missing). */
export function approxRangeText(
  min: DisplayMoney | null | undefined,
  max: DisplayMoney | null | undefined,
  original?: string | null,
): string {
  if (!isConverted(min, original)) return '';
  if (!max || max.currency !== min.currency) return approxText(min, original);
  return `≈ ${formatMoneyRange(min.amount_minor, max.amount_minor, min.currency)}`;
}

/**
 * Approximate amount in the display currency, shown next to an original price: "≈ $1,200". Renders nothing when
 * the API sent no conversion or the currencies are the same.
 */
export function ApproxMoney({
  display,
  max,
  original,
  className,
  block = false,
}: {
  display: DisplayMoney | null | undefined;
  /** upper end of a range */
  max?: DisplayMoney | null;
  /** currency of the original amount */
  original?: string | null;
  className?: string;
  /** on its own line */
  block?: boolean;
}) {
  const { t } = useAppTranslation();
  const text = max !== undefined ? approxRangeText(display, max, original) : approxText(display, original);
  if (!text || !display) return null;
  return (
    <span
      className={cn('text-xs font-normal text-muted tabular-nums', block && 'block', className)}
      title={t('displayCurrency.approxTitle', { currency: display.currency })}
    >
      {text}
      <span className="sr-only"> {t('displayCurrency.approxSr')}</span>
    </span>
  );
}
