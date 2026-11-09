import { useQuery } from '@tanstack/react-query';
import { api, catalogApi, hospitalPortalApi, notificationsApi, type MedicalCouncilOut } from '@hig/shared/api';

/** Query keys (convention: [domain, ...params]). Every key is implicitly scoped to the active hospital. */
export const qk = {
  profile: ['hospital-profile'] as const,
  dashboard: ['hospital-dashboard'] as const,
  specialties: ['specialties'] as const,
  medicalCouncils: ['medical-councils'] as const,
  procedures: (q?: string) => ['catalog-procedures', q ?? ''] as const,
  members: ['hospital-members'] as const,
  doctors: ['hospital-doctors'] as const,
  doctor: (id: string) => ['hospital-doctors', id] as const,
  availability: (doctorId: string, from: string, to: string) => ['doctor-availability', doctorId, from, to] as const,
  offerings: ['hospital-procedures'] as const,
  packages: (offeringId: string) => ['hospital-packages', offeringId] as const,
  reviews: ['hospital-reviews'] as const,
  cases: (params: object) => ['cases', params] as const,
  case: (id: string) => ['cases', 'detail', id] as const,
  bookings: (params: object) => ['bookings', params] as const,
  booking: (id: string) => ['bookings', 'detail', id] as const,
  itinerary: (bookingId: string) => ['bookings', 'itinerary', bookingId] as const,
  visa: (caseId: string) => ['visa-requests', caseId] as const,
  travel: (caseId: string) => ['travel-bookings', caseId] as const,
  kycDocs: (hospitalId: string) => ['kyc-documents', hospitalId] as const,
  payoutAccounts: ['payout-accounts'] as const,
  financeSummary: ['finance-summary'] as const,
  settlementItems: (params: object) => ['settlement-items', params] as const,
  payouts: (params: object) => ['payouts', params] as const,
  statements: (params: object) => ['statements', params] as const,
  conversations: ['conversations'] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  notifications: (params: object) => ['notifications', params] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useHospitalProfile(enabled = true) {
  return useQuery({ queryKey: qk.profile, queryFn: hospitalPortalApi.getProfile, enabled });
}

export function useSpecialties() {
  return useQuery({ queryKey: qk.specialties, queryFn: catalogApi.listSpecialties, staleTime: 10 * 60_000 });
}

/** NMC + State Medical Councils (doctor registration). */
export function useMedicalCouncils() {
  return useQuery({
    queryKey: qk.medicalCouncils,
    queryFn: () => api.get<MedicalCouncilOut[]>('/content/medical-councils'),
    staleTime: 60 * 60_000,
  });
}

export function useHospitalDoctors(enabled = true) {
  return useQuery({ queryKey: qk.doctors, queryFn: hospitalPortalApi.listDoctors, enabled });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: qk.unreadCount,
    queryFn: notificationsApi.unreadCount,
    enabled,
    refetchInterval: 60_000,
  });
}
