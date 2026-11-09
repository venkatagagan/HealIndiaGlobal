/**
 * Single import point for the shared utilities used by the ops console (money/date rules identical to the
 * backend live in @hig/shared). The `@hig/shared/lib` barrel (src/lib/index.ts) is declared in the package
 * exports but was not created by the foundation phase, so the source modules are referenced directly here.
 * When the barrel exists, replace these paths with `'@hig/shared/lib'` - nothing else in the feature changes.
 */
export {
  formatMoney,
  formatMoneyRange,
  formatBps,
  formatPercent,
  fromMinor,
  toMinor,
  currencyExponent,
  SUPPORTED_CURRENCIES,
} from '@hig/shared/lib';
export {
  formatDate,
  formatDateTime,
  formatRelative,
  formatMonth,
  toIsoDate,
  toDate,
} from '@hig/shared/lib';
export { useDebouncedValue, useDocumentTitle } from '@hig/shared/lib';
export { cn } from '@hig/shared/lib';

/** "1500" bps -> "15" (string for a percent input) */
export function bpsToPctInput(bps: number | null | undefined): string {
  if (bps === null || bps === undefined) return '';
  return String(Number((bps / 100).toFixed(2)));
}

/** "15.5" (percent) -> 1550 bps; '' -> null; invalid -> undefined */
export function pctInputToBps(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100);
}

/** Bytes -> "1.2 MB" */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** Comma separated text -> trimmed non-empty list */
export function splitList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ISO timestamp -> value for <input type="datetime-local"> (local time) */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO UTC string (or null) */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
