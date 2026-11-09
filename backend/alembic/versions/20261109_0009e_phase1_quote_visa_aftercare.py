"""phase 1: quick quote SLA, shared case reports, visa rules + invitation letters, aftercare, guest intro calls

* cases: quote_due_at / first_quote_at / quote_reminder_sent_at / quote_overdue_sent_at / quote_group_id
  (existing open enquiries get quote_due_at = created_at + 48 h; first_quote_at is backfilled from quotes)
* case_documents (reports shared with a case's hospital), aftercare_checkins
* consultations: kind (standard|followup), due_at, followup_day, reminder_24h_sent_at, reminder_1h_sent_at
* visa_country_rules, visa_checklist_items (seed with scripts/seed.py or POST /admin/visa/load-defaults),
  visa_requests: invitation_letter_draft_document_id / _generated_at / _approved_at / _approved_by_user_id
* guest_contact_verifications, intro_consultations, guest_ai_usage

Revision ID: 0009e
Revises: 0008
Create Date: 2026-11-09 15:32:10.614428

The integrator re-chains ``down_revision`` when merging parallel 0009x migrations.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009e"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "visa_checklist_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "visa_route",
            sa.Enum(
                "e_visa", "regular_visa", "not_required", name="visa_route", native_enum=False, length=40
            ),
            nullable=False,
        ),
        sa.Column("nationality", sa.String(length=2), nullable=True),
        sa.Column("item_key", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_visa_checklist_items")),
    )
    op.create_index(
        op.f("ix_visa_checklist_items_visa_route"), "visa_checklist_items", ["visa_route"], unique=False
    )
    op.create_index(
        "uq_visa_checklist_items_route_nat_key",
        "visa_checklist_items",
        ["visa_route", sa.literal_column("coalesce(nationality, '')"), "item_key"],
        unique=True,
    )
    op.create_table(
        "visa_country_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("nationality", sa.String(length=2), nullable=False),
        sa.Column("country_name", sa.String(length=100), nullable=True),
        sa.Column(
            "visa_route",
            sa.Enum(
                "e_visa", "regular_visa", "not_required", name="visa_route", native_enum=False, length=40
            ),
            nullable=False,
        ),
        sa.Column("max_attendants", sa.SmallInteger(), server_default="2", nullable=False),
        sa.Column("typical_processing_days", sa.SmallInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("official_url", sa.String(length=1024), nullable=True),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "max_attendants >= 0 AND max_attendants <= 10",
            name=op.f("ck_visa_country_rules_max_attendants_range"),
        ),
        sa.CheckConstraint(
            "typical_processing_days IS NULL OR typical_processing_days >= 0",
            name=op.f("ck_visa_country_rules_processing_days_nonneg"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_visa_country_rules")),
        sa.UniqueConstraint("nationality", name=op.f("uq_visa_country_rules_nationality")),
    )
    op.create_index(
        op.f("ix_visa_country_rules_visa_route"), "visa_country_rules", ["visa_route"], unique=False
    )
    op.create_table(
        "guest_ai_usage",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("reference_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_guest_ai_usage_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_guest_ai_usage")),
    )
    op.create_index(op.f("ix_guest_ai_usage_created_at"), "guest_ai_usage", ["created_at"], unique=False)
    op.create_index(
        "ix_guest_ai_usage_ip_hash_created_at", "guest_ai_usage", ["ip_hash", "created_at"], unique=False
    )
    op.create_index(op.f("ix_guest_ai_usage_user_id"), "guest_ai_usage", ["user_id"], unique=False)
    op.create_table(
        "guest_contact_verifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "channel",
            sa.Enum("email", "phone", name="contact_channel", native_enum=False, length=40),
            nullable=False,
        ),
        sa.Column("contact_hash", sa.String(length=64), nullable=False),
        sa.Column("contact_value", sa.Text(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_guest_contact_verifications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_guest_contact_verifications")),
    )
    op.create_index(
        "ix_guest_contact_verifications_contact",
        "guest_contact_verifications",
        ["contact_hash", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_guest_contact_verifications_user_id"),
        "guest_contact_verifications",
        ["user_id"],
        unique=False,
    )
    op.create_table(
        "intro_consultations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("patient_id", sa.UUID(), nullable=True),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column(
            "contact_channel",
            sa.Enum("email", "phone", name="contact_channel", native_enum=False, length=40),
            nullable=False,
        ),
        sa.Column("contact_value", sa.Text(), nullable=False),
        sa.Column("contact_hash", sa.String(length=64), nullable=False),
        sa.Column("device_hash", sa.String(length=64), nullable=True),
        sa.Column("preferred_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("preferred_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=True),
        sa.Column("screening_id", sa.UUID(), nullable=True),
        sa.Column(
            "document_ids",
            postgresql.ARRAY(sa.UUID()),
            server_default=sa.text("'{}'::uuid[]"),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "requested",
                "scheduled",
                "completed",
                "cancelled",
                name="consultation_status",
                native_enum=False,
                length=40,
            ),
            server_default="requested",
            nullable=False,
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_min", sa.Integer(), server_default="15", nullable=False),
        sa.Column("meeting_url", sa.String(length=1024), nullable=True),
        sa.Column("coordinator_user_id", sa.UUID(), nullable=True),
        sa.Column("coordinator_notes", sa.Text(), nullable=True),
        sa.Column("reminder_24h_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_1h_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("duration_min > 0", name=op.f("ck_intro_consultations_duration_positive")),
        sa.ForeignKeyConstraint(
            ["coordinator_user_id"],
            ["users.id"],
            name=op.f("fk_intro_consultations_coordinator_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_intro_consultations_patient_id_patient_profiles"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["screening_id"],
            ["screenings.id"],
            name=op.f("fk_intro_consultations_screening_id_screenings"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_intro_consultations_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_intro_consultations")),
        sa.UniqueConstraint("contact_hash", name="uq_intro_consultations_contact_hash"),
    )
    op.create_index(
        op.f("ix_intro_consultations_coordinator_user_id"),
        "intro_consultations",
        ["coordinator_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_intro_consultations_patient_id"), "intro_consultations", ["patient_id"], unique=False
    )
    op.create_index(
        op.f("ix_intro_consultations_scheduled_at"), "intro_consultations", ["scheduled_at"], unique=False
    )
    op.create_index(
        op.f("ix_intro_consultations_screening_id"), "intro_consultations", ["screening_id"], unique=False
    )
    op.create_index(op.f("ix_intro_consultations_status"), "intro_consultations", ["status"], unique=False)
    op.create_index(op.f("ix_intro_consultations_user_id"), "intro_consultations", ["user_id"], unique=False)
    op.create_index(
        "uq_intro_consultations_device_hash",
        "intro_consultations",
        ["device_hash"],
        unique=True,
        postgresql_where=sa.text("device_hash IS NOT NULL"),
    )
    op.create_table(
        "aftercare_checkins",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("case_id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("day", sa.SmallInteger(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_by_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "answers",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("free_text", sa.Text(), nullable=True),
        sa.Column(
            "red_flags",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.id"], name=op.f("fk_aftercare_checkins_case_id_cases"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_aftercare_checkins_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by_user_id"],
            ["users.id"],
            name=op.f("fk_aftercare_checkins_submitted_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_aftercare_checkins")),
        sa.UniqueConstraint("case_id", "day", name="uq_aftercare_checkins_case_day"),
    )
    op.create_index(op.f("ix_aftercare_checkins_case_id"), "aftercare_checkins", ["case_id"], unique=False)
    op.create_index("ix_aftercare_checkins_due_at", "aftercare_checkins", ["due_at"], unique=False)
    op.create_index(
        op.f("ix_aftercare_checkins_patient_id"), "aftercare_checkins", ["patient_id"], unique=False
    )
    op.create_index(
        op.f("ix_aftercare_checkins_submitted_by_user_id"),
        "aftercare_checkins",
        ["submitted_by_user_id"],
        unique=False,
    )
    op.create_table(
        "case_documents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("case_id", sa.UUID(), nullable=False),
        sa.Column("document_id", sa.UUID(), nullable=False),
        sa.Column("shared_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["case_id"], ["cases.id"], name=op.f("fk_case_documents_case_id_cases"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name=op.f("fk_case_documents_document_id_documents"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["shared_by_user_id"],
            ["users.id"],
            name=op.f("fk_case_documents_shared_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_case_documents")),
        sa.UniqueConstraint("case_id", "document_id", name="uq_case_documents_case_document"),
    )
    op.create_index(op.f("ix_case_documents_case_id"), "case_documents", ["case_id"], unique=False)
    op.create_index(op.f("ix_case_documents_created_at"), "case_documents", ["created_at"], unique=False)
    op.create_index(op.f("ix_case_documents_document_id"), "case_documents", ["document_id"], unique=False)
    op.create_index(
        op.f("ix_case_documents_shared_by_user_id"), "case_documents", ["shared_by_user_id"], unique=False
    )
    op.add_column("cases", sa.Column("quote_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("first_quote_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("quote_reminder_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("quote_overdue_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("quote_group_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_cases_quote_due_at"), "cases", ["quote_due_at"], unique=False)
    op.create_index(op.f("ix_cases_quote_group_id"), "cases", ["quote_group_id"], unique=False)
    op.add_column(
        "consultations",
        sa.Column(
            "kind",
            sa.Enum("standard", "followup", name="consultation_kind", native_enum=False, length=40),
            server_default="standard",
            nullable=False,
        ),
    )
    op.add_column("consultations", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("consultations", sa.Column("followup_day", sa.SmallInteger(), nullable=True))
    op.add_column(
        "consultations", sa.Column("reminder_24h_sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "consultations", sa.Column("reminder_1h_sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(op.f("ix_consultations_kind"), "consultations", ["kind"], unique=False)
    # Backfill the quote clock of existing cases (48 h = the QUOTE_SLA_HOURS default).
    op.execute(
        "UPDATE cases SET first_quote_at = q.first_sent FROM ("
        "  SELECT case_id, min(created_at) AS first_sent FROM quotes WHERE status <> 'draft' GROUP BY case_id"
        ") q WHERE q.case_id = cases.id"
    )
    op.execute(
        "UPDATE cases SET quote_due_at = created_at + interval '48 hours', "
        "quote_reminder_sent_at = now(), quote_overdue_sent_at = now() WHERE quote_due_at IS NULL"
    )
    op.add_column("visa_requests", sa.Column("invitation_letter_draft_document_id", sa.UUID(), nullable=True))
    op.add_column(
        "visa_requests",
        sa.Column("invitation_letter_generated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "visa_requests", sa.Column("invitation_letter_approved_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "visa_requests", sa.Column("invitation_letter_approved_by_user_id", sa.UUID(), nullable=True)
    )
    op.create_index(
        op.f("ix_visa_requests_invitation_letter_approved_by_user_id"),
        "visa_requests",
        ["invitation_letter_approved_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_visa_requests_invitation_letter_draft_document_id"),
        "visa_requests",
        ["invitation_letter_draft_document_id"],
        unique=False,
    )
    op.create_foreign_key(
        op.f("fk_visa_requests_invitation_letter_draft_document_id_documents"),
        "visa_requests",
        "documents",
        ["invitation_letter_draft_document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_visa_requests_invitation_letter_approved_by_user_id_users"),
        "visa_requests",
        "users",
        ["invitation_letter_approved_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_visa_requests_invitation_letter_approved_by_user_id_users"),
        "visa_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_visa_requests_invitation_letter_draft_document_id_documents"),
        "visa_requests",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_visa_requests_invitation_letter_draft_document_id"), table_name="visa_requests")
    op.drop_index(op.f("ix_visa_requests_invitation_letter_approved_by_user_id"), table_name="visa_requests")
    op.drop_column("visa_requests", "invitation_letter_approved_by_user_id")
    op.drop_column("visa_requests", "invitation_letter_approved_at")
    op.drop_column("visa_requests", "invitation_letter_generated_at")
    op.drop_column("visa_requests", "invitation_letter_draft_document_id")
    op.drop_index(op.f("ix_consultations_kind"), table_name="consultations")
    op.drop_column("consultations", "reminder_1h_sent_at")
    op.drop_column("consultations", "reminder_24h_sent_at")
    op.drop_column("consultations", "followup_day")
    op.drop_column("consultations", "due_at")
    op.drop_column("consultations", "kind")
    op.drop_index(op.f("ix_cases_quote_group_id"), table_name="cases")
    op.drop_index(op.f("ix_cases_quote_due_at"), table_name="cases")
    op.drop_column("cases", "quote_group_id")
    op.drop_column("cases", "quote_overdue_sent_at")
    op.drop_column("cases", "quote_reminder_sent_at")
    op.drop_column("cases", "first_quote_at")
    op.drop_column("cases", "quote_due_at")
    op.drop_index(op.f("ix_case_documents_shared_by_user_id"), table_name="case_documents")
    op.drop_index(op.f("ix_case_documents_document_id"), table_name="case_documents")
    op.drop_index(op.f("ix_case_documents_created_at"), table_name="case_documents")
    op.drop_index(op.f("ix_case_documents_case_id"), table_name="case_documents")
    op.drop_table("case_documents")
    op.drop_index(op.f("ix_aftercare_checkins_submitted_by_user_id"), table_name="aftercare_checkins")
    op.drop_index(op.f("ix_aftercare_checkins_patient_id"), table_name="aftercare_checkins")
    op.drop_index("ix_aftercare_checkins_due_at", table_name="aftercare_checkins")
    op.drop_index(op.f("ix_aftercare_checkins_case_id"), table_name="aftercare_checkins")
    op.drop_table("aftercare_checkins")
    op.drop_index(
        "uq_intro_consultations_device_hash",
        table_name="intro_consultations",
        postgresql_where=sa.text("device_hash IS NOT NULL"),
    )
    op.drop_index(op.f("ix_intro_consultations_user_id"), table_name="intro_consultations")
    op.drop_index(op.f("ix_intro_consultations_status"), table_name="intro_consultations")
    op.drop_index(op.f("ix_intro_consultations_screening_id"), table_name="intro_consultations")
    op.drop_index(op.f("ix_intro_consultations_scheduled_at"), table_name="intro_consultations")
    op.drop_index(op.f("ix_intro_consultations_patient_id"), table_name="intro_consultations")
    op.drop_index(op.f("ix_intro_consultations_coordinator_user_id"), table_name="intro_consultations")
    op.drop_table("intro_consultations")
    op.drop_index(op.f("ix_guest_contact_verifications_user_id"), table_name="guest_contact_verifications")
    op.drop_index("ix_guest_contact_verifications_contact", table_name="guest_contact_verifications")
    op.drop_table("guest_contact_verifications")
    op.drop_index(op.f("ix_guest_ai_usage_user_id"), table_name="guest_ai_usage")
    op.drop_index("ix_guest_ai_usage_ip_hash_created_at", table_name="guest_ai_usage")
    op.drop_index(op.f("ix_guest_ai_usage_created_at"), table_name="guest_ai_usage")
    op.drop_table("guest_ai_usage")
    op.drop_index(op.f("ix_visa_country_rules_visa_route"), table_name="visa_country_rules")
    op.drop_table("visa_country_rules")
    op.drop_index("uq_visa_checklist_items_route_nat_key", table_name="visa_checklist_items")
    op.drop_index(op.f("ix_visa_checklist_items_visa_route"), table_name="visa_checklist_items")
    op.drop_table("visa_checklist_items")
