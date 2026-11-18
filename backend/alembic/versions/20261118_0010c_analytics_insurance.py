"""insurance and pay-later partner catalog + partner leads (analytics needs no schema change)

Revision ID: 0010c
Revises: 0009f
Create Date: 2026-11-18 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010c"
down_revision: str | Sequence[str] | None = "0009f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_KIND = sa.Enum("insurance", "pay_later", name="partner_kind", native_enum=False, length=40)
_LEAD_STATUS = sa.Enum(
    "new",
    "in_progress",
    "shared_with_partner",
    "closed",
    "cancelled",
    name="partner_lead_status",
    native_enum=False,
    length=40,
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "partner_offerings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", _KIND, nullable=False),
        sa.Column("provider_name", sa.String(length=200), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=40), nullable=True),
        sa.Column("summary", sa.Text(), server_default="", nullable=False),
        sa.Column("countries", sa.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False),
        sa.Column("price_min_minor", sa.BigInteger(), nullable=True),
        sa.Column("price_max_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("price_note", sa.String(length=200), nullable=True),
        sa.Column("website_url", sa.String(length=1024), nullable=True),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("contact_phone", sa.String(length=32), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("sort", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_by_user_id", sa.UUID(), nullable=True),
        *_timestamps(),
        sa.CheckConstraint(
            "price_min_minor IS NULL OR price_max_minor IS NULL OR price_min_minor <= price_max_minor",
            name=op.f("ck_partner_offerings_price_range_valid"),
        ),
        sa.CheckConstraint(
            "(price_min_minor IS NULL AND price_max_minor IS NULL) OR currency IS NOT NULL",
            name=op.f("ck_partner_offerings_price_needs_currency"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            name=op.f("fk_partner_offerings_updated_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_partner_offerings")),
    )
    op.create_index(
        "ix_partner_offerings_kind_active", "partner_offerings", ["kind", "is_active", "sort"], unique=False
    )
    op.create_index(
        op.f("ix_partner_offerings_updated_by_user_id"),
        "partner_offerings",
        ["updated_by_user_id"],
        unique=False,
    )

    op.create_table(
        "partner_leads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", _KIND, nullable=False),
        sa.Column("offering_id", sa.UUID(), nullable=True),
        sa.Column("provider_name", sa.String(length=200), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("patient_id", sa.UUID(), nullable=True),
        sa.Column("case_id", sa.UUID(), nullable=True),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column("consent_id", sa.UUID(), nullable=True),
        sa.Column("contact_name", sa.String(length=200), nullable=False),
        sa.Column("contact_email", sa.Text(), nullable=True),
        sa.Column("contact_phone", sa.Text(), nullable=True),
        sa.Column("preferred_contact", sa.String(length=20), nullable=True),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", _LEAD_STATUS, server_default="new", nullable=False),
        sa.Column("staff_note", sa.Text(), nullable=True),
        sa.Column("handled_by_user_id", sa.UUID(), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(
            ["offering_id"],
            ["partner_offerings.id"],
            name=op.f("fk_partner_leads_offering_id_partner_offerings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_partner_leads_user_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_partner_leads_patient_id_patient_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.id"], name=op.f("fk_partner_leads_case_id_cases"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_partner_leads_booking_id_bookings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["consent_id"],
            ["consents.id"],
            name=op.f("fk_partner_leads_consent_id_consents"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["handled_by_user_id"],
            ["users.id"],
            name=op.f("fk_partner_leads_handled_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_partner_leads")),
    )
    op.create_index(
        "ix_partner_leads_kind_status_created_at",
        "partner_leads",
        ["kind", "status", "created_at"],
        unique=False,
    )
    for column in (
        "offering_id",
        "user_id",
        "patient_id",
        "case_id",
        "booking_id",
        "consent_id",
        "handled_by_user_id",
    ):
        op.create_index(op.f(f"ix_partner_leads_{column}"), "partner_leads", [column], unique=False)


def downgrade() -> None:
    for column in (
        "offering_id",
        "user_id",
        "patient_id",
        "case_id",
        "booking_id",
        "consent_id",
        "handled_by_user_id",
    ):
        op.drop_index(op.f(f"ix_partner_leads_{column}"), table_name="partner_leads")
    op.drop_index("ix_partner_leads_kind_status_created_at", table_name="partner_leads")
    op.drop_table("partner_leads")
    op.drop_index(op.f("ix_partner_offerings_updated_by_user_id"), table_name="partner_offerings")
    op.drop_index("ix_partner_offerings_kind_active", table_name="partner_offerings")
    op.drop_table("partner_offerings")
