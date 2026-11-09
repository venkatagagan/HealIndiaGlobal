import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';

type DateInput = string | number | Date | null | undefined;

/** Parse API values: ISO timestamps, "YYYY-MM-DD" (as a local calendar date), epoch ms or Date. */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/** "21 Oct 2026" */
export function formatDate(value: DateInput, pattern = 'd MMM yyyy', fallback = '—'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : fallback;
}

/** "21 Oct 2026, 14:05" */
export function formatDateTime(value: DateInput, pattern = 'd MMM yyyy, HH:mm', fallback = '—'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : fallback;
}

/** "14:05" */
export function formatTime(value: DateInput, pattern = 'HH:mm', fallback = '—'): string {
  const d = toDate(value);
  return d ? format(d, pattern) : fallback;
}

/** "3 minutes ago" / "in 2 days" */
export function formatRelative(value: DateInput, fallback = '—'): string {
  const d = toDate(value);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : fallback;
}

/** Date -> "YYYY-MM-DD" (local calendar date, for API date fields) */
export function toIsoDate(value: DateInput): string | null {
  const d = toDate(value);
  return d ? format(d, 'yyyy-MM-dd') : null;
}

/** today as "YYYY-MM-DD" */
export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** "YYYY-MM-DD" n days from today */
export function isoDateFromToday(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd');
}

/** Whole calendar days from today until `value` (negative when in the past). */
export function daysUntil(value: DateInput): number | null {
  const d = toDate(value);
  return d ? differenceInCalendarDays(startOfDay(d), startOfDay(new Date())) : null;
}

/** Age in whole years from a date of birth. */
export function ageFromDob(dob: DateInput): number | null {
  const d = toDate(dob);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

/** "2026-10" -> "Oct 2026" (dashboard monthly series) */
export function formatMonth(month: string, pattern = 'MMM yyyy'): string {
  const d = toDate(/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : month);
  return d ? format(d, pattern) : month;
}
