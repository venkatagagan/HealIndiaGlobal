"""All SQLAlchemy models. Importing this package registers every table (and sequence) on ``Base.metadata``."""

from __future__ import annotations

from app.models.agents import Agent
from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPkMixin
from app.models.cases import (
    Booking,
    Case,
    CaseStatusHistory,
    ChecklistItem,
    Consultation,
    ItineraryItem,
    Quote,
)
from app.models.catalog import CostBenchmark, CulturalTip, FxRate, PlatformSetting, Procedure, Specialty
from app.models.docai import DocumentAnalysis
from app.models.documents import Document
from app.models.hospitals import (
    AvailabilitySlot,
    Doctor,
    Hospital,
    HospitalAccreditation,
    HospitalMember,
    HospitalProcedure,
    HospitalSpecialty,
    Review,
    TreatmentPackage,
)
from app.models.identity import AuditLog, Consent, DeviceToken, RefreshToken, User, VerificationToken
from app.models.jobs import BackgroundJob
from app.models.ledger import LEDGER_DDL, LEDGER_DROP_DDL, LedgerAccount, LedgerEntry, LedgerTransaction
from app.models.messaging import (
    ContentReport,
    Conversation,
    ConversationParticipant,
    Message,
    Notification,
    SiteEnquiry,
)
from app.models.patients import PatientCompanion, PatientProfile, SavedItem
from app.models.payments import Installment, Invoice, Payment, PaymentOrder, Refund, WebhookEvent
from app.models.privacy import BreachIncident, DataNominee, DataRightsRequest, GuardianConsent
from app.models.screening import AIRequestLog, Screening, ScreeningMatch
from app.models.sequences import NUMBER_SEQUENCES, next_number
from app.models.settlements import CommissionRule, Payout, PayoutAccount, SettlementBatch, SettlementItem
from app.models.travel import (
    AccommodationBooking,
    AccommodationHospitalLink,
    AccommodationProvider,
    ServiceBooking,
    ServiceProvider,
    SosAlert,
    TravelBooking,
    VisaRequest,
)
from app.models.voice import VoiceTranscription

#: PostgreSQL extensions the schema needs (create before ``metadata.create_all``).
REQUIRED_EXTENSIONS: tuple[str, ...] = ("citext", "pg_trgm", "btree_gin", "pgcrypto")

__all__ = [
    "LEDGER_DDL",
    "LEDGER_DROP_DDL",
    "NUMBER_SEQUENCES",
    "REQUIRED_EXTENSIONS",
    "AIRequestLog",
    "AccommodationBooking",
    "AccommodationHospitalLink",
    "AccommodationProvider",
    "Agent",
    "AuditLog",
    "AvailabilitySlot",
    "BackgroundJob",
    "Base",
    "Booking",
    "BreachIncident",
    "Case",
    "CaseStatusHistory",
    "ChecklistItem",
    "CommissionRule",
    "Consent",
    "Consultation",
    "ContentReport",
    "Conversation",
    "SiteEnquiry",
    "ConversationParticipant",
    "CostBenchmark",
    "CreatedAtMixin",
    "CulturalTip",
    "DataNominee",
    "DataRightsRequest",
    "DeviceToken",
    "Doctor",
    "Document",
    "DocumentAnalysis",
    "FxRate",
    "GuardianConsent",
    "Hospital",
    "HospitalAccreditation",
    "HospitalMember",
    "HospitalProcedure",
    "HospitalSpecialty",
    "Installment",
    "Invoice",
    "ItineraryItem",
    "LedgerAccount",
    "LedgerEntry",
    "LedgerTransaction",
    "Message",
    "Notification",
    "PatientCompanion",
    "PatientProfile",
    "Payment",
    "PaymentOrder",
    "Payout",
    "PayoutAccount",
    "PlatformSetting",
    "Procedure",
    "Quote",
    "RefreshToken",
    "Refund",
    "Review",
    "SavedItem",
    "Screening",
    "ScreeningMatch",
    "ServiceBooking",
    "ServiceProvider",
    "SettlementBatch",
    "SettlementItem",
    "SosAlert",
    "Specialty",
    "TimestampMixin",
    "TravelBooking",
    "TreatmentPackage",
    "UUIDPkMixin",
    "User",
    "VerificationToken",
    "VisaRequest",
    "VoiceTranscription",
    "WebhookEvent",
    "next_number",
]
