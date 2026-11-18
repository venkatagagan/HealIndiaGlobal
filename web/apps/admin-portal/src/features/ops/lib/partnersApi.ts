/**
 * Insurance products and pay-later (financing) partners: the catalog and the patient leads handed over with
 * consent. Shapes mirror backend/app/modules/partners/schemas.py. Heal India Global only lists partners and passes
 * leads on; it never sells insurance or lends money. Reads: any staff; catalog writes: admin | super_admin;
 * lead status / note updates: any staff.
 */
import { api, type Page } from '@hig/shared/api';

const seg = (value: string): string => encodeURIComponent(value);

/** `insurance` = /admin/insurance/products + /requests; `pay_later` = /admin/financing/partners + /requests */
export type PartnerKind = 'insurance' | 'pay_later';

export const INSURANCE_CATEGORIES = ['medical_travel', 'complication', 'health', 'other'] as const;
export type InsuranceCategory = (typeof INSURANCE_CATEGORIES)[number];

export interface OfferingOut {
  id: string;
  kind: PartnerKind;
  provider_name: string;
  product_name: string;
  category: string | null;
  summary: string;
  /** ISO-2; empty = every country */
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
  created_at: string;
  updated_at: string;
}

export interface OfferingIn {
  provider_name: string;
  product_name: string;
  category?: string | null;
  summary?: string;
  countries?: string[];
  price_min_minor?: number | null;
  price_max_minor?: number | null;
  currency?: string | null;
  price_note?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
  sort?: number;
}

export const LEAD_STATUSES = ['new', 'in_progress', 'shared_with_partner', 'closed', 'cancelled'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** Statuses staff may set (cancelled is the patient's own withdrawal). */
export const STAFF_LEAD_STATUSES = ['new', 'in_progress', 'shared_with_partner', 'closed'] as const satisfies readonly LeadStatus[];

export interface AdminLeadOut {
  id: string;
  kind: PartnerKind;
  offering_id: string | null;
  provider_name: string;
  product_name: string;
  case_id: string | null;
  booking_id: string | null;
  status: LeadStatus;
  partner_website_url: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  preferred_contact: string | null;
  country: string | null;
  message: string | null;
  patient_id: string | null;
  case_number: string | null;
  consent_id: string | null;
  consent_granted_at: string | null;
  staff_note: string | null;
  handled_by: { id: string; full_name: string } | null;
  handled_at: string | null;
  shared_at: string | null;
}

export interface LeadUpdate {
  status?: LeadStatus;
  staff_note?: string | null;
}

export interface LeadStatusCounts {
  counts: Partial<Record<LeadStatus, number>>;
  total: number;
}

export interface LeadListParams {
  status?: LeadStatus;
  page?: number;
  page_size?: number;
}

const catalogBase = (kind: PartnerKind) => (kind === 'insurance' ? '/admin/insurance/products' : '/admin/financing/partners');
const leadsBase = (kind: PartnerKind) => (kind === 'insurance' ? '/admin/insurance/requests' : '/admin/financing/requests');

export const partnersApi = {
  listOfferings: (kind: PartnerKind) => api.get<OfferingOut[]>(catalogBase(kind)),
  createOffering: (kind: PartnerKind, body: OfferingIn) => api.post<OfferingOut>(catalogBase(kind), body),
  updateOffering: (kind: PartnerKind, id: string, body: Partial<OfferingIn>) =>
    api.patch<OfferingOut>(`${catalogBase(kind)}/${seg(id)}`, body),
  deleteOffering: (kind: PartnerKind, id: string) => api.delete(`${catalogBase(kind)}/${seg(id)}`),

  listLeads: (kind: PartnerKind, params?: LeadListParams) => api.get<Page<AdminLeadOut>>(leadsBase(kind), params),
  leadStatusCounts: (kind: PartnerKind) => api.get<LeadStatusCounts>(`${leadsBase(kind)}/status-counts`),
  updateLead: (kind: PartnerKind, id: string, body: LeadUpdate) => api.patch<AdminLeadOut>(`${leadsBase(kind)}/${seg(id)}`, body),
};

export const partnerKeys = {
  catalog: (kind: PartnerKind) => ['admin', 'partners', kind, 'catalog'] as const,
  leads: (kind: PartnerKind) => ['admin', 'partners', kind, 'leads'] as const,
};
