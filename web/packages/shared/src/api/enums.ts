/**
 * Enums from PLAN.md section 5 - exact values shared by backend, web and mobile.
 * Each enum is exported as a const array (for selects / iteration), a string-literal union type and a
 * label map (human readable; values are read through i18n, `common:enums.<map>.<value>`, English fallback).
 */
import i18next from 'i18next';

/** "pending_payment" -> "Pending payment" */
export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** English label of every enum value, by map name (`caseStatus` -> { enquiry: 'Enquiry', ... }). */
export const ENUM_LABELS_EN: Record<string, Readonly<Record<string, string>>> = {};

/**
 * Translates `common:enums.<map>.<value>` at read time. Uses the default i18next instance directly (the one
 * `lib/i18n` initialises) so this module has no import cycle with `lib/i18n` -> `api/client`.
 */
function translateEnum(map: string, value: string, english: string): string {
  if (!i18next.isInitialized) return english;
  const text = i18next.t(`common:enums.${map}.${value}`, { defaultValue: english });
  return typeof text === 'string' && text ? text : english;
}

/**
 * Label map whose values follow the UI language: every property is an enumerable getter returning the
 * translation at access time (`CASE_STATUS_LABELS[status]`, `Object.entries(...)` and spreads keep working;
 * spreads/copies capture the language of that moment).
 */
function labelsFor<const T extends readonly string[]>(
  map: string,
  values: T,
  overrides: Partial<Record<T[number], string>> = {},
): Record<T[number], string> {
  const english = {} as Record<T[number], string>;
  const out = {} as Record<T[number], string>;
  for (const v of values as readonly T[number][]) {
    const text = overrides[v] ?? humanize(v);
    english[v] = text;
    Object.defineProperty(out, v, {
      enumerable: true,
      configurable: false,
      get: () => translateEnum(map, v, text),
    });
  }
  ENUM_LABELS_EN[map] = Object.freeze(english);
  return Object.freeze(out);
}

/** Options for <Select> etc.: [{ value, label }] (the label is read lazily, so it follows the UI language). */
export function enumOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): { value: T; label: string }[] {
  return values.map((value) => ({
    value,
    get label() {
      return labels[value];
    },
  }));
}

