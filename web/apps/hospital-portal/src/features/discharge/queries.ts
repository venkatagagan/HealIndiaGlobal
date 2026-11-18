import { useQuery } from '@tanstack/react-query';
import { dischargeApi, type DischargeSummaryListParams } from '@hig/shared/api';

/** Query keys of discharge summaries (prefix `discharge-summaries`; scoped to the active hospital by the API). */
export const dsk = {
  all: ['discharge-summaries'] as const,
  list: (params?: DischargeSummaryListParams) => ['discharge-summaries', 'list', params ?? {}] as const,
  detail: (id: string) => ['discharge-summaries', 'detail', id] as const,
  prefill: (caseId: string, bookingId?: string | null) => ['discharge-summaries', 'prefill', caseId, bookingId ?? ''] as const,
};

export function useDischargeList(params?: DischargeSummaryListParams, enabled = true) {
  return useQuery({ queryKey: dsk.list(params), queryFn: () => dischargeApi.list(params), enabled });
}

export function useDischargeSummary(id: string | undefined) {
  return useQuery({ queryKey: dsk.detail(id ?? ''), queryFn: () => dischargeApi.get(id as string), enabled: !!id });
}

/** Pre-filled values + the documents that can be attached (the editor also uses it for existing drafts). */
export function useDischargePrefill(caseId: string | undefined, bookingId?: string | null) {
  return useQuery({
    queryKey: dsk.prefill(caseId ?? '', bookingId),
    queryFn: () => dischargeApi.prefill(caseId as string, bookingId),
    enabled: !!caseId,
  });
}

/** Editor URLs (router basename `/hospital`). */
export const dischargePaths = {
  list: '/discharge-summaries',
  one: (id: string) => `/discharge-summaries/${encodeURIComponent(id)}`,
  start: (caseId: string, bookingId?: string | null) =>
    `/discharge-summaries/new?case=${encodeURIComponent(caseId)}${bookingId ? `&booking=${encodeURIComponent(bookingId)}` : ''}`,
};
