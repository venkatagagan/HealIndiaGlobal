"""patient referral programme + platform credit (referral_codes, referrals, patient_credits,
patient_credit_movements) and agent CRM (agent_leads, agent_lead_activities)

Revision ID: 0010b
Revises: 0009f
Create Date: 2026-11-18 13:36:07.373343

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010b"
down_revision: str | Sequence[str] | None = "0009f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "agent_leads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("whatsapp", sa.Text(), nullable=True),
        sa.Column("email_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("phone_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("preferred_language", sa.String(length=10), nullable=True),
        sa.Column(
            "source",
            sa.Enum(
                "walk_in",
                "whatsapp",
                "facebook",
                "referral",
                "event",
                "other",
                name="lead_source",
                native_enum=False,
                length=40,
            ),
            server_default="other",
            nullable=False,
        ),
        sa.Column("source_detail", sa.String(length=200), nullable=True),
        sa.Column("interested_specialty_id", sa.UUID(), nullable=True),
        sa.Column("interested_procedure_id", sa.UUID(), nullable=True),
        sa.Column("interest", sa.String(length=300), nullable=True),
        sa.Column("budget_minor", sa.BigInteger(), nullable=True),
        sa.Column("budget_currency", sa.String(length=3), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "new",
                "contacted",
                "qualified",
                "screening",
                "quote_requested",
                "won",
                "lost",
                name="lead_status",
                native_enum=False,
                length=40,
            ),
            server_default="new",
            nullable=False,
        ),
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lost_reason", sa.String(length=500), nullable=True),
        sa.Column("next_follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("follow_up_reminded_on", sa.String(length=10), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "tags", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=False
        ),
        sa.Column("converted_patient_id", sa.UUID(), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "budget_minor IS NULL OR budget_minor >= 0", name=op.f("ck_agent_leads_budget_nonneg")
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"], ["agents.id"], name=op.f("fk_agent_leads_agent_id_agents"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["converted_patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_agent_leads_converted_patient_id_patient_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_agent_leads_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["interested_procedure_id"],
            ["procedures.id"],
            name=op.f("fk_agent_leads_interested_procedure_id_procedures"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["interested_specialty_id"],
            ["specialties.id"],
            name=op.f("fk_agent_leads_interested_specialty_id_specialties"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_agent_leads_owner_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_leads")),
    )
    op.create_index(
        "ix_agent_leads_agent_follow_up", "agent_leads", ["agent_id", "next_follow_up_at"], unique=False
    )
    op.create_index("ix_agent_leads_agent_status", "agent_leads", ["agent_id", "status"], unique=False)
    op.create_index(
        op.f("ix_agent_leads_converted_patient_id"), "agent_leads", ["converted_patient_id"], unique=False
    )
    op.create_index(
        op.f("ix_agent_leads_email_fingerprint"), "agent_leads", ["email_fingerprint"], unique=False
    )
    op.create_index(op.f("ix_agent_leads_owner_user_id"), "agent_leads", ["owner_user_id"], unique=False)
    op.create_index(
        op.f("ix_agent_leads_phone_fingerprint"), "agent_leads", ["phone_fingerprint"], unique=False
    )
    op.create_index(op.f("ix_agent_leads_source"), "agent_leads", ["source"], unique=False)
    op.create_index(
        "ix_agent_leads_status_changed", "agent_leads", ["status", "status_changed_at"], unique=False
    )
    op.create_table(
        "referral_codes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column(
            "device_hashes",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'::text[]"),
            nullable=False,
        ),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_referral_codes_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_referral_codes")),
        sa.UniqueConstraint("code", name=op.f("uq_referral_codes_code")),
        sa.UniqueConstraint("patient_id", name=op.f("uq_referral_codes_patient_id")),
    )
    op.create_table(
        "agent_lead_activities",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lead_id", sa.UUID(), nullable=False),
        sa.Column("agent_id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "call",
                "message",
                "meeting",
                "note",
                "status_change",
                name="lead_activity_kind",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_agent_lead_activities_actor_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["agent_id"],
            ["agents.id"],
            name=op.f("fk_agent_lead_activities_agent_id_agents"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["lead_id"],
            ["agent_leads.id"],
            name=op.f("fk_agent_lead_activities_lead_id_agent_leads"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_lead_activities")),
    )
    op.create_index(
        op.f("ix_agent_lead_activities_agent_id"), "agent_lead_activities", ["agent_id"], unique=False
    )
    op.create_index(
        op.f("ix_agent_lead_activities_created_at"), "agent_lead_activities", ["created_at"], unique=False
    )
    op.create_index(
        "ix_agent_lead_activities_lead_occurred",
        "agent_lead_activities",
        ["lead_id", "occurred_at"],
        unique=False,
    )
    op.create_table(
        "referrals",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("referrer_patient_id", sa.UUID(), nullable=False),
        sa.Column("referred_patient_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "qualified",
                "rewarded",
                "void",
                name="referral_status",
                native_enum=False,
                length=40,
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "channel",
            sa.Enum(
                "website",
                "patient_web",
                "mobile",
                "other",
                name="referral_channel",
                native_enum=False,
                length=40,
            ),
            server_default="other",
            nullable=False,
        ),
        sa.Column("signup_device_hash", sa.String(length=64), nullable=True),
        sa.Column("qualifying_booking_id", sa.UUID(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("qualified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rewarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("void_reason", sa.String(length=500), nullable=True),
        sa.Column("voided_by", sa.UUID(), nullable=True),
        sa.Column(
            "checks",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("referrer_patient_id <> referred_patient_id", name=op.f("ck_referrals_not_self")),
        sa.ForeignKeyConstraint(
            ["qualifying_booking_id"],
            ["bookings.id"],
            name=op.f("fk_referrals_qualifying_booking_id_bookings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["referred_patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_referrals_referred_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["referrer_patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_referrals_referrer_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["voided_by"], ["users.id"], name=op.f("fk_referrals_voided_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_referrals")),
        sa.UniqueConstraint("referred_patient_id", name=op.f("uq_referrals_referred_patient_id")),
    )
    op.create_index(
        op.f("ix_referrals_qualifying_booking_id"), "referrals", ["qualifying_booking_id"], unique=False
    )
    op.create_index(
        "ix_referrals_referrer_status", "referrals", ["referrer_patient_id", "status"], unique=False
    )
    op.create_index(op.f("ix_referrals_status"), "referrals", ["status"], unique=False)
    op.create_table(
        "patient_credits",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("referral_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "referrer_reward",
                "referee_reward",
                "reinstated",
                name="patient_credit_kind",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "active",
                "used",
                "expired",
                "void",
                name="patient_credit_status",
                native_enum=False,
                length=40,
            ),
            server_default="active",
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("remaining_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="INR", nullable=False),
        sa.Column("original_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("original_currency", sa.String(length=3), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_refund_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name=op.f("ck_patient_credits_amount_positive")),
        sa.CheckConstraint(
            "remaining_minor >= 0 AND remaining_minor <= amount_minor",
            name=op.f("ck_patient_credits_remaining_range"),
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_patient_credits_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["referral_id"],
            ["referrals.id"],
            name=op.f("fk_patient_credits_referral_id_referrals"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["source_refund_id"],
            ["refunds.id"],
            name=op.f("fk_patient_credits_source_refund_id_refunds"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_patient_credits")),
        sa.UniqueConstraint("source_refund_id", name=op.f("uq_patient_credits_source_refund_id")),
    )
    op.create_index(
        "ix_patient_credits_patient_status", "patient_credits", ["patient_id", "status"], unique=False
    )
    op.create_index(op.f("ix_patient_credits_referral_id"), "patient_credits", ["referral_id"], unique=False)
    op.create_index(
        "ix_patient_credits_status_expires_at", "patient_credits", ["status", "expires_at"], unique=False
    )
    op.create_table(
        "patient_credit_movements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("credit_id", sa.UUID(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "grant",
                "redeem",
                "reinstate",
                "expire",
                "void",
                name="credit_movement_kind",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("payment_id", sa.UUID(), nullable=True),
        sa.Column("refund_id", sa.UUID(), nullable=True),
        sa.Column("booking_id", sa.UUID(), nullable=True),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name=op.f("ck_patient_credit_movements_amount_positive")),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_patient_credit_movements_booking_id_bookings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["credit_id"],
            ["patient_credits.id"],
            name=op.f("fk_patient_credit_movements_credit_id_patient_credits"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_patient_credit_movements_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name=op.f("fk_patient_credit_movements_payment_id_payments"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["refund_id"],
            ["refunds.id"],
            name=op.f("fk_patient_credit_movements_refund_id_refunds"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_patient_credit_movements")),
    )
    op.create_index(
        op.f("ix_patient_credit_movements_created_at"),
        "patient_credit_movements",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_patient_credit_movements_credit_id"), "patient_credit_movements", ["credit_id"], unique=False
    )
    op.create_index(
        "ix_patient_credit_movements_patient_created",
        "patient_credit_movements",
        ["patient_id", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_patient_credit_movements_payment_id"),
        "patient_credit_movements",
        ["payment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_patient_credit_movements_payment_id"), table_name="patient_credit_movements")
    op.drop_index("ix_patient_credit_movements_patient_created", table_name="patient_credit_movements")
    op.drop_index(op.f("ix_patient_credit_movements_credit_id"), table_name="patient_credit_movements")
    op.drop_index(op.f("ix_patient_credit_movements_created_at"), table_name="patient_credit_movements")
    op.drop_table("patient_credit_movements")
    op.drop_index("ix_patient_credits_status_expires_at", table_name="patient_credits")
    op.drop_index(op.f("ix_patient_credits_referral_id"), table_name="patient_credits")
    op.drop_index("ix_patient_credits_patient_status", table_name="patient_credits")
    op.drop_table("patient_credits")
    op.drop_index(op.f("ix_referrals_status"), table_name="referrals")
    op.drop_index("ix_referrals_referrer_status", table_name="referrals")
    op.drop_index(op.f("ix_referrals_qualifying_booking_id"), table_name="referrals")
    op.drop_table("referrals")
    op.drop_index("ix_agent_lead_activities_lead_occurred", table_name="agent_lead_activities")
    op.drop_index(op.f("ix_agent_lead_activities_created_at"), table_name="agent_lead_activities")
    op.drop_index(op.f("ix_agent_lead_activities_agent_id"), table_name="agent_lead_activities")
    op.drop_table("agent_lead_activities")
    op.drop_table("referral_codes")
    op.drop_index("ix_agent_leads_status_changed", table_name="agent_leads")
    op.drop_index(op.f("ix_agent_leads_source"), table_name="agent_leads")
    op.drop_index(op.f("ix_agent_leads_phone_fingerprint"), table_name="agent_leads")
    op.drop_index(op.f("ix_agent_leads_owner_user_id"), table_name="agent_leads")
    op.drop_index(op.f("ix_agent_leads_email_fingerprint"), table_name="agent_leads")
    op.drop_index(op.f("ix_agent_leads_converted_patient_id"), table_name="agent_leads")
    op.drop_index("ix_agent_leads_agent_status", table_name="agent_leads")
    op.drop_index("ix_agent_leads_agent_follow_up", table_name="agent_leads")
    op.drop_table("agent_leads")
