"""notifications + store compliance: push device columns, adult attestation, content reports, moderation of
messages, website enquiries (CG-06/15/16/24/30)

Revision ID: 0009c
Revises: 0008
Create Date: 2026-11-09 10:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009c"
down_revision: str | Sequence[str] | None = "0009b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _ts() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    # --- push (CG-15)
    op.add_column("device_tokens", sa.Column("app_version", sa.String(length=32), nullable=True))
    op.add_column("device_tokens", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))

    # --- adult attestation (CG-24)
    op.add_column("users", sa.Column("is_adult", sa.Boolean(), nullable=True))

    # --- moderation of chat messages (CG-16)
    op.add_column("messages", sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("messages", sa.Column("hidden_by_user_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_messages_hidden_by_user_id_users"),
        "messages",
        "users",
        ["hidden_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_messages_hidden_by_user_id"), "messages", ["hidden_by_user_id"], unique=False)

    # --- content reports (CG-16)
    op.create_table(
        "content_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reporter_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "target_type",
            sa.Enum(
                "message",
                "screening_result",
                "document_analysis",
                "review",
                name="report_target_type",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column(
            "reason",
            sa.Enum(
                "spam",
                "abusive",
                "inappropriate",
                "inaccurate",
                "privacy",
                "other",
                name="report_reason",
                native_enum=False,
                length=40,
            ),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("open", "actioned", "dismissed", name="report_status", native_enum=False, length=40),
            server_default="open",
            nullable=False,
        ),
        sa.Column(
            "action",
            sa.Enum(
                "dismiss",
                "hide_message",
                "warn",
                "suspend",
                name="moderation_action",
                native_enum=False,
                length=40,
            ),
            nullable=True,
        ),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("resolved_by_user_id", sa.UUID(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(
            ["reporter_user_id"],
            ["users.id"],
            name=op.f("fk_content_reports_reporter_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["target_user_id"],
            ["users.id"],
            name=op.f("fk_content_reports_target_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"],
            ["users.id"],
            name=op.f("fk_content_reports_resolved_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_content_reports")),
    )
    for col in ("reporter_user_id", "target_user_id", "resolved_by_user_id"):
        op.create_index(op.f(f"ix_content_reports_{col}"), "content_reports", [col], unique=False)
    op.create_index(
        "ix_content_reports_status_created_at", "content_reports", ["status", "created_at"], unique=False
    )
    op.create_index(
        "ix_content_reports_target", "content_reports", ["target_type", "target_id"], unique=False
    )

    # --- website enquiries
    op.create_table(
        "site_enquiries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("topic", sa.String(length=40), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("new", "in_progress", "closed", name="enquiry_status", native_enum=False, length=40),
            server_default="new",
            nullable=False,
        ),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("handled_by_user_id", sa.UUID(), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(
            ["handled_by_user_id"],
            ["users.id"],
            name=op.f("fk_site_enquiries_handled_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_site_enquiries")),
    )
    op.create_index(
        op.f("ix_site_enquiries_handled_by_user_id"), "site_enquiries", ["handled_by_user_id"], unique=False
    )
    op.create_index(
        "ix_site_enquiries_status_created_at", "site_enquiries", ["status", "created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_site_enquiries_status_created_at", table_name="site_enquiries")
    op.drop_index(op.f("ix_site_enquiries_handled_by_user_id"), table_name="site_enquiries")
    op.drop_table("site_enquiries")
    op.drop_index("ix_content_reports_target", table_name="content_reports")
    op.drop_index("ix_content_reports_status_created_at", table_name="content_reports")
    for col in ("reporter_user_id", "target_user_id", "resolved_by_user_id"):
        op.drop_index(op.f(f"ix_content_reports_{col}"), table_name="content_reports")
    op.drop_table("content_reports")
    op.drop_index(op.f("ix_messages_hidden_by_user_id"), table_name="messages")
    op.drop_constraint(op.f("fk_messages_hidden_by_user_id_users"), "messages", type_="foreignkey")
    op.drop_column("messages", "hidden_by_user_id")
    op.drop_column("messages", "hidden_at")
    op.drop_column("users", "is_adult")
    op.drop_column("device_tokens", "revoked_at")
    op.drop_column("device_tokens", "app_version")
