import { useQuery } from '@tanstack/react-query';
import { adminApi, type CaseStatus } from '@hig/shared/api';
import { intlLocale } from '@hig/shared/lib';
import { opsKeys } from './mutations';

/** Hospital options for filters (first 100 by name, any status). */
export function useHospitalOptions() {
  return useQuery({
    queryKey: [...opsKeys.hospitals, 'options'],
    queryFn: () => adminApi.listHospitals({ page: 1, page_size: 100 }),
    select: (p) => p.items.map((h) => ({ value: h.id, label: `${h.name} · ${h.city}` })),
    staleTime: 5 * 60_000,
  });
}

/** Support staff (coordinators) for case assignment. */
export function useCoordinatorOptions() {
  return useQuery({
    queryKey: [...opsKeys.staff, 'support'],
    queryFn: () => adminApi.listStaff({ role: 'support' }),
    staleTime: 5 * 60_000,
  });
}

/** Case transitions staff may request (PLAN 5 state machine); the API validates each one. */
export const STAFF_CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  enquiry: ['cancelled', 'declined'],
  quoted: ['cancelled', 'declined'],
  accepted: ['cancelled'],
  booked: ['in_treatment', 'cancelled'],
  in_treatment: ['completed'],
  completed: [],
  cancelled: [],
  declined: [],
};

/** Distinct values for the admin list filters (cities, countries, accreditations, audit actions …). */
export function useAdminFacets() {
  return useQuery({
    queryKey: ['admin', 'facets'],
    queryFn: () => adminApi.facets(),
    staleTime: 5 * 60_000,
  });
}

/** Specialty options for filters. */
export function useSpecialtyOptions() {
  return useQuery({
    queryKey: [...opsKeys.catalog, 'specialties', {}],
    queryFn: () => adminApi.specialties.list(),
    select: (rows) => rows.map((s) => ({ value: s.id, label: s.name })),
    staleTime: 5 * 60_000,
  });
}

const regionNamesByLocale = new Map<string, Intl.DisplayNames | null>();
/** "NG" -> "Nigeria" in the UI language (falls back to the code). */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  const locale = intlLocale();
  let regionNames = regionNamesByLocale.get(locale);
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
    regionNamesByLocale.set(locale, regionNames);
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Agent options for filters (first 100, any status): "Agency · CODE". */
export function useAgentOptions() {
  return useQuery({
    queryKey: [...opsKeys.agents, 'options'],
    queryFn: () => adminApi.listAgents({ page: 1, page_size: 100 }),
    select: (p) => p.items.map((a) => ({ value: a.id, label: a.agency_name, description: a.agent_code })),
    staleTime: 5 * 60_000,
  });
}
