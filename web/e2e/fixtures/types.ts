/**
 * Minimal API shapes (PLAN section 8) used by the e2e setup helpers. Deliberately local: the e2e package only
 * imports @playwright/test and Node built-ins, never workspace code.
 */
import type { UserRole } from './accounts';

export type Uuid = string;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UserOut {
  id: Uuid;
  email: string | null;
  full_name: string;
  role: UserRole;
  status: string;
  is_guest: boolean;
  patient_profile_id?: Uuid | null;
  agent_id?: Uuid | null;
  hospitals?: { id: Uuid; name: string; slug: string; member_role: string }[];
}

export interface TokenOut {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_token?: string | null;
  user: UserOut;
}

export interface IdSlugName {
  id: Uuid;
  slug: string;
  name: string;
}

export interface SpecialtyOut extends IdSlugName {
  description: string | null;
  savings_min_pct: number | null;
  savings_max_pct: number | null;
  procedures_count?: number;
}

export interface ProcedureOut extends IdSlugName {
  specialty: IdSlugName;
  benchmarks: { country_code: string; currency: string; cost_min_minor: number; cost_max_minor: number }[];
}

export interface PackageOut {
  id: Uuid;
  name: string;
  tier: 'medical_only' | 'medical_stay' | 'all_inclusive';
  price_minor: number;
  currency: string;
}

export interface HospitalProcedureOut {
  id: Uuid;
  hospital_id: Uuid;
  procedure: IdSlugName;
  price_min_minor: number;
  price_max_minor: number;
  currency: string;
  packages: PackageOut[];
}

export interface DoctorCard {
  id: Uuid;
  slug: string;
  full_name: string;
  specialty: IdSlugName;
  hospital: { id: Uuid; slug: string; name: string; city: string };
}

export interface HospitalCard {
  id: Uuid;
  slug: string;
  name: string;
  city: string;
  specialties: string[];
}

export interface HospitalDetail extends HospitalCard {
  doctors: DoctorCard[];
  procedures: HospitalProcedureOut[];
}

export interface AvailabilityDay {
  date: string;
  slot_kind: 'consultation' | 'admission';
  capacity: number;
  booked: number;
  available: number;
}

export type CaseStatus =
  | 'enquiry'
  | 'quoted'
  | 'accepted'
  | 'booked'
  | 'in_treatment'
  | 'completed'
  | 'cancelled'
  | 'declined';

export type QuoteLineCategory =
  | 'surgery'
  | 'hospital_stay'
  | 'medications'
  | 'tests_scans'
  | 'doctor_fees'
  | 'implants'
  | 'other';

export interface QuoteLineItem {
  category: QuoteLineCategory;
  description: string;
  amount_minor: number;
}

export interface QuoteOut {
  id: Uuid;
  case_id: Uuid;
  status: string;
  line_items: QuoteLineItem[];
  total_minor: number;
  currency: string;
  valid_until: string | null;
}

export type BookingStatus = 'pending_payment' | 'confirmed' | 'admitted' | 'completed' | 'cancelled';

export interface BookingOut {
  id: Uuid;
  booking_number: string;
  case_id: Uuid;
  status: BookingStatus;
  hospital: { id: Uuid; name: string; city: string };
  admission_date: string | null;
  total_minor: number;
  deposit_minor: number;
  amount_paid_minor: number;
  currency: string;
}

export interface CaseOut {
  id: Uuid;
  case_number: string;
  status: CaseStatus;
  patient: { id: Uuid; full_name: string };
  hospital: { id: Uuid; slug: string; name: string; city: string };
  latest_quote: QuoteOut | null;
  booking: BookingOut | null;
}

export interface PaymentOrderOut {
  id: Uuid;
  order_number: string;
  purpose: string;
  status: string;
  gateway: string;
  amount_minor: number;
  currency: string;
  booking_id: Uuid | null;
}

export interface CheckoutOut {
  order: PaymentOrderOut;
  gateway: string;
  mock?: { complete_url: string } | null;
}

export interface ConversationOut {
  id: Uuid;
  kind: 'case' | 'support' | 'direct';
  case_id: Uuid | null;
  subject: string | null;
}

export interface MessageOut {
  id: Uuid;
  conversation_id: Uuid;
  body: string;
  created_at: string;
}

export interface AgentPatientOut {
  id: Uuid;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

export interface SettlementItemOut {
  id: Uuid;
  payee_type: 'hospital' | 'agent' | 'vendor';
  payee_id: Uuid;
  payee_name?: string | null;
  booking_id: Uuid;
  booking_number?: string | null;
  net_minor: number;
  status: string;
  eligible_at: string | null;
  batch_id: Uuid | null;
}

export interface PayoutOut {
  id: Uuid;
  batch_id: Uuid;
  payee_name?: string | null;
  amount_minor: number;
  method: string;
  status: string;
  utr: string | null;
  /** SEC-063: echoed by the second finance user to mark-paid/approve */
  paid_request_id?: Uuid | null;
}

export interface SettlementBatchOut {
  id: Uuid;
  batch_number: string;
  payee_type: string;
  status: string;
  items_count: number;
  total_net_minor: number;
  created_by?: Uuid | null;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  created_at?: string;
  payouts?: PayoutOut[];
}

export interface PlatformSetting {
  key: string;
  value: unknown;
}
