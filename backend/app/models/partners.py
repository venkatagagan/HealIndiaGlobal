"""Insurance and pay-later partner catalog, and the patients' requests (leads) handed over to those partners.

The platform does **not** sell insurance and does **not** lend (CG-18). It lists partner products that staff
curate, and - only with the patient's recorded consent - passes the patient's contact details to the chosen
partner, who quotes / decides eligibility on their own terms.
"""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.crypto import EncryptedString
from app.core.enums import PartnerKind, PartnerLeadStatus, sa_enum
from app.models.base import Base, TimestampMixin, UUIDPkMixin, fk, money_col, text_array_col

__all__ = ["PartnerLead", "PartnerOffering"]


class PartnerOffering(UUIDPkMixin, TimestampMixin, Base):
    """An insurance product (``kind=insurance``) or a pay-later partner (``kind=pay_later``), admin-managed.

    ``countries``: ISO-3166 alpha-2 codes of the patients' home countries the partner accepts (empty = any).
    ``summary``: coverage summary (insurance) or terms summary (pay-later), written by staff from the partner's
    own documents. Prices are an indicative range in ``currency`` minor units."""

    __tablename__ = "partner_offerings"
    __table_args__ = (
        sa.CheckConstraint(
            "price_min_minor IS NULL OR price_max_minor IS NULL OR price_min_minor <= price_max_minor",
            name="price_range_valid",
        ),
        sa.CheckConstraint(
            "(price_min_minor IS NULL AND price_max_minor IS NULL) OR currency IS NOT NULL",
            name="price_needs_currency",
        ),
        sa.Index("ix_partner_offerings_kind_active", "kind", "is_active", "sort"),
    )

    kind: Mapped[PartnerKind] = mapped_column(sa_enum(PartnerKind), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(200), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(40))
    """insurance: ``medical_travel`` | ``complication`` | ``health`` | ``other``; pay-later: free label."""
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    countries: Mapped[list[str]] = text_array_col()
    price_min_minor: Mapped[int | None] = money_col(nullable=True)
    price_max_minor: Mapped[int | None] = money_col(nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3))
    price_note: Mapped[str | None] = mapped_column(String(200))
    website_url: Mapped[str | None] = mapped_column(String(1024))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_phone: Mapped[str | None] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)


class PartnerLead(UUIDPkMixin, TimestampMixin, Base):
    """A patient's "request a quote from the insurer" / "check eligibility" request. Contact details and the
    optional message are encrypted at rest; ``consent_id`` is the consent row that allows the hand-off. The
    provider/product names are copied so the request stays readable if the catalog entry changes."""

    __tablename__ = "partner_leads"
    __table_args__ = (sa.Index("ix_partner_leads_kind_status_created_at", "kind", "status", "created_at"),)

    kind: Mapped[PartnerKind] = mapped_column(sa_enum(PartnerKind), nullable=False)
    offering_id: Mapped[uuid.UUID | None] = fk("partner_offerings.id", ondelete="SET NULL", nullable=True)
    provider_name: Mapped[str] = mapped_column(String(200), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    patient_id: Mapped[uuid.UUID | None] = fk("patient_profiles.id", ondelete="SET NULL", nullable=True)
    case_id: Mapped[uuid.UUID | None] = fk("cases.id", ondelete="SET NULL", nullable=True)
    booking_id: Mapped[uuid.UUID | None] = fk("bookings.id", ondelete="SET NULL", nullable=True)
    consent_id: Mapped[uuid.UUID | None] = fk("consents.id", ondelete="SET NULL", nullable=True)
    contact_name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(EncryptedString())
    contact_phone: Mapped[str | None] = mapped_column(EncryptedString())
    preferred_contact: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str | None] = mapped_column(String(2))
    message: Mapped[str | None] = mapped_column(EncryptedString())
    status: Mapped[PartnerLeadStatus] = mapped_column(
        sa_enum(PartnerLeadStatus), nullable=False, default=PartnerLeadStatus.NEW, server_default="new"
    )
    staff_note: Mapped[str | None] = mapped_column(Text)
    handled_by_user_id: Mapped[uuid.UUID | None] = fk("users.id", ondelete="SET NULL", nullable=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """When staff passed the contact to the partner (status ``shared_with_partner``)."""
