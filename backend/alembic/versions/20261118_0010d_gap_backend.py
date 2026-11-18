"""backend gap fixes: manual refund payouts (SEC-010), aftercare check-in reminders,
commission change approvals (SEC-044),
requester language of privacy requests (E6)

Revision ID: 0010d
Revises: 0009f
Create Date: 2026-11-18 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010d"
down_revision: str | Sequence[str] | None = "0009f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # SEC-010: bank-transfer refunds wait in ``awaiting_payout`` (VARCHAR status, no DB enum to alter) until a
    # finance user records the payout and a different one confirms it.
    op.add_column("refunds", sa.Column("payout_reference", sa.String(length=100), nullable=True))
    op.add_column("refunds", sa.Column("payout_date", sa.Date(), nullable=True))
    op.add_column("refunds", sa.Column("payout_note", sa.Text(), nullable=True))
    op.add_column("refunds", sa.Column("payout_proof_document_id", sa.UUID(), nullable=True))
    op.add_column("refunds", sa.Column("payout_recorded_by", sa.UUID(), nullable=True))
    op.add_column("refunds", sa.Column("payout_recorded_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("refunds", sa.Column("payout_confirmed_by", sa.UUID(), nullable=True))
    op.create_unique_constraint(op.f("uq_refunds_payout_reference"), "refunds", ["payout_reference"])
    op.create_foreign_key(
        op.f("fk_refunds_payout_proof_document_id_documents"),
        "refunds",
        "documents",
        ["payout_proof_document_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_refunds_payout_recorded_by_users"),
        "refunds",
        "users",
        ["payout_recorded_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_refunds_payout_confirmed_by_users"),
        "refunds",
        "users",
        ["payout_confirmed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_refunds_payout_proof_document_id"), "refunds", ["payout_proof_document_id"])
    op.create_index(op.f("ix_refunds_payout_recorded_by"), "refunds", ["payout_recorded_by"])
    op.create_index(op.f("ix_refunds_payout_confirmed_by"), "refunds", ["payout_confirmed_by"])

    # aftercare: one "check-in due" reminder per check-in
    op.add_column(
        "aftercare_checkins", sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True)
    )

    # E6: privacy-request emails in the requester's language
    op.add_column(
        "data_rights_requests", sa.Column("requester_language", sa.String(length=10), nullable=True)
    )

    # SEC-044: commission rate changes wait for a second approver
    op.create_table(
        "commission_change_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("changes", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("before", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("requested_by", sa.UUID(), nullable=True),
        sa.Column("decided_by", sa.UUID(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["requested_by"],
            ["users.id"],
            name=op.f("fk_commission_change_requests_requested_by_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"],
            ["users.id"],
            name=op.f("fk_commission_change_requests_decided_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_commission_change_requests")),
    )
    op.create_index(
        "ix_commission_change_requests_target", "commission_change_requests", ["target_type", "target_id"]
    )
    op.create_index(
        "uq_commission_change_requests_pending_target",
        "commission_change_requests",
        ["target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index(op.f("ix_commission_change_requests_status"), "commission_change_requests", ["status"])
    op.create_index(
        op.f("ix_commission_change_requests_requested_by"), "commission_change_requests", ["requested_by"]
    )
    op.create_index(
        op.f("ix_commission_change_requests_decided_by"), "commission_change_requests", ["decided_by"]
    )


def downgrade() -> None:
    op.drop_table("commission_change_requests")
    op.drop_column("data_rights_requests", "requester_language")
    op.drop_column("aftercare_checkins", "reminder_sent_at")
    op.drop_index(op.f("ix_refunds_payout_confirmed_by"), table_name="refunds")
    op.drop_index(op.f("ix_refunds_payout_recorded_by"), table_name="refunds")
    op.drop_index(op.f("ix_refunds_payout_proof_document_id"), table_name="refunds")
    op.drop_constraint(op.f("fk_refunds_payout_confirmed_by_users"), "refunds", type_="foreignkey")
    op.drop_constraint(op.f("fk_refunds_payout_recorded_by_users"), "refunds", type_="foreignkey")
    op.drop_constraint(op.f("fk_refunds_payout_proof_document_id_documents"), "refunds", type_="foreignkey")
    op.drop_constraint(op.f("uq_refunds_payout_reference"), "refunds", type_="unique")
    op.execute("UPDATE refunds SET status = 'processing' WHERE status = 'awaiting_payout'")
    for column in (
        "payout_confirmed_by",
        "payout_recorded_at",
        "payout_recorded_by",
        "payout_proof_document_id",
        "payout_note",
        "payout_date",
        "payout_reference",
    ):
        op.drop_column("refunds", column)
