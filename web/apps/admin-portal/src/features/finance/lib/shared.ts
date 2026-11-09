/**
 * Single import point for the @hig/shared utilities used by the finance console (money/date rules identical to
 * the backend). The `@hig/shared/lib` barrel (packages/shared/src/lib/index.ts) is declared in the package
 * exports but does not exist yet, so the shared source modules are referenced directly. When the barrel exists,
 * point these re-exports at '@hig/shared/lib' - nothing else in the feature changes.
 */
export {
  currencyExponent,
  formatBps,
  formatMoney,
  formatPercent,
  fromMinor,
  toMinor,
} from '@hig/shared/lib';
export {
  formatDate,
  formatDateTime,
  formatMonth,
  formatRelative,
  isoDateFromToday,
  todayIsoDate,
  toIsoDate,
} from '@hig/shared/lib';
export { useDebouncedValue, useDocumentTitle } from '@hig/shared/lib';
export { useTheme } from '@hig/shared/lib';
export { cn } from '@hig/shared/lib';
