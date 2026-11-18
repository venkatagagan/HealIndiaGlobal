/**
 * Translations of the finance console: namespace `finance` (src/locales/<lng>/finance.json, loaded by the app's
 * src/i18n.ts like every catalog in that folder). Components call `useFinanceTranslation()`; code outside React
 * (toasts in plain functions, option lists) builds its text lazily with `ft()` / `enumLabel()` at call time,
 * never at import time. See docs/i18n/README.md.
 */
import { useTranslation } from 'react-i18next';
import { humanize } from '@hig/shared/api';
import { i18n } from '@hig/shared/lib';

export const FINANCE_NS = 'finance';

/** `const { t } = useFinanceTranslation()` - `t('orders.title')` reads the finance namespace. */
export function useFinanceTranslation() {
  return useTranslation(FINANCE_NS);
}

/** Options accepted by `ft()` (interpolation values, `count`, `defaultValue`). */
export type FinanceTOptions = Record<string, unknown>;

/** The `t` of the finance namespace (from `useFinanceTranslation()`). */
export type FinanceT = ReturnType<typeof useFinanceTranslation>['t'];

/** Finance text outside React (call it lazily, e.g. inside a toast handler): `ft('markPaid.recorded', { number })`. */
export function ft(key: string, options: FinanceTOptions = {}): string {
  return i18n.t(key, { ns: FINANCE_NS, ...options }) as string;
}

/** Enum groups with translated labels under `enums.<group>.<value>` in the finance catalog. */
export type FinanceEnumGroup =
  | 'status'
  | 'paymentGateway'
  | 'paymentPurpose'
  | 'paymentMethod'
  | 'ledgerAccountType'
  | 'ledgerOwnerType'
  | 'entryDirection'
  | 'ledgerTxnType'
  | 'commissionScope'
  | 'payeeType'
  | 'payoutMethod'
  | 'invoiceKind'
  | 'reviewKind';

/**
 * Translated label of an API enum value: `enumLabel('payeeType', 'hospital')` -> "Hospital". Unknown values fall
 * back to the humanized value ("needs_reconciliation" -> "Needs reconciliation").
 */
export function enumLabel(group: FinanceEnumGroup, value: string | null | undefined): string {
  if (!value) return '';
  return i18n.t(`enums.${group}.${value}`, { ns: FINANCE_NS, defaultValue: humanize(value) }) as string;
}

/** `{ value: label }` map for a list of enum values (built at call time, in the current language). */
export function enumLabels<T extends string>(group: FinanceEnumGroup, values: readonly T[]): Record<T, string> {
  const out = {} as Record<T, string>;
  for (const v of values) out[v] = enumLabel(group, v);
  return out;
}

/** `[{ value, label }]` options for a list of enum values (built at call time, in the current language). */
export function enumOptions<T extends string>(group: FinanceEnumGroup, values: readonly T[]): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: enumLabel(group, value) }));
}