export const USER_ROLES = ['patient', 'agent', 'hospital', 'admin', 'finance', 'support', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_ROLE_LABELS = labelsFor('userRole', USER_ROLES, {
  hospital: 'Hospital staff',
  admin: 'Operations admin',
  support: 'Support / coordinator',
  super_admin: 'Super admin',
});
/** Roles allowed in the admin portal. */
export const STAFF_ROLES = ['admin', 'finance', 'support', 'super_admin'] as const satisfies readonly UserRole[];
export type StaffRole = (typeof STAFF_ROLES)[number];
/** Roles that may self-register. */
export const REGISTRABLE_ROLES = ['patient', 'agent', 'hospital'] as const satisfies readonly UserRole[];
export type RegistrableRole = (typeof REGISTRABLE_ROLES)[number];

export const USER_STATUSES = ['active', 'pending_verification', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_STATUS_LABELS = labelsFor('userStatus', USER_STATUSES);

export const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS = labelsFor('gender', GENDERS, { undisclosed: 'Prefer not to say' });

export const DOCTOR_GENDER_PREFS = ['male', 'female', 'no_preference'] as const;
export type DoctorGenderPref = (typeof DOCTOR_GENDER_PREFS)[number];
export const DOCTOR_GENDER_PREF_LABELS = labelsFor('doctorGenderPref', DOCTOR_GENDER_PREFS);

export const KYC_STATUSES = ['not_submitted', 'pending', 'approved', 'rejected'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];
export const KYC_STATUS_LABELS = labelsFor('kycStatus', KYC_STATUSES, { pending: 'Under review' });

export const HOSPITAL_STATUSES = ['draft', 'pending_review', 'active', 'suspended', 'rejected'] as const;
export type HospitalStatus = (typeof HOSPITAL_STATUSES)[number];
export const HOSPITAL_STATUS_LABELS = labelsFor('hospitalStatus', HOSPITAL_STATUSES);

export const AGENT_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export const AGENT_STATUS_LABELS = labelsFor('agentStatus', AGENT_STATUSES, { pending: 'Pending approval' });

export const HOSPITAL_MEMBER_ROLES = ['owner', 'admin', 'coordinator', 'finance', 'doctor'] as const;
export type HospitalMemberRole = (typeof HOSPITAL_MEMBER_ROLES)[number];
export const HOSPITAL_MEMBER_ROLE_LABELS = labelsFor('hospitalMemberRole', HOSPITAL_MEMBER_ROLES);

export const PACKAGE_TIERS = ['medical_only', 'medical_stay', 'all_inclusive'] as const;
export type PackageTier = (typeof PACKAGE_TIERS)[number];
export const PACKAGE_TIER_LABELS = labelsFor('packageTier', PACKAGE_TIERS, {
  medical_only: 'Medical only',
  medical_stay: 'Medical + Stay',
  all_inclusive: 'All-inclusive',
});

export const SCREENING_STATUSES = ['draft', 'processing', 'completed', 'failed'] as const;
export type ScreeningStatus = (typeof SCREENING_STATUSES)[number];
export const SCREENING_STATUS_LABELS = labelsFor('screeningStatus', SCREENING_STATUSES);

export const URGENCIES = ['routine', 'soon', 'urgent', 'emergency'] as const;
export type Urgency = (typeof URGENCIES)[number];
export const URGENCY_LABELS = labelsFor('urgency', URGENCIES);

export const DURATION_UNITS = ['days', 'weeks', 'months', 'years'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
export const DURATION_UNIT_LABELS = labelsFor('durationUnit', DURATION_UNITS);

export const SEVERITY_LEVELS = ['none', 'mild', 'moderate', 'severe'] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
export const SEVERITY_LEVEL_LABELS = labelsFor('severityLevel', SEVERITY_LEVELS);

export const SYMPTOM_ANSWERS = ['yes', 'maybe', 'no'] as const;
export type SymptomAnswer = (typeof SYMPTOM_ANSWERS)[number];
export const SYMPTOM_ANSWER_LABELS = labelsFor('symptomAnswer', SYMPTOM_ANSWERS);

export const PREVIOUS_TREATMENTS = ['medication', 'physical_therapy', 'surgery', 'other'] as const;
export type PreviousTreatment = (typeof PREVIOUS_TREATMENTS)[number];
export const PREVIOUS_TREATMENT_LABELS = labelsFor('previousTreatment', PREVIOUS_TREATMENTS);

export const CASE_STATUSES = [
  'enquiry',
  'quoted',
  'accepted',
  'booked',
  'in_treatment',
  'completed',
  'cancelled',
  'declined',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_LABELS = labelsFor('caseStatus', CASE_STATUSES);

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS = labelsFor('quoteStatus', QUOTE_STATUSES);

export const QUOTE_LINE_CATEGORIES = [
  'surgery',
  'hospital_stay',
  'medications',
  'tests_scans',
  'doctor_fees',
  'implants',
  'other',
] as const;
export type QuoteLineCategory = (typeof QUOTE_LINE_CATEGORIES)[number];
export const QUOTE_LINE_CATEGORY_LABELS = labelsFor('quoteLineCategory', QUOTE_LINE_CATEGORIES, { tests_scans: 'Tests & scans' });

export const BOOKING_STATUSES = ['pending_payment', 'confirmed', 'admitted', 'completed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS = labelsFor('bookingStatus', BOOKING_STATUSES);

export const PAYMENT_OPTIONS = ['full', 'deposit', 'installments'] as const;
export type PaymentOption = (typeof PAYMENT_OPTIONS)[number];
export const PAYMENT_OPTION_LABELS = labelsFor('paymentOption', PAYMENT_OPTIONS, {
  full: 'Pay in full',
  deposit: 'Pay deposit now',
  installments: 'Payment plan',
});

export const CONSULTATION_STATUSES = ['requested', 'scheduled', 'completed', 'cancelled'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];
export const CONSULTATION_STATUS_LABELS = labelsFor('consultationStatus', CONSULTATION_STATUSES);

export const CONSULTATION_MODES = ['video', 'phone'] as const;
export type ConsultationMode = (typeof CONSULTATION_MODES)[number];
export const CONSULTATION_MODE_LABELS = labelsFor('consultationMode', CONSULTATION_MODES);

export const CHECKLIST_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];
export const CHECKLIST_STATUS_LABELS = labelsFor('checklistStatus', CHECKLIST_STATUSES);

export const CHECKLIST_KEYS = [
  'treatment_booked',
  'visa_approved',
  'flight_booked',
  'travel_insurance',
  'airport_pickup',
  'documents_uploaded',
  'accommodation_booked',
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export const CHECKLIST_KEY_LABELS = labelsFor('checklistKey', CHECKLIST_KEYS);

export const ITINERARY_KINDS = [
  'appointment',
  'admission',
  'surgery',
  'pickup',
  'checkin',
  'checkout',
  'followup',
  'sightseeing',
  'other',
] as const;
export type ItineraryKind = (typeof ITINERARY_KINDS)[number];
export const ITINERARY_KIND_LABELS = labelsFor('itineraryKind', ITINERARY_KINDS, {
  checkin: 'Check-in',
  checkout: 'Check-out',
  followup: 'Follow-up',
  pickup: 'Pick-up',
});

export const ITINERARY_STATUSES = ['scheduled', 'done', 'cancelled'] as const;
export type ItineraryStatus = (typeof ITINERARY_STATUSES)[number];
export const ITINERARY_STATUS_LABELS = labelsFor('itineraryStatus', ITINERARY_STATUSES);

export const VISA_STATUSES = [
  'not_started',
  'documents_pending',
  'invitation_issued',
  'applied',
  'approved',
  'rejected',
] as const;
export type VisaStatus = (typeof VISA_STATUSES)[number];
export const VISA_STATUS_LABELS = labelsFor('visaStatus', VISA_STATUSES);

export const VISA_TYPES = ['e_medical', 'e_medical_attendant'] as const;
export type VisaType = (typeof VISA_TYPES)[number];
export const VISA_TYPE_LABELS = labelsFor('visaType', VISA_TYPES, {
  e_medical: 'e-Medical visa',
  e_medical_attendant: 'e-Medical attendant visa',
});

export const TRAVEL_KINDS = ['flight', 'airport_pickup', 'airport_drop', 'local_transport'] as const;
export type TravelKind = (typeof TRAVEL_KINDS)[number];
export const TRAVEL_KIND_LABELS = labelsFor('travelKind', TRAVEL_KINDS);

export const SERVICE_BOOKING_STATUSES = ['requested', 'quoted', 'confirmed', 'completed', 'cancelled'] as const;
export type ServiceBookingStatus = (typeof SERVICE_BOOKING_STATUSES)[number];
export const SERVICE_BOOKING_STATUS_LABELS = labelsFor('serviceBookingStatus', SERVICE_BOOKING_STATUSES);

export const ACCOMMODATION_TYPES = ['hotel', 'guest_house', 'service_apartment', 'hospital_guest_room'] as const;
export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number];
export const ACCOMMODATION_TYPE_LABELS = labelsFor('accommodationType', ACCOMMODATION_TYPES);

export const SERVICE_KINDS = ['translator', 'local_guide', 'transport', 'travel_agent', 'insurance'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const SERVICE_KIND_LABELS = labelsFor('serviceKind', SERVICE_KINDS);

export const RATE_UNITS = ['hour', 'day', 'trip', 'fixed'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];
export const RATE_UNIT_LABELS = labelsFor('rateUnit', RATE_UNITS, { hour: 'Per hour', day: 'Per day', trip: 'Per trip' });

export const SOS_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];
export const SOS_STATUS_LABELS = labelsFor('sosStatus', SOS_STATUSES);

export const DOCUMENT_KINDS = [
  'passport',
  'visa',
  'medical_report',
  'prescription',
  'lab_result',
  'imaging',
  'invitation_letter',
  'invoice',
  'receipt',
  'kyc_registration',
  'kyc_accreditation',
  'kyc_pan',
  'kyc_gst',
  'kyc_id_proof',
  'bank_proof',
  'payment_proof',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_KIND_LABELS = labelsFor('documentKind', DOCUMENT_KINDS, {
  imaging: 'Imaging (X-ray / MRI / CT)',
  kyc_registration: 'KYC - Registration certificate',
  kyc_accreditation: 'KYC - Accreditation certificate',
  kyc_pan: 'KYC - PAN card',
  kyc_gst: 'KYC - GST certificate',
  kyc_id_proof: 'KYC - ID proof',
});
export const PATIENT_DOCUMENT_KINDS = [
  'passport',
  'visa',
  'medical_report',
  'prescription',
  'lab_result',
  'imaging',
  'payment_proof',
  'other',
] as const satisfies readonly DocumentKind[];
export const KYC_DOCUMENT_KINDS = [
  'kyc_registration',
  'kyc_accreditation',
  'kyc_pan',
  'kyc_gst',
  'kyc_id_proof',
  'bank_proof',
] as const satisfies readonly DocumentKind[];

export const DOCUMENT_STATUSES = ['uploaded', 'verified', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export const DOCUMENT_STATUS_LABELS = labelsFor('documentStatus', DOCUMENT_STATUSES);

export const CONSENT_KINDS = [
  'terms',
  'privacy',
  'ai_processing',
  'share_with_hospitals',
  'marketing',
  'share_with_agent',
  'guardian_consent',
] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];
export const CONSENT_KIND_LABELS = labelsFor('consentKind', CONSENT_KINDS, {
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  ai_processing: 'AI processing of my health information',
  share_with_hospitals: 'Share my case with partner hospitals',
  marketing: 'Marketing communications',
  share_with_agent: 'Share my documents with my agent',
  guardian_consent: 'Parent or guardian consent',
});

export const PAYMENT_GATEWAYS = ['razorpay', 'stripe', 'bank_transfer', 'mock', 'platform_credit'] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];
export const PAYMENT_GATEWAY_LABELS = labelsFor('paymentGateway', PAYMENT_GATEWAYS, {
  razorpay: 'Card / UPI (Razorpay)',
  stripe: 'Card (Stripe)',
  bank_transfer: 'Bank transfer (SWIFT)',
  mock: 'Test payment (dev)',
  platform_credit: 'Referral credit',
});

export const PAYMENT_PURPOSES = [
  'consultation_fee',
  'booking_deposit',
  'booking_balance',
  'booking_full',
  'installment',
  'service',
] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];
export const PAYMENT_PURPOSE_LABELS = labelsFor('paymentPurpose', PAYMENT_PURPOSES);

export const ORDER_STATUSES = [
  'created',
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
  'expired',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS = labelsFor('orderStatus', ORDER_STATUSES);

export const PAYMENT_STATUSES = [
  'created',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS = labelsFor('paymentStatus', PAYMENT_STATUSES);

export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'bank_transfer', 'wallet', 'emi', 'mock', 'platform_credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS = labelsFor('paymentMethod', PAYMENT_METHODS, {
  upi: 'UPI',
  emi: 'EMI',
  netbanking: 'Net banking',
  platform_credit: 'Referral credit',
});

export const REFUND_STATUSES = ['requested', 'approved', 'processing', 'processed', 'failed', 'rejected'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const REFUND_STATUS_LABELS = labelsFor('refundStatus', REFUND_STATUSES);

export const INSTALLMENT_STATUSES = ['due', 'paid', 'overdue', 'cancelled'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];
export const INSTALLMENT_STATUS_LABELS = labelsFor('installmentStatus', INSTALLMENT_STATUSES);

export const INVOICE_KINDS = ['patient_receipt', 'commission_invoice', 'agent_statement', 'credit_note'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const INVOICE_KIND_LABELS = labelsFor('invoiceKind', INVOICE_KINDS);

export const LEDGER_ACCOUNT_TYPES = ['asset', 'liability', 'revenue', 'expense', 'equity'] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];
export const LEDGER_ACCOUNT_TYPE_LABELS = labelsFor('ledgerAccountType', LEDGER_ACCOUNT_TYPES);

export const LEDGER_OWNER_TYPES = ['platform', 'hospital', 'agent', 'vendor', 'gateway', 'tax'] as const;
export type LedgerOwnerType = (typeof LEDGER_OWNER_TYPES)[number];
export const LEDGER_OWNER_TYPE_LABELS = labelsFor('ledgerOwnerType', LEDGER_OWNER_TYPES);

export const ENTRY_DIRECTIONS = ['debit', 'credit'] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];
export const ENTRY_DIRECTION_LABELS = labelsFor('entryDirection', ENTRY_DIRECTIONS);

export const LEDGER_TXN_TYPES = [
  'payment_captured',
  'gateway_fee',
  'revenue_recognition',
  'agent_commission',
  'refund',
  'payout',
  'adjustment',
  'cancellation_retention',
  'tax_remittance',
  'fx_difference',
] as const;
export type LedgerTxnType = (typeof LEDGER_TXN_TYPES)[number];
export const LEDGER_TXN_TYPE_LABELS = labelsFor('ledgerTxnType', LEDGER_TXN_TYPES);

export const COMMISSION_SCOPES = ['global', 'hospital', 'specialty', 'procedure', 'agent'] as const;
export type CommissionScope = (typeof COMMISSION_SCOPES)[number];
export const COMMISSION_SCOPE_LABELS = labelsFor('commissionScope', COMMISSION_SCOPES);

export const PAYEE_TYPES = ['hospital', 'agent', 'vendor'] as const;
export type PayeeType = (typeof PAYEE_TYPES)[number];
export const PAYEE_TYPE_LABELS = labelsFor('payeeType', PAYEE_TYPES);

export const SETTLEMENT_ITEM_STATUSES = ['pending', 'eligible', 'on_hold', 'batched', 'paid', 'reversed'] as const;
export type SettlementItemStatus = (typeof SETTLEMENT_ITEM_STATUSES)[number];
export const SETTLEMENT_ITEM_STATUS_LABELS = labelsFor('settlementItemStatus', SETTLEMENT_ITEM_STATUSES);

export const SETTLEMENT_BATCH_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'processing',
  'completed',
  'partially_failed',
  'cancelled',
] as const;
export type SettlementBatchStatus = (typeof SETTLEMENT_BATCH_STATUSES)[number];
export const SETTLEMENT_BATCH_STATUS_LABELS = labelsFor('settlementBatchStatus', SETTLEMENT_BATCH_STATUSES);

/** `needs_reconciliation`: the gateway outcome is unknown (SEC-004); finance resolves it by hand. */
export const PAYOUT_STATUSES = ['queued', 'processing', 'needs_reconciliation', 'processed', 'failed', 'reversed'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const PAYOUT_STATUS_LABELS = labelsFor('payoutStatus', PAYOUT_STATUSES);

export const PAYOUT_METHODS = ['razorpay_route', 'razorpayx', 'manual_bank_transfer', 'mock'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export const PAYOUT_METHOD_LABELS = labelsFor('payoutMethod', PAYOUT_METHODS, {
  razorpay_route: 'Razorpay Route',
  razorpayx: 'RazorpayX',
  mock: 'Mock (dev)',
});

export const PAYOUT_ACCOUNT_STATUSES = ['active', 'disabled'] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];
export const PAYOUT_ACCOUNT_STATUS_LABELS = labelsFor('payoutAccountStatus', PAYOUT_ACCOUNT_STATUSES);

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'dead'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS = labelsFor('jobStatus', JOB_STATUSES);

export const REVIEW_STATUSES = ['pending', 'published', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS = labelsFor('reviewStatus', REVIEW_STATUSES);

export const ACCREDITATIONS = ['jci', 'nabh', 'nabl', 'iso'] as const;
export type Accreditation = (typeof ACCREDITATIONS)[number];
export const ACCREDITATION_LABELS = labelsFor('accreditation', ACCREDITATIONS, { jci: 'JCI', nabh: 'NABH', nabl: 'NABL', iso: 'ISO' });

export const AGENT_TIERS = ['bronze', 'silver', 'gold'] as const;
export type AgentTier = (typeof AGENT_TIERS)[number];
export const AGENT_TIER_LABELS = labelsFor('agentTier', AGENT_TIERS);

export const SLOT_KINDS = ['consultation', 'admission'] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];
export const SLOT_KIND_LABELS = labelsFor('slotKind', SLOT_KINDS);

export const SAVED_ENTITY_TYPES = ['hospital', 'doctor', 'procedure'] as const;
export type SavedEntityType = (typeof SAVED_ENTITY_TYPES)[number];
export const SAVED_ENTITY_TYPE_LABELS = labelsFor('savedEntityType', SAVED_ENTITY_TYPES);

export const CONVERSATION_KINDS = ['case', 'support', 'direct'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];
export const CONVERSATION_KIND_LABELS = labelsFor('conversationKind', CONVERSATION_KINDS);

export const DEVICE_PLATFORMS = ['android', 'ios', 'web'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const AI_ENGINES = ['claude', 'rules'] as const;
export type AiEngine = (typeof AI_ENGINES)[number];

export const LIKELIHOODS = ['low', 'medium', 'high'] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];
export const LIKELIHOOD_LABELS = labelsFor('likelihood', LIKELIHOODS);

export const HOSPITAL_SORTS = ['rating', 'price', 'name', 'soonest'] as const;
export type HospitalSort = (typeof HOSPITAL_SORTS)[number];

export const REPORT_GROUP_BY = ['month', 'hospital', 'specialty'] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BY)[number];

export const EXPORT_TYPES = ['bookings', 'payments', 'settlements'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

/** Union of every status-like enum value - used by <StatusBadge>. */
export type AnyStatus =
  | UserStatus
  | KycStatus
  | HospitalStatus
  | AgentStatus
  | ScreeningStatus
  | Urgency
  | CaseStatus
  | QuoteStatus
  | BookingStatus
  | ConsultationStatus
  | ChecklistStatus
  | ItineraryStatus
  | VisaStatus
  | ServiceBookingStatus
  | SosStatus
  | DocumentStatus
  | OrderStatus
  | PaymentStatus
  | RefundStatus
  | InstallmentStatus
  | SettlementItemStatus
  | SettlementBatchStatus
  | PayoutStatus
  | PayoutAccountStatus
  | JobStatus
  | ReviewStatus;

/**
 * Body-map regions = the ONE body-area vocabulary used everywhere (PLAN catalog ids, design/body-map region ids,
 * `screenings.body_areas`, symptom library `body_areas`).
 */
export const BODY_AREAS = [
  'head',
  'neck',
  'chest',
  'abdomen',
  'pelvis',
  'back',
  'left_arm',
  'right_arm',
  'left_leg',
  'right_leg',
  'skin',
  'general',
] as const;
export type BodyArea = (typeof BODY_AREAS)[number];
export const BODY_AREA_LABELS = labelsFor('bodyArea', BODY_AREAS, {
  left_arm: 'Left arm',
  right_arm: 'Right arm',
  left_leg: 'Left leg',
  right_leg: 'Right leg',
  general: 'Whole body / general',
});

/**
 * Legacy fine-grained body-area ids (older agent screenings stored e.g. `eyes`, `knees`, `lower_back`) -> the
 * catalog ids above. Non-lateral limb parts map to both sides.
 */
const LEGACY_BODY_AREAS: Record<string, readonly BodyArea[]> = {
  face: ['head'], eye: ['head'], eyes: ['head'], ear: ['head'], ears: ['head'], nose: ['head'], mouth: ['head'],
  teeth: ['head'], jaw: ['head'], brain: ['head'],
  throat: ['neck'],
  heart: ['chest'], lungs: ['chest'], breast: ['chest'], breasts: ['chest'],
  stomach: ['abdomen'], belly: ['abdomen'], liver: ['abdomen'], kidney: ['abdomen'], kidneys: ['abdomen'],
  hip: ['pelvis'], hips: ['pelvis'], groin: ['pelvis'], bladder: ['pelvis'],
  upper_back: ['back'], lower_back: ['back'], spine: ['back'],
  shoulder: ['left_arm', 'right_arm'], shoulders: ['left_arm', 'right_arm'], arm: ['left_arm', 'right_arm'],
  arms: ['left_arm', 'right_arm'], elbow: ['left_arm', 'right_arm'], elbows: ['left_arm', 'right_arm'],
  wrist: ['left_arm', 'right_arm'], wrists: ['left_arm', 'right_arm'], hand: ['left_arm', 'right_arm'],
  hands: ['left_arm', 'right_arm'],
  thigh: ['left_leg', 'right_leg'], thighs: ['left_leg', 'right_leg'], leg: ['left_leg', 'right_leg'],
  legs: ['left_leg', 'right_leg'], knee: ['left_leg', 'right_leg'], knees: ['left_leg', 'right_leg'],
  ankle: ['left_leg', 'right_leg'], ankles: ['left_leg', 'right_leg'], foot: ['left_leg', 'right_leg'],
  feet: ['left_leg', 'right_leg'],
};
const ARM_PARTS = new Set(['shoulder', 'arm', 'elbow', 'wrist', 'hand']);
const LEG_PARTS = new Set(['hip', 'thigh', 'leg', 'knee', 'ankle', 'foot']);

export function isBodyArea(value: string): value is BodyArea {
  return (BODY_AREAS as readonly string[]).includes(value);
}

/** One stored body-area id -> catalog ids (`left_knee` -> `left_leg`, `knees` -> both legs, unknown -> []). */
export function toCatalogBodyAreas(id: string): BodyArea[] {
  const key = id.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (isBodyArea(key)) return [key];
  const side = /^(left|right)_(.+?)s?$/.exec(key);
  if (side) {
    const [, lr, part = ''] = side;
    if (ARM_PARTS.has(part)) return [lr === 'left' ? 'left_arm' : 'right_arm'];
    if (LEG_PARTS.has(part)) return [lr === 'left' ? 'left_leg' : 'right_leg'];
  }
  return [...(LEGACY_BODY_AREAS[key] ?? [])];
}

/** Stored body areas (possibly legacy fine ids) -> de-duplicated catalog ids, in catalog order. */
export function normalizeBodyAreas(ids: readonly string[] | null | undefined): BodyArea[] {
  const found = new Set((ids ?? []).flatMap(toCatalogBodyAreas));
  return BODY_AREAS.filter((a) => found.has(a));
}

/** Display labels for stored body areas; ids that cannot be mapped are shown humanized. */
export function bodyAreaLabels(ids: readonly string[] | null | undefined): string[] {
  const unknown = (ids ?? []).filter((id) => toCatalogBodyAreas(id).length === 0).map(humanize);
  return [...normalizeBodyAreas(ids).map((a) => BODY_AREA_LABELS[a]), ...unknown];
}
