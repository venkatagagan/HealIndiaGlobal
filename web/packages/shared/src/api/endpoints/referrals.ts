/**
 * Referral programme + platform credit (patients), the public code check and the staff referrals pages.
 * Backend: backend/app/modules/referrals. Types live next to the endpoints (like phase1.ts).
 */
import { api } from '../client';
import type { PaymentPurpose } from '../enums';
import type { CurrencyCode, IsoDateTime, Page, PageParams, Uuid } from '../types';
import { seg } from './_util';
import { getDeviceId } from './phase1';

export const REFERRAL_STATUSES = ['pending', 'qualified', 'rewarded', 'void'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];
export const REFERRAL_CHANNELS = ['website', 'patient_web', 'mobile', 'other'] as const;
export type ReferralChannel = (typeof REFERRAL_CHANNELS)[number];
export const PATIENT_CREDIT_KINDS = ['referrer_reward', 'referee_reward', 'reinstated'] as const;
export type PatientCreditKind = (typeof PATIENT_CREDIT_KINDS)[number];
export const PATIENT_CREDIT_STATUSES = ['active', 'used', 'expired', 'void'] as const;
export type PatientCreditStatus = (typeof PATIENT_CREDIT_STATUSES)[number];
export const CREDIT_MOVEMENT_KINDS = ['grant', 'redeem', 'reinstate', 'expire', 'void'] as const;
export type CreditMovementKind = (typeof CREDIT_MOVEMENT_KINDS)[number];
/** `reason` of GET /patient/credits/preview when credit cannot be applied */
export type CreditNotApplicableReason = 'installments' | 'nothing_due' | 'no_credit' | 'amount_too_small' | 'programme_off';
/** Attribution channel sent as `X-Client-App` on sign-up. */
export type ClientApp = 'website' | 'patient_web' | 'mobile';

export interface MoneyAmount {
  amount_minor: number;
  currency: CurrencyCode;
}

export interface CreditBalanceOut {
  /** usable credit in INR */
  base_amount_minor: number;
  base_currency: CurrencyCode;
  /** usable credit in the patient's preferred currency */
  amount_minor: number;
  currency: CurrencyCode;
  /** in `currency`: credit expiring within 30 days */
  expiring_soon_minor: number;
  next_expiry_at: IsoDateTime | null;
}

export interface ReferralRewardInfo {
  referrer: MoneyAmount | null;
  referee: MoneyAmount | null;
  max_rewards_per_year: number;
  credit_validity_days: number;
}

export interface MyReferralOut {
  id: Uuid;
  /** first name + initial, e.g. "Jane D." */
  friend_name: string;
  status: ReferralStatus;
  created_at: IsoDateTime;
  rewarded_at: IsoDateTime | null;
  reward: MoneyAmount | null;
}

/** GET /patient/referral */
export interface ReferralOverviewOut {
  enabled: boolean;
  code: string | null;
  /** website link `https://site/?ref=CODE` */
  share_url: string | null;
  /** patient web `/register?ref=CODE` */
  patient_web_url: string | null;
  /** `healindia://register?ref=CODE` */
  app_url: string | null;
  rewards: ReferralRewardInfo;
  credit: CreditBalanceOut;
  counts: Partial<Record<ReferralStatus, number>>;
  referrals: MyReferralOut[];
}

export interface CreditOut {
  id: Uuid;
  kind: PatientCreditKind;
  status: PatientCreditStatus;
  /** INR */
  amount_minor: number;
  /** INR */
  remaining_minor: number;
  currency: CurrencyCode;
  original_amount_minor: number | null;
  original_currency: CurrencyCode | null;
  display_remaining_minor: number;
  display_currency: CurrencyCode;
  expires_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface CreditMovementOut {
  id: Uuid;
  credit_id: Uuid;
  kind: CreditMovementKind;
  /** INR */
  amount_minor: number;
  display_amount_minor: number;
  display_currency: CurrencyCode;
  booking_id: Uuid | null;
  payment_id: Uuid | null;
  created_at: IsoDateTime;
}

/** GET /patient/credits */
export interface CreditsOut {
  balance: CreditBalanceOut;
  credits: CreditOut[];
  movements: CreditMovementOut[];
}

export type CreditPurpose = Extract<PaymentPurpose, 'booking_deposit' | 'booking_balance' | 'booking_full'>;

/** GET /patient/credits/preview */
export interface CreditPreviewOut {
  booking_id: Uuid;
  purpose: CreditPurpose;
  /** booking currency */
  currency: CurrencyCode;
  due_minor: number;
  /** credit available, in the booking currency */
  available_minor: number;
  available_base_minor: number;
  base_currency: CurrencyCode;
  apply_minor: number;
  remaining_due_minor: number;
  applicable: boolean;
  reason: CreditNotApplicableReason | null;
}

export interface CreditApplyIn {
  booking_id: Uuid;
  purpose: CreditPurpose;
}

/** POST /patient/credits/apply */
export interface CreditApplyOut {
  order_id: Uuid;
  order_number: string;
  payment_id: Uuid;
  applied_minor: number;
  currency: CurrencyCode;
  applied_base_minor: number;
  /** 0 = the payment is complete */
  remaining_due_minor: number;
  credit: CreditBalanceOut;
}

/** GET /referrals/check (public) */
export interface ReferralCodeCheckOut {
  valid: boolean;
  kind: 'patient' | 'agent' | null;
  referee_reward: MoneyAmount | null;
}

export const patientReferralsApi = {
  /** personal code, share links, rewards, credit balance and friends (sends the browser install id) */
  overview: () => api.get<ReferralOverviewOut>('/patient/referral', null, { headers: { 'X-Device-Id': getDeviceId() } }),
  credits: () => api.get<CreditsOut>('/patient/credits'),
  preview: (bookingId: Uuid, purpose: CreditPurpose) =>
    api.get<CreditPreviewOut>('/patient/credits/preview', { booking_id: bookingId, purpose }),
  /** 400 `credit_not_applicable` (details.reason); 409 `credit_changed` / `payment_in_progress` */
  apply: (body: CreditApplyIn) => api.post<CreditApplyOut>('/patient/credits/apply', body),
  /** public: is a sign-up code valid, and what does the new patient get */
  check: (code: string, currency?: string | null) =>
    api.get<ReferralCodeCheckOut>('/referrals/check', { code, currency: currency || undefined }, { skipAuth: true }),
};

// ---------------------------------------------------------------------------------------------------------
// Sign-up referral code kept across navigation (`?ref=CODE`)
// ---------------------------------------------------------------------------------------------------------
const REF_KEY = 'hig.ref';
/** Patient codes "R" + 9 chars, agent codes "AGT" + 5; accept any short alphanumeric code. */
const REF_RE = /^[A-Za-z0-9-]{3,16}$/;

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return REF_RE.test(code) ? code : null;
}

