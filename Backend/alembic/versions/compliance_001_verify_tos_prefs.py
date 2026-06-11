"""email verification + ToS consent + notification prefs

- Adds users.email_verified_at / tos_accepted_at / tos_version for email
  verification and ToS/Privacy consent records (DPDP).
- Adds email_otps.purpose so password-reset and email-verify OTP flows
  can never cross.
- Creates user_notification_prefs (per-user notification toggles).
- Backfills email_verified_at = created_at to grandfather existing accounts
  (they signed up before verification existed).

Revision ID: compliance_001_verify_tos_prefs
Revises: mira_004_daypass_and_dob
Create Date: 2026-06-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "compliance_001_verify_tos_prefs"
down_revision = "mira_004_daypass_and_dob"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("tos_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("tos_version", sa.String(length=16), nullable=True))

    op.add_column(
        "email_otps",
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default="password_reset"),
    )

    op.create_table(
        "user_notification_prefs",
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("in_app_social", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("in_app_announcements", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_updates", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Grandfather existing accounts — verification only applies to new signups.
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")


def downgrade() -> None:
    op.drop_table("user_notification_prefs")

    op.drop_column("email_otps", "purpose")

    op.drop_column("users", "tos_version")
    op.drop_column("users", "tos_accepted_at")
    op.drop_column("users", "email_verified_at")
