import { useQuery } from '@tanstack/react-query';
import { adminApi, type CaseStatus } from '@hig/shared/api';
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

let regionNames: Intl.DisplayNames | null | undefined;
/** "NG" -> "Nigeria" (falls back to the code). */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
