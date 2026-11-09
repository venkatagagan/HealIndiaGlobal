"""privacy and data rights: data-rights requests, nominees, guardian consents, breach register, legal holds,
staff session idle tracking, PHI read-audit index, encrypted health text.

Revision ID: 0009b
Revises: 0008
Create Date: 2026-11-09

Health free-text columns become application-encrypted (``app/core/crypto.py``):
* TEXT columns keep their type; existing plaintext stays readable (lenient read) until the
  ``privacy.reencrypt_fields`` job (daily, or enqueue it once after deploying) encrypts it;
* the JSONB AI outputs become TEXT holding encrypted JSON (existing JSON is kept as text and encrypted by the
  same job).
Downgrade turns the JSON columns back into JSONB; values that are already encrypted cannot be cast and are set
to NULL, so take a backup (or decrypt first) before downgrading.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009b"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "breach_incidents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reference", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "severity",
            sa.Enum(
                "low", "medium", "high", "critical", name="breach_severity", native_enum=False, length=40
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "open", "contained", "notified", "closed", name="breach_status", native_enum=False, length=40
            ),
            server_default="open",
            nullable=False,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notification_deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("contained_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "data_categories",
            postgresql.ARRAY(sa.Text()),
            server_default=sa.text("'{}'::text[]"),
            nullable=False,
        ),
        sa.Column("affected_subjects_estimate", sa.Integer(), nullable=True),
        sa.Column("likely_consequences", sa.Text(), nullable=True),
        sa.Column("measures_taken", sa.Text(), nullable=True),
        sa.Column("dpb_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("supervisory_authority_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subjects_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_by_user_id", sa.UUID(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["reported_by_user_id"],
            ["users.id"],
            name=op.f("fk_breach_incidents_reported_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_breach_incidents")),
        sa.UniqueConstraint("reference", name=op.f("uq_breach_incidents_reference")),
    )
    op.create_index(
        op.f("ix_breach_incidents_reported_by_user_id"),
        "breach_incidents",
        ["reported_by_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_breach_incidents_status"), "breach_incidents", ["status"], unique=False)
    op.create_table(
        "data_nominees",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("relationship", sa.String(length=60), nullable=False),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_data_nominees_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_data_nominees")),
        sa.UniqueConstraint("user_id", name=op.f("uq_data_nominees_user_id")),
    )
    op.create_table(
        "data_rights_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reference", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "kind",
            sa.Enum(
                "access",
                "correction",
                "erasure",
                "nomination",
                "withdraw_consent",
                "complaint",
                "other",
                name="data_rights_request_kind",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "received",
                "in_progress",
                "awaiting_requester",
                "completed",
                "rejected",
                name="data_rights_request_status",
                native_enum=False,
                length=40,
            ),
            server_default="received",
            nullable=False,
        ),
        sa.Column("channel", sa.String(length=20), server_default="web", nullable=False),
        sa.Column("requester_name", sa.String(length=200), nullable=False),
        sa.Column("requester_email", sa.String(length=255), nullable=True),
        sa.Column("requester_phone", sa.String(length=32), nullable=True),
        sa.Column("on_behalf_of", sa.String(length=300), nullable=True),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assigned_to_user_id", sa.UUID(), nullable=True),
        sa.Column("resolution", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["assigned_to_user_id"],
            ["users.id"],
            name=op.f("fk_data_rights_requests_assigned_to_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_data_rights_requests_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_data_rights_requests")),
        sa.UniqueConstraint("reference", name=op.f("uq_data_rights_requests_reference")),
    )
    op.create_index(
        op.f("ix_data_rights_requests_assigned_to_user_id"),
        "data_rights_requests",
        ["assigned_to_user_id"],
        unique=False,
    )
    op.create_index(op.f("ix_data_rights_requests_status"), "data_rights_requests", ["status"], unique=False)
    op.create_index(
        "ix_data_rights_requests_status_due_at", "data_rights_requests", ["status", "due_at"], unique=False
    )
    op.create_index(
        op.f("ix_data_rights_requests_user_id"), "data_rights_requests", ["user_id"], unique=False
    )
    op.create_table(
        "guardian_consents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("patient_id", sa.UUID(), nullable=False),
        sa.Column("guardian_name", sa.String(length=200), nullable=False),
        sa.Column("relationship", sa.String(length=40), nullable=False),
        sa.Column("guardian_email", sa.Text(), nullable=True),
        sa.Column("guardian_phone", sa.Text(), nullable=True),
        sa.Column("guardian_date_of_birth", sa.Date(), nullable=True),
        sa.Column("verification_method", sa.String(length=40), nullable=False),
        sa.Column("verification_reference", sa.String(length=120), nullable=True),
        sa.Column("consent_id", sa.UUID(), nullable=True),
        sa.Column("recorded_by_user_id", sa.UUID(), nullable=True),
        sa.Column("verified_by_user_id", sa.UUID(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["consent_id"],
            ["consents.id"],
            name=op.f("fk_guardian_consents_consent_id_consents"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["patient_id"],
            ["patient_profiles.id"],
            name=op.f("fk_guardian_consents_patient_id_patient_profiles"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recorded_by_user_id"],
            ["users.id"],
            name=op.f("fk_guardian_consents_recorded_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_user_id"],
            ["users.id"],
            name=op.f("fk_guardian_consents_verified_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_guardian_consents")),
    )
    op.create_index(
        op.f("ix_guardian_consents_consent_id"), "guardian_consents", ["consent_id"], unique=False
    )
    op.create_index(
        op.f("ix_guardian_consents_patient_id"), "guardian_consents", ["patient_id"], unique=False
    )
    op.create_index(
        op.f("ix_guardian_consents_recorded_by_user_id"),
        "guardian_consents",
        ["recorded_by_user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_guardian_consents_verified_by_user_id"),
        "guardian_consents",
        ["verified_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_audit_logs_phi_patient",
        "audit_logs",
        [sa.literal_column("(after ->> 'patient_id')"), "created_at"],
        unique=False,
        postgresql_where=sa.text("action LIKE 'phi.%'"),
    )
    op.add_column(
        "cases", sa.Column("legal_hold", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.add_column("cases", sa.Column("legal_hold_reason", sa.String(length=500), nullable=True))
    op.add_column("cases", sa.Column("legal_hold_set_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cases", sa.Column("legal_hold_set_by", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_cases_legal_hold_set_by_users"),
        "cases",
        "users",
        ["legal_hold_set_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column(
        "document_analyses",
        "ai_output",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.Text(),
        existing_nullable=True,
        postgresql_using="ai_output::text",
    )
    op.alter_column(
        "document_analyses",
        "confirmed_data",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.Text(),
        existing_nullable=True,
        postgresql_using="confirmed_data::text",
    )
    op.add_column("refresh_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column(
        "screenings",
        "ai_result",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.Text(),
        existing_nullable=True,
        postgresql_using="ai_result::text",
    )
    op.add_column(
        "users", sa.Column("legal_hold", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.add_column("users", sa.Column("legal_hold_reason", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("legal_hold_set_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("legal_hold_set_by", sa.UUID(), nullable=True))
    op.add_column("users", sa.Column("inactivity_notice_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_users_legal_hold_set_by_users"),
        "users",
        "users",
        ["legal_hold_set_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.alter_column(
        "voice_transcriptions",
        "intake_suggestion",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.Text(),
        existing_nullable=True,
        postgresql_using="intake_suggestion::text",
    )
    op.alter_column(
        "voice_transcriptions",
        "confirmed_intake",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.Text(),
        existing_nullable=True,
        postgresql_using="confirmed_intake::text",
    )


def downgrade() -> None:
    op.alter_column(
        "voice_transcriptions",
        "confirmed_intake",
        existing_type=sa.Text(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using="CASE WHEN confirmed_intake LIKE 'v1:%' THEN NULL ELSE confirmed_intake::jsonb END",
    )
    op.alter_column(
        "voice_transcriptions",
        "intake_suggestion",
        existing_type=sa.Text(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using="CASE WHEN intake_suggestion LIKE 'v1:%' THEN NULL ELSE intake_suggestion::jsonb END",
    )
    op.drop_constraint(op.f("fk_users_legal_hold_set_by_users"), "users", type_="foreignkey")
    op.drop_column("users", "inactivity_notice_at")
    op.drop_column("users", "legal_hold_set_by")
    op.drop_column("users", "legal_hold_set_at")
    op.drop_column("users", "legal_hold_reason")
    op.drop_column("users", "legal_hold")
    op.alter_column(
        "screenings",
        "ai_result",
        existing_type=sa.Text(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using="CASE WHEN ai_result LIKE 'v1:%' THEN NULL ELSE ai_result::jsonb END",
    )
    op.drop_column("refresh_tokens", "last_used_at")
    op.alter_column(
        "document_analyses",
        "confirmed_data",
        existing_type=sa.Text(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using="CASE WHEN confirmed_data LIKE 'v1:%' THEN NULL ELSE confirmed_data::jsonb END",
    )
    op.alter_column(
        "document_analyses",
        "ai_output",
        existing_type=sa.Text(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using="CASE WHEN ai_output LIKE 'v1:%' THEN NULL ELSE ai_output::jsonb END",
    )
    op.drop_constraint(op.f("fk_cases_legal_hold_set_by_users"), "cases", type_="foreignkey")
    op.drop_column("cases", "legal_hold_set_by")
    op.drop_column("cases", "legal_hold_set_at")
    op.drop_column("cases", "legal_hold_reason")
    op.drop_column("cases", "legal_hold")
    op.drop_index(
        "ix_audit_logs_phi_patient", table_name="audit_logs", postgresql_where=sa.text("action LIKE 'phi.%'")
    )
    op.drop_index(op.f("ix_guardian_consents_verified_by_user_id"), table_name="guardian_consents")
    op.drop_index(op.f("ix_guardian_consents_recorded_by_user_id"), table_name="guardian_consents")
    op.drop_index(op.f("ix_guardian_consents_patient_id"), table_name="guardian_consents")
    op.drop_index(op.f("ix_guardian_consents_consent_id"), table_name="guardian_consents")
    op.drop_table("guardian_consents")
    op.drop_index(op.f("ix_data_rights_requests_user_id"), table_name="data_rights_requests")
    op.drop_index("ix_data_rights_requests_status_due_at", table_name="data_rights_requests")
    op.drop_index(op.f("ix_data_rights_requests_status"), table_name="data_rights_requests")
    op.drop_index(op.f("ix_data_rights_requests_assigned_to_user_id"), table_name="data_rights_requests")
    op.drop_table("data_rights_requests")
    op.drop_table("data_nominees")
    op.drop_index(op.f("ix_breach_incidents_status"), table_name="breach_incidents")
    op.drop_index(op.f("ix_breach_incidents_reported_by_user_id"), table_name="breach_incidents")
    op.drop_table("breach_incidents")
