"""Domain enums (PLAN section 5). Values are lowercase snake_case and shared verbatim with every client.

Stored in PostgreSQL as VARCHAR(40) through :func:`sa_enum` (no native PG enum types, so adding a value never
needs an ``ALTER TYPE``).
"""

from __future__ import annotations

import re
from enum import StrEnum

import sqlalchemy as sa

__all__ = [
    "AIEngine",
    "AIRequestStatus",
    "AccommodationType",
    "AgentStatus",
    "AgentTier",
    "BookingStatus",
    "CaseStatus",
    "ChecklistKey",
    "ChecklistStatus",
    "CommissionScope",
    "AuthPortal",
    "ConsentKind",
    "ConsultationMode",
    "ConsultationStatus",
    "ConversationKind",
    "DevicePlatform",
    "DocumentKind",
    "DocumentStatus",
    "DoctorGenderPref",
    "DurationUnit",
    "EntryDirection",
    "Gender",
    "HospitalMemberRole",
    "HospitalStatus",
    "InstallmentStatus",
    "InvoiceKind",
    "ItineraryKind",
    "ItineraryStatus",
    "JobStatus",
    "KycStatus",
    "LedgerAccountType",
    "LedgerOwnerType",
    "LedgerTxnType",
    "OrderStatus",
    "PackageTier",
    "PayeeType",
    "PaymentGateway",
    "PaymentMethod",
    "PaymentOption",
    "PaymentPurpose",
    "PaymentStatus",
    "PayoutAccountStatus",
    "PayoutMethod",
    "PayoutStatus",
    "PreviousTreatment",
    "QuoteLineCategory",
    "QuoteStatus",
    "RateUnit",
    "RefundStatus",
    "ReviewStatus",
    "SavedEntityType",
    "ScreeningStatus",
    "ServiceBookingStatus",
    "ServiceKind",
    "SettlementBatchStatus",
    "SettlementItemStatus",
    "SeverityLevel",
    "SlotKind",
    "SosStatus",
    "SymptomAnswer",
    "TravelKind",
    "Urgency",
    "UserRole",
    "UserStatus",
    "VerificationPurpose",
    "VisaStatus",
    "VisaType",
    "ADMIN_PORTAL_ROLES",
    "STAFF_ROLES",
    "FINANCE_ROLES",
    "sa_enum",
]


# -------------------------------------------------------------------------------------------- identity
class UserRole(StrEnum):
    PATIENT = "patient"
    AGENT = "agent"
    HOSPITAL = "hospital"
    ADMIN = "admin"
    FINANCE = "finance"
    SUPPORT = "support"
    SUPER_ADMIN = "super_admin"


