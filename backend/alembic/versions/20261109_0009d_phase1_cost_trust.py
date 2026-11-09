"""phase 1: cost benchmark sources, currency follows country, verified reviews, structured accreditations

Revision ID: 0009d
Revises: 0008
Create Date: 2026-11-09 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009d"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- cost benchmarks: where the home price comes from
    op.add_column("cost_benchmarks", sa.Column("source_url", sa.String(length=1024), nullable=True))
    op.add_column("cost_benchmarks", sa.Column("price_year", sa.SmallInteger(), nullable=True))
    op.add_column("cost_benchmarks", sa.Column("confidence", sa.String(length=20), nullable=True))
    op.add_column("cost_benchmarks", sa.Column("wait_source", sa.String(length=255), nullable=True))

    # --- patient currency follows the country until the patient picks one
    op.add_column(
        "patient_profiles",
        sa.Column("currency_set_by_user", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    # --- reviews: verified (booking-linked), moderation trail
    op.add_column("reviews", sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reviews", sa.Column("procedure_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reviews", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reviews", sa.Column("moderated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reviews", sa.Column("moderated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reviews", sa.Column("moderation_reason", sa.Text(), nullable=True))
    op.create_unique_constraint(op.f("uq_reviews_booking_id"), "reviews", ["booking_id"])
    op.create_index(op.f("ix_reviews_procedure_id"), "reviews", ["procedure_id"], unique=False)
    op.create_index(
        op.f("ix_reviews_moderated_by_user_id"), "reviews", ["moderated_by_user_id"], unique=False
    )
    op.create_foreign_key(
        op.f("fk_reviews_booking_id_bookings"),
        "reviews",
        "bookings",
        ["booking_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_reviews_procedure_id_procedures"),
        "reviews",
        "procedures",
        ["procedure_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_reviews_moderated_by_user_id_users"),
        "reviews",
        "users",
        ["moderated_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Existing published reviews count as published from their creation time.
    op.execute(
        "UPDATE reviews SET published_at = created_at WHERE status = 'published' AND published_at IS NULL"
    )

    # --- structured hospital accreditations
    op.create_table(
        "hospital_accreditations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hospital_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.String(length=20), nullable=False),
        sa.Column("certificate_number", sa.String(length=100), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("verified_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["hospital_id"],
            ["hospitals.id"],
            name=op.f("fk_hospital_accreditations_hospital_id_hospitals"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_admin_id"],
            ["users.id"],
            name=op.f("fk_hospital_accreditations_verified_by_admin_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name=op.f("fk_hospital_accreditations_document_id_documents"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hospital_accreditations")),
        sa.UniqueConstraint("hospital_id", "body", name=op.f("uq_hospital_accreditations_hospital_id_body")),
    )
    op.create_index(
        op.f("ix_hospital_accreditations_hospital_id"),
        "hospital_accreditations",
        ["hospital_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hospital_accreditations_verified_by_admin_id"),
        "hospital_accreditations",
        ["verified_by_admin_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_hospital_accreditations_document_id"),
        "hospital_accreditations",
        ["document_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_hospital_accreditations_document_id"), table_name="hospital_accreditations")
    op.drop_index(
        op.f("ix_hospital_accreditations_verified_by_admin_id"), table_name="hospital_accreditations"
    )
    op.drop_index(op.f("ix_hospital_accreditations_hospital_id"), table_name="hospital_accreditations")
    op.drop_table("hospital_accreditations")

    op.drop_constraint(op.f("fk_reviews_moderated_by_user_id_users"), "reviews", type_="foreignkey")
    op.drop_constraint(op.f("fk_reviews_procedure_id_procedures"), "reviews", type_="foreignkey")
    op.drop_constraint(op.f("fk_reviews_booking_id_bookings"), "reviews", type_="foreignkey")
    op.drop_index(op.f("ix_reviews_moderated_by_user_id"), table_name="reviews")
    op.drop_index(op.f("ix_reviews_procedure_id"), table_name="reviews")
    op.drop_constraint(op.f("uq_reviews_booking_id"), "reviews", type_="unique")
    op.drop_column("reviews", "moderation_reason")
    op.drop_column("reviews", "moderated_by_user_id")
    op.drop_column("reviews", "moderated_at")
    op.drop_column("reviews", "published_at")
    op.drop_column("reviews", "procedure_id")
    op.drop_column("reviews", "booking_id")

    op.drop_column("patient_profiles", "currency_set_by_user")

    op.drop_column("cost_benchmarks", "wait_source")
    op.drop_column("cost_benchmarks", "confidence")
    op.drop_column("cost_benchmarks", "price_year")
    op.drop_column("cost_benchmarks", "source_url")
