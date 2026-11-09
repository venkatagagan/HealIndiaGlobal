/**
 * Small helpers shared by the finance list pages (orders, refunds, ledger) built on the shared table toolkit
 * (`useTableState` + `FilterBar` + `DataTable`, see packages/shared/src/ui/TABLES.md).
 */
import { SUPPORTED_CURRENCIES, toMinor } from '@hig/shared/lib';
import type { FilterOption } from '@hig/shared/ui';

/** Major-unit amount filter (URL) -> minor units for the API (`undefined` when empty / invalid). */
export function minorOrUndefined(major: number | undefined, currency = 'INR'): number | undefined {
  if (major === undefined) return undefined;
  const minor = toMinor(major, currency);
  return minor === null || minor < 0 ? undefined : minor;
}

/** '' -> undefined (API params) */
export function orUndefined<T extends string>(value: T | '' | null | undefined): T | undefined {
  return value ? value : undefined;
}

/** non-empty list or undefined (repeated query params) */
export function listOrUndefined<T>(values: readonly T[]): T[] | undefined {
  return values.length ? [...values] : undefined;
}

/** Order / payment currencies: INR first, then the supported patient currencies. */
export const CURRENCY_CODES: readonly string[] = ['INR', ...SUPPORTED_CURRENCIES.filter((c) => c !== 'INR')];
export const CURRENCY_OPTIONS: FilterOption[] = CURRENCY_CODES.map((c) => ({ value: c, label: c }));

/** "2026-10-21" stamp for export file names */
export const today = (): string => new Date().toISOString().slice(0, 10);