class UserStatus(StrEnum):
    ACTIVE = "active"
    PENDING_VERIFICATION = "pending_verification"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class Gender(StrEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNDISCLOSED = "undisclosed"


class DoctorGenderPref(StrEnum):
    MALE = "male"
    FEMALE = "female"
    NO_PREFERENCE = "no_preference"


class KycStatus(StrEnum):
    NOT_SUBMITTED = "not_submitted"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class VerificationPurpose(StrEnum):
    VERIFY_EMAIL = "verify_email"
    RESET_PASSWORD = "reset_password"  # noqa: S105 (enum value, not a secret)
    INVITE = "invite"
    # one-time staff MFA enrolment token issued by a super_admin (INTEGRATION_BACKLOG #23)
    MFA_ENROLMENT = "mfa_enrolment"


class AuthPortal(StrEnum):
    """Login door a session/access token belongs to (PLAN 3.1)."""

    PUBLIC = "public"
    STAFF = "staff"


class DevicePlatform(StrEnum):
    ANDROID = "android"
    IOS = "ios"
    WEB = "web"


class ConsentKind(StrEnum):
    TERMS = "terms"
    PRIVACY = "privacy"
    AI_PROCESSING = "ai_processing"
    SHARE_WITH_HOSPITALS = "share_with_hospitals"
    MARKETING = "marketing"
    # versioned click-through acceptance of the partner agreements (INTEGRATION_BACKLOG #11)
    HOSPITAL_PARTNER_AGREEMENT = "hospital_partner_agreement"
    AGENT_AGREEMENT = "agent_agreement"
    # the patient lets their referring/managing agent see their documents (CG-14, least privilege)
    SHARE_WITH_AGENT = "share_with_agent"
    # verifiable consent of a parent/lawful guardian for a patient under 18 (DPDP s.9, Rule 10)
    GUARDIAN_CONSENT = "guardian_consent"


class SavedEntityType(StrEnum):
    HOSPITAL = "hospital"
    DOCTOR = "doctor"
    PROCEDURE = "procedure"


# ---------------------------------------------------------------------------------- agents / hospitals
class AgentStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class AgentTier(StrEnum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"


class HospitalStatus(StrEnum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class HospitalMemberRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    COORDINATOR = "coordinator"
    FINANCE = "finance"
    DOCTOR = "doctor"


class PackageTier(StrEnum):
    MEDICAL_ONLY = "medical_only"
    MEDICAL_STAY = "medical_stay"
    ALL_INCLUSIVE = "all_inclusive"


class SlotKind(StrEnum):
    CONSULTATION = "consultation"
    ADMISSION = "admission"


class ReviewStatus(StrEnum):
    PENDING = "pending"
    PUBLISHED = "published"
    HIDDEN = "hidden"


# ------------------------------------------------------------------------------------------- screening
class ScreeningStatus(StrEnum):
    DRAFT = "draft"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Urgency(StrEnum):
    ROUTINE = "routine"
    SOON = "soon"
    URGENT = "urgent"
    EMERGENCY = "emergency"


class DurationUnit(StrEnum):
    DAYS = "days"
    WEEKS = "weeks"
    MONTHS = "months"
    YEARS = "years"


class SeverityLevel(StrEnum):
    NONE = "none"
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"


class SymptomAnswer(StrEnum):
    YES = "yes"
    MAYBE = "maybe"
    NO = "no"


class PreviousTreatment(StrEnum):
    MEDICATION = "medication"
    PHYSICAL_THERAPY = "physical_therapy"
    SURGERY = "surgery"
    OTHER = "other"


class AIEngine(StrEnum):
    CLAUDE = "claude"
    RULES = "rules"


class AIRequestStatus(StrEnum):
    OK = "ok"
    ERROR = "error"
    REFUSAL = "refusal"
    FALLBACK = "fallback"


# ----------------------------------------------------------------------------------------------- cases
class CaseStatus(StrEnum):
    ENQUIRY = "enquiry"
    QUOTED = "quoted"
    ACCEPTED = "accepted"
    BOOKED = "booked"
    IN_TREATMENT = "in_treatment"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    DECLINED = "declined"


class QuoteStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    WITHDRAWN = "withdrawn"


class QuoteLineCategory(StrEnum):
    SURGERY = "surgery"
    HOSPITAL_STAY = "hospital_stay"
    MEDICATIONS = "medications"
    TESTS_SCANS = "tests_scans"
    DOCTOR_FEES = "doctor_fees"
    IMPLANTS = "implants"
    OTHER = "other"


class BookingStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    CONFIRMED = "confirmed"
    ADMITTED = "admitted"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentOption(StrEnum):
    FULL = "full"
    DEPOSIT = "deposit"
    INSTALLMENTS = "installments"


class ConsultationStatus(StrEnum):
    REQUESTED = "requested"
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ConsultationMode(StrEnum):
    VIDEO = "video"
    PHONE = "phone"


class ChecklistStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class ChecklistKey(StrEnum):
    TREATMENT_BOOKED = "treatment_booked"
    VISA_APPROVED = "visa_approved"
    FLIGHT_BOOKED = "flight_booked"
    TRAVEL_INSURANCE = "travel_insurance"
    AIRPORT_PICKUP = "airport_pickup"
    DOCUMENTS_UPLOADED = "documents_uploaded"
    ACCOMMODATION_BOOKED = "accommodation_booked"


class ItineraryKind(StrEnum):
    APPOINTMENT = "appointment"
    ADMISSION = "admission"
    SURGERY = "surgery"
    PICKUP = "pickup"
    CHECKIN = "checkin"
    CHECKOUT = "checkout"
    FOLLOWUP = "followup"
    SIGHTSEEING = "sightseeing"
    OTHER = "other"


class ItineraryStatus(StrEnum):
    SCHEDULED = "scheduled"
    DONE = "done"
    CANCELLED = "cancelled"


# ---------------------------------------------------------------------------------------------- travel
class VisaStatus(StrEnum):
    NOT_STARTED = "not_started"
    DOCUMENTS_PENDING = "documents_pending"
    INVITATION_ISSUED = "invitation_issued"
    APPLIED = "applied"
    APPROVED = "approved"
    REJECTED = "rejected"


class VisaType(StrEnum):
    E_MEDICAL = "e_medical"
    E_MEDICAL_ATTENDANT = "e_medical_attendant"


class TravelKind(StrEnum):
    FLIGHT = "flight"
    AIRPORT_PICKUP = "airport_pickup"
    AIRPORT_DROP = "airport_drop"
    LOCAL_TRANSPORT = "local_transport"


class ServiceBookingStatus(StrEnum):
    REQUESTED = "requested"
    QUOTED = "quoted"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AccommodationType(StrEnum):
    HOTEL = "hotel"
    GUEST_HOUSE = "guest_house"
    SERVICE_APARTMENT = "service_apartment"
    HOSPITAL_GUEST_ROOM = "hospital_guest_room"


class ServiceKind(StrEnum):
    TRANSLATOR = "translator"
    LOCAL_GUIDE = "local_guide"
    TRANSPORT = "transport"
    TRAVEL_AGENT = "travel_agent"
    INSURANCE = "insurance"


class RateUnit(StrEnum):
    HOUR = "hour"
    DAY = "day"
    TRIP = "trip"
    FIXED = "fixed"


class SosStatus(StrEnum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


# ------------------------------------------------------------------------------- documents / messaging
class DocumentKind(StrEnum):
    PASSPORT = "passport"
    VISA = "visa"
    MEDICAL_REPORT = "medical_report"
    PRESCRIPTION = "prescription"
    LAB_RESULT = "lab_result"
    IMAGING = "imaging"
    INVITATION_LETTER = "invitation_letter"
    INVOICE = "invoice"
    RECEIPT = "receipt"
    KYC_REGISTRATION = "kyc_registration"
    KYC_ACCREDITATION = "kyc_accreditation"
    KYC_PAN = "kyc_pan"
    KYC_GST = "kyc_gst"
    KYC_ID_PROOF = "kyc_id_proof"
    BANK_PROOF = "bank_proof"
    PAYMENT_PROOF = "payment_proof"
    OTHER = "other"


class DocumentStatus(StrEnum):
    UPLOADED = "uploaded"
    VERIFIED = "verified"
    REJECTED = "rejected"


class ConversationKind(StrEnum):
    CASE = "case"
    SUPPORT = "support"
    DIRECT = "direct"


# -------------------------------------------------------------------------------------------- payments
class PaymentGateway(StrEnum):
    RAZORPAY = "razorpay"
    STRIPE = "stripe"
    BANK_TRANSFER = "bank_transfer"
    MOCK = "mock"


class PaymentPurpose(StrEnum):
    CONSULTATION_FEE = "consultation_fee"
    BOOKING_DEPOSIT = "booking_deposit"
    BOOKING_BALANCE = "booking_balance"
    BOOKING_FULL = "booking_full"
    INSTALLMENT = "installment"
    SERVICE = "service"


class OrderStatus(StrEnum):
    CREATED = "created"
    PENDING = "pending"
    PAID = "paid"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class PaymentStatus(StrEnum):
    CREATED = "created"
    AUTHORIZED = "authorized"
    CAPTURED = "captured"
    FAILED = "failed"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"


class PaymentMethod(StrEnum):
    CARD = "card"
    UPI = "upi"
    NETBANKING = "netbanking"
    BANK_TRANSFER = "bank_transfer"
    WALLET = "wallet"
    EMI = "emi"
    MOCK = "mock"


class RefundStatus(StrEnum):
    REQUESTED = "requested"
    APPROVED = "approved"
    PROCESSING = "processing"
    PROCESSED = "processed"
    FAILED = "failed"
    REJECTED = "rejected"


class InstallmentStatus(StrEnum):
    DUE = "due"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class InvoiceKind(StrEnum):
    PATIENT_RECEIPT = "patient_receipt"
    COMMISSION_INVOICE = "commission_invoice"
    AGENT_STATEMENT = "agent_statement"
    CREDIT_NOTE = "credit_note"


# -------------------------------------------------------------------------------- ledger / settlements
class LedgerAccountType(StrEnum):
    ASSET = "asset"
    LIABILITY = "liability"
    REVENUE = "revenue"
    EXPENSE = "expense"
    EQUITY = "equity"


class LedgerOwnerType(StrEnum):
    PLATFORM = "platform"
    HOSPITAL = "hospital"
    AGENT = "agent"
    VENDOR = "vendor"
    GATEWAY = "gateway"
    TAX = "tax"


class EntryDirection(StrEnum):
    DEBIT = "debit"
    CREDIT = "credit"


class LedgerTxnType(StrEnum):
    PAYMENT_CAPTURED = "payment_captured"
    GATEWAY_FEE = "gateway_fee"
    REVENUE_RECOGNITION = "revenue_recognition"
    AGENT_COMMISSION = "agent_commission"
    REFUND = "refund"
    PAYOUT = "payout"
    ADJUSTMENT = "adjustment"
    CANCELLATION_RETENTION = "cancellation_retention"
    TAX_REMITTANCE = "tax_remittance"
    FX_DIFFERENCE = "fx_difference"


class CommissionScope(StrEnum):
    GLOBAL = "global"
    HOSPITAL = "hospital"
    SPECIALTY = "specialty"
    PROCEDURE = "procedure"
    AGENT = "agent"


class PayeeType(StrEnum):
    HOSPITAL = "hospital"
    AGENT = "agent"
    VENDOR = "vendor"


class SettlementItemStatus(StrEnum):
    PENDING = "pending"
    ELIGIBLE = "eligible"
    ON_HOLD = "on_hold"
    BATCHED = "batched"
    PAID = "paid"
    REVERSED = "reversed"


class SettlementBatchStatus(StrEnum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIALLY_FAILED = "partially_failed"
    CANCELLED = "cancelled"


class PayoutStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    NEEDS_RECONCILIATION = "needs_reconciliation"  # provider outcome unknown (SEC-004); finance resolves
    PROCESSED = "processed"
    FAILED = "failed"
    REVERSED = "reversed"


class PayoutMethod(StrEnum):
    RAZORPAY_ROUTE = "razorpay_route"
    RAZORPAYX = "razorpayx"
    MANUAL_BANK_TRANSFER = "manual_bank_transfer"
    MOCK = "mock"


class PayoutAccountStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


# ------------------------------------------------------------------------------------------------ jobs
class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD = "dead"


# ----------------------------------------------------------------------------------------- role groups
STAFF_ROLES: frozenset[UserRole] = frozenset(
    {UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPPORT, UserRole.SUPER_ADMIN}
)
"""Admin-portal roles (PLAN section 5)."""
ADMIN_PORTAL_ROLES = STAFF_ROLES
FINANCE_ROLES: frozenset[UserRole] = frozenset({UserRole.FINANCE, UserRole.SUPER_ADMIN})


# ----------------------------------------------------------------------------------- SQLAlchemy helper
_CAMEL_RE_1 = re.compile(r"(.)([A-Z][a-z]+)")
_CAMEL_RE_2 = re.compile(r"([a-z0-9])([A-Z])")


def _snake(name: str) -> str:
    return _CAMEL_RE_2.sub(r"\1_\2", _CAMEL_RE_1.sub(r"\1_\2", name)).lower()


def sa_enum[E: StrEnum](enum_cls: type[E]) -> sa.Enum:
    """Column type for a StrEnum: VARCHAR(40) storing the enum *values*, validated on the Python side.

    Usage: ``status: Mapped[CaseStatus] = mapped_column(sa_enum(CaseStatus), default=CaseStatus.ENQUIRY)``.
    Plain strings equal to a value are accepted on write; reads return the enum member.
    """
    return sa.Enum(
        enum_cls,
        native_enum=False,
        length=40,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
        name=_snake(enum_cls.__name__),
    )
