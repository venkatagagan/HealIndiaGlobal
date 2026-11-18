/**
 * Insurance and pay-later partners (CG-18): partner catalog, the patient's hand-off requests ("leads") and the
 * interest-free instalment rule. The platform only lists partners and passes contact details on with consent; it
 * never sells insurance or lends. Types mirror `backend/app/modules/partners/schemas.py` and are kept here so
 * the shared package does not have to change for this screen.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isApiError, type IsoDate, type IsoDateTime, type Uuid } from '@hig/shared/api';

// ---------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------
export type PartnerKind = 'insurance' | 'pay_later';
export type InsuranceCategory = 'medical_travel' | 'complication' | 'health' | 'other';
export type PreferredContact = 'email' | 'phone' | 'whatsapp';
export type PartnerLeadStatus = 'new' | 'in_progress' | 'shared_with_partner' | 'closed' | 'cancelled';

/** Version of the "share my contact details" consent text shown next to the checkbox. */
export const PARTNER_CONSENT_VERSION = '2026-11-18';

export interface OfferingOut {
  id: Uuid;
  kind: PartnerKind;
  provider_name: string;
  product_name: string;
  /** insurance: InsuranceCategory (free text on the server, unknown values show as "Other") */
  category: string | null;
  summary: string;
  /** ISO-2; empty = all countries */
  countries: string[];
  price_min_minor: number | null;
  price_max_minor: number | null;
  currency: string | null;
  price_note: string | null;
  website_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  sort: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface LeadCreateIn {
  product_id?: Uuid;
  partner_id?: Uuid;
  case_id?: Uuid;
  booking_id?: Uuid;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  preferred_contact?: PreferredContact;
  country?: string;
  message?: string;
  consent_share_contact: boolean;
  consent_version?: string;
}

export interface LeadOut {
  id: Uuid;
  kind: PartnerKind;
  offering_id: Uuid | null;
  provider_name: string;
  product_name: string;
  case_id: Uuid | null;
  booking_id: Uuid | null;
  status: PartnerLeadStatus;
  /** hand-off: the partner's own page, where they quote / decide eligibility */
  partner_website_url: string | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

export interface InstallmentRow {
  seq: number;
  due_date: IsoDate;
  amount_minor: number;
}

export interface InstallmentPlanOut {
  admission_date: IsoDate;
  today: IsoDate;
  /** the latest allowed due date (the day before admission) */
  last_due_by: IsoDate;
  /** 0 = no instalments possible for this admission date */
  max_months: number;
  allowed_months: number[];
  months: number | null;
  valid: boolean | null;
  schedule: InstallmentRow[];
  interest_free: boolean;
  /** an active pay-later partner exists (for the patient's country when given) */
  partner_financing_available: boolean;
}

export interface InstallmentPlanParams {
  admission_date: IsoDate;
  months?: number;
  total_minor?: number;
  deposit_minor?: number;
  country?: string;
}

/** Statuses the patient can still withdraw. */
export const OPEN_LEAD_STATUSES: readonly PartnerLeadStatus[] = ['new', 'in_progress', 'shared_with_partner'];

/** Error codes of the lead endpoints that the UI explains in its own words. */
export const LEAD_ERROR_CODES = ['consent_required', 'partner_country_not_eligible', 'duplicate_request', 'offering_not_found'] as const;
export type LeadErrorCode = (typeof LEAD_ERROR_CODES)[number];

export function leadErrorCode(err: unknown): LeadErrorCode | null {
  if (!isApiError(err)) return null;
  return (LEAD_ERROR_CODES as readonly string[]).includes(err.code) ? (err.code as LeadErrorCode) : null;
}

/** `POST /bookings` with too many instalment months (CG-18): details `{max_months, last_due_by}`. */
export function installmentsPastTreatment(err: unknown): { max_months: number | null; last_due_by: string | null } | null {
  if (!isApiError(err) || err.code !== 'installments_past_treatment') return null;
  const d = (err.details ?? {}) as { max_months?: unknown; last_due_by?: unknown };
  return {
    max_months: typeof d.max_months === 'number' ? d.max_months : null,
    last_due_by: typeof d.last_due_by === 'string' ? d.last_due_by : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------------------
const seg = (id: string) => encodeURIComponent(id);

const leadBase = (kind: PartnerKind) => (kind === 'insurance' ? '/insurance/requests' : '/financing/eligibility-checks');

export const partnersApi = {
  insuranceProducts: (country?: string | null) =>
    api.get<OfferingOut[]>('/insurance/products', { country: country || undefined }),
  financingPartners: (country?: string | null) =>
    api.get<OfferingOut[]>('/financing/partners', { country: country || undefined }),
  leads: (kind: PartnerKind) => api.get<LeadOut[]>(leadBase(kind)),
  createLead: (kind: PartnerKind, body: LeadCreateIn) => api.post<LeadOut>(leadBase(kind), body),
  cancelLead: (kind: PartnerKind, id: Uuid) => api.post<LeadOut>(`${leadBase(kind)}/${seg(id)}/cancel`),
  installmentPlan: (params: InstallmentPlanParams) => api.get<InstallmentPlanOut>('/financing/installment-plan', params),
};

// ---------------------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------------------
export const partnerKeys = {
  offerings: (kind: PartnerKind, country: string) => ['partners', 'offerings', kind, country] as const,
  leads: (kind: PartnerKind) => ['partners', 'leads', kind] as const,
  installmentPlan: (params: InstallmentPlanParams) => ['partners', 'installment-plan', params] as const,
};

export function useOfferings(kind: PartnerKind, country: string | null) {
  return useQuery({
    queryKey: partnerKeys.offerings(kind, country ?? ''),
    queryFn: () => (kind === 'insurance' ? partnersApi.insuranceProducts(country) : partnersApi.financingPartners(country)),
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLeads(kind: PartnerKind) {
  return useQuery({ queryKey: partnerKeys.leads(kind), queryFn: () => partnersApi.leads(kind) });
}

export function useCreateLead(kind: PartnerKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadCreateIn) => partnersApi.createLead(kind, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: partnerKeys.leads(kind) }),
  });
}

export function useCancelLead(kind: PartnerKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: Uuid) => partnersApi.cancelLead(kind, id),
    onSettled: () => void qc.invalidateQueries({ queryKey: partnerKeys.leads(kind) }),
  });
}

/** Plan for an admission date (CG-18): disabled until a date is chosen. */
export function useInstallmentPlan(params: InstallmentPlanParams | null) {
  return useQuery({
    queryKey: partnerKeys.installmentPlan(params ?? { admission_date: '' }),
    queryFn: () => partnersApi.installmentPlan(params as InstallmentPlanParams),
    enabled: !!params?.admission_date,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
  });
}
