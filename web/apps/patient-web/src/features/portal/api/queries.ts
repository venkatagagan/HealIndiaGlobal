/**
 * React Query hooks for the patient portal. Query keys follow the shared convention
 * `[domain, ...params]` so invalidations can target a whole domain (e.g. `['cases']`).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  authApi,
  bookingsApi,
  casesApi,
  catalogApi,
  documentsApi,
  messagingApi,
  notificationsApi,
  patientApi,
  paymentsApi,
  screeningsApi,
  travelApi,
  type BookingCancelIn,
  type BookingCreateIn,
  type BookingListParams,
  type CaseCreateIn,
  type CaseListParams,
  type ChangePasswordIn,
  type CompanionIn,
  type ConsentIn,
  type CostComparisonParams,
  type DocumentListParams,
  type DocumentUploadIn,
  type MessageCreateIn,
  type NotificationListParams,
  type PatientProfileIn,
  type SavedItemIn,
  type ScreeningCreateIn,
  type ScreeningListParams,
  type ScreeningUpdateIn,
  type TravelListParams,
  type Uuid,
} from '@hig/shared/api';

// ---------------------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------------------
export const qk = {
  dashboard: ['dashboard'] as const,
  profile: ['patient-profile'] as const,
  companions: ['companions'] as const,
  saved: ['saved'] as const,
  consents: ['consents'] as const,
  me: ['me'] as const,
  specialties: ['specialties'] as const,
  symptoms: (params: { specialty?: string; body_area?: string }) => ['symptoms', params] as const,
  costComparison: (params: CostComparisonParams) => ['cost-comparison', params] as const,
  helplines: ['helplines'] as const,
  culturalTips: ['cultural-tips'] as const,
  hospitalAvailability: (hospitalId: Uuid, params: object) => ['availability', 'hospital', hospitalId, params] as const,
  doctorAvailability: (doctorId: Uuid, params: object) => ['availability', 'doctor', doctorId, params] as const,
  hospital: (id: string) => ['hospital', id] as const,
  doctor: (id: Uuid) => ['doctor', id] as const,
  accommodations: (params: object) => ['accommodations', params] as const,
  serviceProviders: (params: object) => ['service-providers', params] as const,
  screenings: (params?: ScreeningListParams) => ['screenings', 'list', params ?? {}] as const,
  screening: (id: Uuid) => ['screenings', id] as const,
  matches: (id: Uuid) => ['screenings', id, 'matches'] as const,
  cases: (params?: CaseListParams) => ['cases', 'list', params ?? {}] as const,
  case: (id: Uuid) => ['cases', id] as const,
  bookings: (params?: BookingListParams) => ['bookings', 'list', params ?? {}] as const,
  booking: (id: Uuid) => ['bookings', id] as const,
  checklist: (bookingId: Uuid) => ['bookings', bookingId, 'checklist'] as const,
  itinerary: (bookingId: Uuid) => ['bookings', bookingId, 'itinerary'] as const,
  installments: (bookingId: Uuid) => ['payments', 'installments', bookingId] as const,
  orders: (params: object) => ['payments', 'orders', params] as const,
  order: (id: Uuid) => ['payments', 'order', id] as const,
  invoices: (params: object) => ['payments', 'invoices', params] as const,
  visa: (params: TravelListParams) => ['travel', 'visa', params] as const,
  travelBookings: (params: TravelListParams) => ['travel', 'travel-bookings', params] as const,
  accommodationBookings: (params: TravelListParams) => ['travel', 'accommodation-bookings', params] as const,
  serviceBookings: (params: TravelListParams) => ['travel', 'service-bookings', params] as const,
  documents: (params?: DocumentListParams) => ['documents', params ?? {}] as const,
  conversations: ['conversations'] as const,
  messages: (conversationId: Uuid) => ['conversations', conversationId, 'messages'] as const,
  notifications: (params?: NotificationListParams) => ['notifications', 'list', params ?? {}] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

// ---------------------------------------------------------------------------------------------------------
// Catalog / content
// ---------------------------------------------------------------------------------------------------------
export function useSpecialties() {
  return useQuery({ queryKey: qk.specialties, queryFn: catalogApi.listSpecialties, staleTime: 10 * 60_000 });
}

export function useSymptomLibrary(params: { specialty?: string; body_area?: string }) {
  return useQuery({
    queryKey: qk.symptoms(params),
    queryFn: () => catalogApi.symptoms(params),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useCostComparison(params: CostComparisonParams | null) {
  return useQuery({
    queryKey: params ? qk.costComparison(params) : ['cost-comparison', 'none'],
    queryFn: () => catalogApi.costComparison(params as CostComparisonParams),
    enabled: !!params?.procedure && !!params.country,
    staleTime: 10 * 60_000,
  });
}

export function useHelplines() {
  return useQuery({ queryKey: qk.helplines, queryFn: catalogApi.helplines, staleTime: 30 * 60_000 });
}

export function useCulturalTips() {
  return useQuery({ queryKey: qk.culturalTips, queryFn: catalogApi.culturalTips, staleTime: 30 * 60_000 });
}

export function useHospitalAvailability(hospitalId: Uuid | undefined, params: { from: string; to: string; doctor_id?: Uuid }) {
  return useQuery({
    queryKey: qk.hospitalAvailability(hospitalId ?? '', params),
    queryFn: () => catalogApi.hospitalAvailability(hospitalId as Uuid, params),
    enabled: !!hospitalId,
    placeholderData: keepPreviousData,
  });
}

export function useHospital(slugOrId: string | undefined) {
  return useQuery({
    queryKey: qk.hospital(slugOrId ?? ''),
    queryFn: () => catalogApi.getHospital(slugOrId as string),
    enabled: !!slugOrId,
    staleTime: 5 * 60_000,
  });
}

export function useAccommodations(params: { city?: string; hospital_id?: Uuid }, enabled = true) {
  return useQuery({
    queryKey: qk.accommodations(params),
    queryFn: () => catalogApi.accommodations(params),
    enabled,
    staleTime: 10 * 60_000,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Patient: profile, dashboard, saved, consents
// ---------------------------------------------------------------------------------------------------------
export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: patientApi.dashboard });
}

export function usePatientProfile(enabled = true) {
  return useQuery({ queryKey: qk.profile, queryFn: patientApi.getProfile, enabled });
}

export function useUpdatePatientProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatientProfileIn) => patientApi.updateProfile(body),
    onSuccess: (data) => {
      qc.setQueryData(qk.profile, data);
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useCompanions() {
  return useQuery({ queryKey: qk.companions, queryFn: patientApi.listCompanions });
}

export function useSaveCompanion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: Uuid; body: CompanionIn }) =>
      id ? patientApi.updateCompanion(id, body) : patientApi.createCompanion(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.companions }),
  });
}

export function useDeleteCompanion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: Uuid) => patientApi.deleteCompanion(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.companions }),
  });
}

export function useSavedItems() {
  return useQuery({ queryKey: qk.saved, queryFn: () => patientApi.listSaved() });
}

export function useToggleSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, saved }: { item: SavedItemIn; saved: boolean }) =>
      saved ? patientApi.unsave(item) : patientApi.save(item).then(() => undefined),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.saved }),
  });
}

export function useConsents() {
  return useQuery({ queryKey: qk.consents, queryFn: authApi.listConsents });
}

export function useGiveConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ConsentIn) => authApi.giveConsent(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.consents }),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (body: ChangePasswordIn) => authApi.changePassword(body) });
}

// ---------------------------------------------------------------------------------------------------------
// Screenings
// ---------------------------------------------------------------------------------------------------------
export function useScreenings(params?: ScreeningListParams) {
  return useQuery({ queryKey: qk.screenings(params), queryFn: () => screeningsApi.list(params) });
}

export function useScreening(id: Uuid | undefined, options: { pollMs?: number | false } = {}) {
  return useQuery({
    queryKey: qk.screening(id ?? ''),
    queryFn: () => screeningsApi.get(id as Uuid),
    enabled: !!id,
    refetchInterval: (query) => {
      if (!options.pollMs) return false;
      const status = query.state.data?.status;
      return status === 'processing' || status === undefined ? options.pollMs : false;
    },
  });
}

export function useMatches(id: Uuid | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.matches(id ?? ''),
    queryFn: () => screeningsApi.matches(id as Uuid),
    enabled: !!id && enabled,
  });
}

export function useCreateScreening() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScreeningCreateIn) => screeningsApi.create(body),
    onSuccess: (data) => {
      qc.setQueryData(qk.screening(data.id), data);
      void qc.invalidateQueries({ queryKey: ['screenings', 'list'] });
    },
  });
}

export function useUpdateScreening(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScreeningUpdateIn) => screeningsApi.update(id, body),
    onSuccess: (data) => qc.setQueryData(qk.screening(id), data),
  });
}

export function useSubmitScreening(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (consent_ai: boolean) => screeningsApi.submit(id, { consent_ai }),
    onSuccess: (data) => {
      qc.setQueryData(qk.screening(id), data);
      void qc.invalidateQueries({ queryKey: ['screenings', 'list'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useRerunScreening(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => screeningsApi.rerun(id),
    onSuccess: (data) => {
      qc.setQueryData(qk.screening(id), data);
      qc.removeQueries({ queryKey: qk.matches(id) });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------
// Cases & quotes
// ---------------------------------------------------------------------------------------------------------
export function useCases(params?: CaseListParams) {
  return useQuery({
    queryKey: qk.cases(params),
    queryFn: () => casesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCase(id: Uuid | undefined) {
  return useQuery({ queryKey: qk.case(id ?? ''), queryFn: () => casesApi.get(id as Uuid), enabled: !!id });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CaseCreateIn) => casesApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useQuoteDecision(caseId: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ quoteId, accept, reason }: { quoteId: Uuid; accept: boolean; reason?: string }) =>
      accept ? casesApi.acceptQuote(caseId, quoteId) : casesApi.rejectQuote(caseId, quoteId, reason ? { reason } : {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useCancelCase(caseId: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note?: string) => casesApi.changeStatus(caseId, { to_status: 'cancelled', note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------
// Bookings, checklist, itinerary
// ---------------------------------------------------------------------------------------------------------
export function useBookings(params?: BookingListParams) {
  return useQuery({
    queryKey: qk.bookings(params),
    queryFn: () => bookingsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useBooking(id: Uuid | undefined, options: { pollMs?: number | false } = {}) {
  return useQuery({
    queryKey: qk.booking(id ?? ''),
    queryFn: () => bookingsApi.get(id as Uuid),
    enabled: !!id,
    refetchInterval: options.pollMs ?? false,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingCreateIn) => bookingsApi.create(body),
    onSuccess: (data) => {
      qc.setQueryData(qk.booking(data.id), data);
      void qc.invalidateQueries({ queryKey: ['bookings', 'list'] });
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useCancelBooking(id: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BookingCancelIn) => bookingsApi.cancel(id, body),
    onSuccess: (data) => {
      qc.setQueryData(qk.booking(id), data);
      invalidateBookingRelated(qc);
    },
  });
}

export function useChecklist(bookingId: Uuid | undefined) {
  return useQuery({
    queryKey: qk.checklist(bookingId ?? ''),
    queryFn: () => bookingsApi.checklist(bookingId as Uuid),
    enabled: !!bookingId,
  });
}

export function useUpdateChecklistItem(bookingId: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, status }: { itemId: Uuid; status: 'pending' | 'in_progress' | 'done' }) =>
      bookingsApi.updateChecklistItem(bookingId, itemId, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.checklist(bookingId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useItinerary(bookingId: Uuid | undefined) {
  return useQuery({
    queryKey: qk.itinerary(bookingId ?? ''),
    queryFn: () => bookingsApi.itinerary(bookingId as Uuid),
    enabled: !!bookingId,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------------------
export function useInstallments(bookingId: Uuid | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.installments(bookingId ?? ''),
    queryFn: () => paymentsApi.installments(bookingId as Uuid),
    enabled: !!bookingId && enabled,
  });
}

export function useOrders(params: { booking_id?: Uuid; page?: number }, enabled = true) {
  return useQuery({
    queryKey: qk.orders(params),
    queryFn: () => paymentsApi.listOrders(params),
    enabled,
  });
}

export function useOrder(id: Uuid | undefined, options: { pollMs?: number | false } = {}) {
  return useQuery({
    queryKey: qk.order(id ?? ''),
    queryFn: () => paymentsApi.getOrder(id as Uuid),
    enabled: !!id,
    refetchInterval: (query) => {
      if (!options.pollMs) return false;
      const status = query.state.data?.status;
      return status === 'created' || status === 'pending' || status === undefined ? options.pollMs : false;
    },
  });
}

export function useInvoices(params: { booking_id?: Uuid }, enabled = true) {
  return useQuery({
    queryKey: qk.invoices(params),
    queryFn: () => paymentsApi.listInvoices({ ...params, kind: 'patient_receipt' }),
    enabled,
  });
}

export function invalidateBookingRelated(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['bookings'] });
  void qc.invalidateQueries({ queryKey: ['payments'] });
  void qc.invalidateQueries({ queryKey: ['cases'] });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
}

// ---------------------------------------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------------------------------------
export function useVisaRequests(params: TravelListParams, enabled = true) {
  return useQuery({
    queryKey: qk.visa(params),
    queryFn: () => travelApi.listVisaRequests(params),
    enabled,
  });
}

export function useTravelBookings(params: TravelListParams, enabled = true) {
  return useQuery({
    queryKey: qk.travelBookings(params),
    queryFn: () => travelApi.listTravelBookings(params),
    enabled,
  });
}

export function useAccommodationBookings(params: TravelListParams, enabled = true) {
  return useQuery({
    queryKey: qk.accommodationBookings(params),
    queryFn: () => travelApi.listAccommodationBookings(params),
    enabled,
  });
}

export function useServiceBookings(params: TravelListParams, enabled = true) {
  return useQuery({
    queryKey: qk.serviceBookings(params),
    queryFn: () => travelApi.listServiceBookings(params),
    enabled,
  });
}

export function invalidateTravel(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ['travel'] });
  void qc.invalidateQueries({ queryKey: ['bookings'] });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
}

// ---------------------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------------------
export function useDocuments(params?: DocumentListParams) {
  return useQuery({ queryKey: qk.documents(params), queryFn: () => documentsApi.list(params) });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentUploadIn) => documentsApi.upload(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: Uuid) => documentsApi.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['cases'] });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------
// Messaging & notifications
// ---------------------------------------------------------------------------------------------------------
export function useConversations() {
  return useQuery({ queryKey: qk.conversations, queryFn: messagingApi.listConversations });
}

export function useMessages(conversationId: Uuid | undefined) {
  return useQuery({
    queryKey: qk.messages(conversationId ?? ''),
    queryFn: () => messagingApi.listMessages(conversationId as Uuid, { limit: 100 }),
    enabled: !!conversationId,
  });
}

export function useSendMessage(conversationId: Uuid) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MessageCreateIn) => messagingApi.sendMessage(conversationId, body),
    onSuccess: (message) => {
      qc.setQueryData(qk.messages(conversationId), (prev: import('@hig/shared/api').MessageOut[] | undefined) =>
        prev ? (prev.some((m) => m.id === message.id) ? prev : [...prev, message]) : [message],
      );
      void qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: Uuid) => messagingApi.markRead(conversationId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: messagingApi.createConversation,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.conversations }),
  });
}

export function useNotifications(params?: NotificationListParams) {
  return useQuery({
    queryKey: qk.notifications(params),
    queryFn: () => notificationsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useUnreadCount() {
  return useQuery({ queryKey: qk.unreadCount, queryFn: notificationsApi.unreadCount, refetchInterval: 60_000 });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: Uuid | 'all') => (id === 'all' ? notificationsApi.markAllRead() : notificationsApi.markRead(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
