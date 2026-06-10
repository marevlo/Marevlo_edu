"""bug_reports initial schema

Creates the bug_reports table for user-submitted platform bug reports,
including optional screenshot S3 key storage.

Revision ID: bug_reports_001_initial
Revises: chat_007_deleted_for_sender, profile_004_contact_fields
Create Date: 2026-05-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "bug_reports_001_initial"
down_revision = ("chat_007_deleted_for_sender", "profile_004_contact_fields")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bug_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        # S3 object key for the screenshot, null when not provided.
        sa.Column("screenshot_key", sa.String(500), nullable=True),
        # Status workflow: open → acknowledged → resolved / wontfix
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_bug_reports_status", "bug_reports", ["status"])


def downgrade() -> None:
    op.drop_index("ix_bug_reports_status", table_name="bug_reports")
    op.drop_table("bug_reports")
