import { useQuery } from '@tanstack/react-query';
import { agentPortalApi, catalogApi, notificationsApi } from '@hig/shared/api';

/** Query keys used across the agent portal: [domain, ...params] */
export const qk = {
  profile: ['agent-profile'] as const,
  dashboard: ['agent-dashboard'] as const,
  patients: (params: object) => ['agent-patients', params] as const,
  patient: (id: string) => ['agent-patients', id] as const,
  screenings: (params: object) => ['screenings', params] as const,
  screening: (id: string) => ['screenings', id] as const,
  matches: (id: string) => ['screenings', id, 'matches'] as const,
  cases: (params: object) => ['cases', params] as const,
  case: (id: string) => ['cases', id] as const,
  bookings: (params: object) => ['bookings', params] as const,
  booking: (id: string) => ['bookings', id] as const,
  orders: (params: object) => ['payment-orders', params] as const,
  installments: (bookingId: string) => ['installments', bookingId] as const,
  documents: (params: object) => ['documents', params] as const,
  specialties: ['specialties'] as const,
  symptoms: (specialty: string) => ['symptoms', specialty] as const,
  hospitals: (params: object) => ['hospitals', params] as const,
  hospital: (slug: string) => ['hospitals', slug] as const,
  doctors: (params: object) => ['doctors', params] as const,
  doctor: (id: string) => ['doctors', id] as const,
  financeSummary: ['finance-summary'] as const,
  commissions: (params: object) => ['commissions', params] as const,
  payouts: (params: object) => ['payouts', params] as const,
  statements: (params: object) => ['statements', params] as const,
  payoutAccounts: ['payout-accounts'] as const,
  referral: ['referral'] as const,
  conversations: ['conversations'] as const,
  messages: (id: string) => ['conversations', id, 'messages'] as const,
  notifications: (params: object) => ['notifications', params] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useAgentProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: agentPortalApi.getProfile, staleTime: 60_000 });
}

export function useSpecialties() {
  return useQuery({ queryKey: qk.specialties, queryFn: catalogApi.listSpecialties, staleTime: 10 * 60_000 });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: qk.unreadCount,
    queryFn: notificationsApi.unreadCount,
    enabled,
    refetchInterval: 120_000,
  });
}
