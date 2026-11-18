/**
 * React Query hooks for the phase-1 screens: cost highlights, procedure / hospital / doctor pages, quick quote,
 * visa guide, reviews, aftercare, the guest free call and guardian consent.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aftercareApi,
  catalogApi,
  catalogDisplayApi,
  guardianConsentApi,
  guestCallApi,
  isApiError,
  privacyApi,
  quickQuoteApi,
  reviewsApi,
  visaGuideApi,
  type CheckinSubmitIn,
  type CostHighlightsParams,
  type DoctorListParams,
  type FollowupRequestIn,
  type GuardianConsentIn,
  type HospitalListParams,
  type IntroRequestIn,
  type PageParams,
  type QuoteRequestIn,
  type ReviewCreateIn,
  type ReviewUpdateIn,
  type Uuid,
} from '@hig/shared/api';
import { qk as baseQk } from './queries';

export const pk = {
  highlights: (params: CostHighlightsParams) => ['cost-highlights', params] as const,
  procedure: (slug: string, currency?: string) => ['procedure', slug, currency ?? ''] as const,
  procedureEarliest: (slug: string, currency?: string) => ['procedure-earliest', slug, currency ?? ''] as const,
  hospitalDetail: (slug: string, currency?: string) => ['hospital', slug, currency ?? ''] as const,
  doctorDetail: (id: string, currency?: string) => ['doctor', id, currency ?? ''] as const,
  hospitals: (params: HospitalListParams) => ['catalog', 'hospitals', params] as const,
  doctors: (params: DoctorListParams) => ['catalog', 'doctors', params] as const,
  hospitalReviews: (id: string, params: PageParams) => ['reviews', 'hospital', id, params] as const,
  doctorReviews: (id: string, params: PageParams) => ['reviews', 'doctor', id, params] as const,
  quoteGroup: (id: Uuid) => ['quote-group', id] as const,
  visaGuide: (nationality: string) => ['visa-guide', nationality] as const,
  myReviews: ['reviews', 'mine'] as const,
  eligibleReviews: ['reviews', 'eligible'] as const,
  aftercare: ['aftercare'] as const,
  introCall: ['guest-intro-call'] as const,
  guardian: ['guardian-consent'] as const,
};

// ---------------------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------------------
export function useCostHighlights(params: CostHighlightsParams) {
  return useQuery({
    queryKey: pk.highlights(params),
    queryFn: () => catalogApi.costHighlights(params),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useProcedure(slug: string | undefined, currency?: string) {
  return useQuery({
    queryKey: pk.procedure(slug ?? '', currency),
    queryFn: () => catalogDisplayApi.procedure(slug as string, currency),
    enabled: !!slug,
    staleTime: 10 * 60_000,
  });
}

/** Home vs India for one procedure; `country` optional (server: profile, detection, else US with is_fallback). */
export function useProcedureCost(slug: string | undefined, country?: string | null, currency?: string) {
  return useQuery({
    queryKey: ['cost-comparison', 'procedure', slug ?? '', country ?? '', currency ?? ''],
    queryFn: () => catalogApi.costComparison({ procedure: slug as string, country: country ?? undefined, currency }),
    enabled: !!slug,
    staleTime: 10 * 60_000,
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
}

export function useProcedureEarliest(slug: string | undefined, currency?: string) {
  return useQuery({
    queryKey: pk.procedureEarliest(slug ?? '', currency),
    queryFn: () => catalogApi.procedureEarliest(slug as string, { limit: 20, currency }),
    enabled: !!slug,
    staleTime: 2 * 60_000,
  });
}

export function useHospitalDetail(slug: string | undefined, currency?: string) {
  return useQuery({
    queryKey: pk.hospitalDetail(slug ?? '', currency),
    queryFn: () => catalogDisplayApi.hospital(slug as string, currency),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}

export function useDoctorDetail(id: string | undefined, currency?: string) {
  return useQuery({
    queryKey: pk.doctorDetail(id ?? '', currency),
    queryFn: () => catalogDisplayApi.doctor(id as string, currency),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useHospitalList(params: HospitalListParams, enabled = true) {
  return useQuery({
    queryKey: pk.hospitals(params),
    queryFn: () => catalogApi.listHospitals(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useDoctorList(params: DoctorListParams, enabled = true) {
  return useQuery({
    queryKey: pk.doctors(params),
    queryFn: () => catalogApi.listDoctors(params),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useHospitalReviews(id: string | undefined, params: PageParams) {
  return useQuery({
    queryKey: pk.hospitalReviews(id ?? '', params),
    queryFn: () => catalogApi.hospitalReviews(id as string, params),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

export function useDoctorReviews(id: string | undefined, params: PageParams) {
  return useQuery({
    queryKey: pk.doctorReviews(id ?? '', params),
    queryFn: () => catalogApi.doctorReviews(id as string, params),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Quick quote
// ---------------------------------------------------------------------------------------------------------
export function useQuoteRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QuoteRequestIn) => quickQuoteApi.request(body),
    onSuccess: (group) => {
      qc.setQueryData(pk.quoteGroup(group.quote_group_id), group);
      void qc.invalidateQueries({ queryKey: ['cases'] });
      void qc.invalidateQueries({ queryKey: baseQk.dashboard });
    },
  });
}

export function useQuoteGroup(id: Uuid | undefined) {
  return useQuery({
    queryKey: pk.quoteGroup(id ?? ''),
    queryFn: () => quickQuoteApi.group(id as Uuid),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Visa guide
// ---------------------------------------------------------------------------------------------------------
export function useVisaGuide(nationality: string | null | undefined) {
  return useQuery({
    queryKey: pk.visaGuide(nationality ?? ''),
    queryFn: () => visaGuideApi.guide(nationality as string),
    enabled: !!nationality,
    staleTime: 30 * 60_000,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------------------------------------
export function useMyReviews(enabled = true) {
  return useQuery({ queryKey: pk.myReviews, queryFn: reviewsApi.mine, enabled });
}

export function useEligibleReviews(enabled = true) {
  return useQuery({ queryKey: pk.eligibleReviews, queryFn: reviewsApi.eligible, enabled, staleTime: 5 * 60_000 });
}

function useInvalidateReviews() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['reviews'] });
}

export function useCreateReview() {
  const invalidate = useInvalidateReviews();
  return useMutation({ mutationFn: (body: ReviewCreateIn) => reviewsApi.create(body), onSuccess: invalidate });
}

export function useUpdateReview() {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: ({ id, body }: { id: Uuid; body: ReviewUpdateIn }) => reviewsApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteReview() {
  const invalidate = useInvalidateReviews();
  return useMutation({ mutationFn: (id: Uuid) => reviewsApi.remove(id), onSuccess: invalidate });
}

// ---------------------------------------------------------------------------------------------------------
// Aftercare
// ---------------------------------------------------------------------------------------------------------
export function useAftercare(enabled = true) {
  return useQuery({ queryKey: pk.aftercare, queryFn: aftercareApi.overview, enabled });
}

export function useSubmitCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: Uuid; body: CheckinSubmitIn }) => aftercareApi.submitCheckin(id, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: pk.aftercare }),
  });
}

export function useRequestFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FollowupRequestIn) => aftercareApi.requestFollowup(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: pk.aftercare }),
  });
}

// ---------------------------------------------------------------------------------------------------------
// Guest free call
// ---------------------------------------------------------------------------------------------------------
/** The guest's free call; `null` when none was booked yet (404). */
export function useIntroCall(enabled = true) {
  return useQuery({
    queryKey: pk.introCall,
    queryFn: async () => {
      try {
        return await guestCallApi.get();
      } catch (err) {
        if (isApiError(err) && err.status === 404) return null;
        throw err;
      }
    },
    enabled,
    refetchInterval: 60_000,
  });
}

export function useBookIntroCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IntroRequestIn) => guestCallApi.book(body),
    onSuccess: (call) => qc.setQueryData(pk.introCall, call),
  });
}

// ---------------------------------------------------------------------------------------------------------
// Guardian consent
// ---------------------------------------------------------------------------------------------------------
export function useGuardianStatus(enabled = true) {
  return useQuery({ queryKey: pk.guardian, queryFn: privacyApi.guardianStatus, enabled, staleTime: 60_000 });
}

export function useRecordGuardianConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GuardianConsentIn) => guardianConsentApi.record(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pk.guardian });
      void qc.invalidateQueries({ queryKey: baseQk.me });
    },
  });
}