/** Saves `?ref=` / `?referral_code=` from the current URL (localStorage) and returns the remembered code. */
export function captureReferralCode(search?: string): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const fromUrl = normalizeReferralCode(params.get('ref') ?? params.get('referral_code'));
  try {
    if (fromUrl) window.localStorage.setItem(REF_KEY, fromUrl);
    return fromUrl ?? normalizeReferralCode(window.localStorage.getItem(REF_KEY));
  } catch {
    return fromUrl;
  }
}

/** The remembered sign-up code, if any. */
export function storedReferralCode(): string | null {
  try {
    return normalizeReferralCode(window.localStorage.getItem(REF_KEY));
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  try {
    window.localStorage.removeItem(REF_KEY);
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------------------
export interface ReferralPartyOut {
  patient_id: Uuid;
  user_id: Uuid | null;
  name: string;
  email: string | null;
}

export interface ReferralCreditBrief {
  id: Uuid;
  patient_id: Uuid;
  kind: PatientCreditKind;
  status: PatientCreditStatus;
  /** INR */
  amount_minor: number;
  remaining_minor: number;
  original_amount_minor: number | null;
  original_currency: CurrencyCode | null;
}

export interface AdminReferralOut {
  id: Uuid;
  code: string;
  status: ReferralStatus;
  channel: ReferralChannel;
  referrer: ReferralPartyOut;
  referred: ReferralPartyOut;
  created_at: IsoDateTime;
  expires_at: IsoDateTime | null;
  qualified_at: IsoDateTime | null;
  rewarded_at: IsoDateTime | null;
  voided_at: IsoDateTime | null;
  void_reason: string | null;
  qualifying_booking_id: Uuid | null;
  checks: Record<string, unknown>;
  credits: ReferralCreditBrief[];
}

export interface AdminReferralListParams extends PageParams {
  status?: ReferralStatus[];
  q?: string;
}

/** GET /admin/referrals/summary (all *_minor in INR) */
export interface ReferralSummaryOut {
  by_status: Partial<Record<ReferralStatus, number>>;
  by_channel: Partial<Record<ReferralChannel, number>>;
  credits_issued_minor: number;
  credits_redeemed_minor: number;
  credits_expired_minor: number;
  credits_voided_minor: number;
  credits_reinstated_minor: number;
  outstanding_minor: number;
  ledger_liability_minor: number;
  base_currency: CurrencyCode;
}

export interface ReferralProgrammeSettings {
  enabled?: boolean;
  reward_referrer?: boolean;
  reward_referee?: boolean;
  /** reward in minor units per currency, e.g. {USD: 5000} */
  referrer_reward?: Record<CurrencyCode, number>;
  referee_reward?: Record<CurrencyCode, number>;
  fallback_currency?: CurrencyCode;
  max_rewards_per_year?: number;
  credit_validity_days?: number;
  qualify_within_days?: number;
  [key: string]: unknown;
}

/** GET /admin/referrals/settings */
export interface ReferralSettingsOut {
  env_enabled: boolean;
  effective_enabled: boolean;
  setting_key: string;
  value: ReferralProgrammeSettings;
}

export const adminReferralsApi = {
  list: (params?: AdminReferralListParams) => api.get<Page<AdminReferralOut>>('/admin/referrals', params),
  summary: () => api.get<ReferralSummaryOut>('/admin/referrals/summary'),
  settings: () => api.get<ReferralSettingsOut>('/admin/referrals/settings'),
  get: (id: Uuid) => api.get<AdminReferralOut>(`/admin/referrals/${seg(id)}`),
  /** admin | finance | super_admin; reason 3..500 characters */
  void: (id: Uuid, reason: string) => api.post<AdminReferralOut>(`/admin/referrals/${seg(id)}/void`, { reason }),
};
