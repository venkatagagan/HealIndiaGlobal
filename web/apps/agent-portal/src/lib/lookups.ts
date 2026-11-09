import { useQuery } from '@tanstack/react-query';
import { catalogApi } from '@hig/shared/api';
import { isoDateFromToday } from '@hig/shared/lib';
import type { DatePreset, FilterOption } from '@hig/shared/ui';

/** Hospital options for list filters (the public directory; small). */
export function useHospitalOptions() {
  return useQuery({
    queryKey: ['hospitals', 'options'],
    queryFn: () => catalogApi.listHospitals({ page: 1, page_size: 100 }),
    select: (page): FilterOption[] =>
      page.items
        .map((h) => ({ value: h.id, label: h.name, description: h.city }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    staleTime: 10 * 60_000,
  });
}

/** Distinct options from loaded rows (client-side lists): [{value, label, count}] sorted by label. */
export function optionsFromRows<T>(rows: readonly T[], pick: (row: T) => { value: string; label: string } | null): FilterOption[] {
  const map = new Map<string, FilterOption & { count: number }>();
  for (const row of rows) {
    const o = pick(row);
    if (!o) continue;
    const cur = map.get(o.value);
    if (cur) cur.count += 1;
    else map.set(o.value, { ...o, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Inclusive "YYYY-MM-DD" range test on an ISO date / datetime (local calendar date). */
export function inDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const day = value.length > 10 ? localIsoDate(new Date(value)) : value.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date presets for future-facing dates (admissions, travel). */
export const UPCOMING_DATE_PRESETS: readonly DatePreset[] = [
  { id: 'next-7d', label: 'Next 7 days', range: () => ({ from: isoDateFromToday(0), to: isoDateFromToday(6) }) },
  { id: 'next-30d', label: 'Next 30 days', range: () => ({ from: isoDateFromToday(0), to: isoDateFromToday(29) }) },
  { id: 'next-90d', label: 'Next 90 days', range: () => ({ from: isoDateFromToday(0), to: isoDateFromToday(89) }) },
  { id: 'past-30d', label: 'Last 30 days', range: () => ({ from: isoDateFromToday(-29), to: isoDateFromToday(0) }) },
  { id: 'past', label: 'Before today', range: () => ({ from: '', to: isoDateFromToday(-1) }) },
];
