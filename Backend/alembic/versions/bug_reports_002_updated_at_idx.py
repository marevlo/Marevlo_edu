"""bug_reports: add updated_at column and created_at index

updated_at tracks when an admin last changed the status (NULL = never touched).
ix_bug_reports_created_at enables efficient time-ordered admin queries.

Revision ID: bug_reports_002_updated_at_idx
Revises: bug_reports_001_initial
Create Date: 2026-05-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "bug_reports_002_updated_at_idx"
down_revision = "bug_reports_001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bug_reports",
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_bug_reports_created_at", "bug_reports", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_bug_reports_created_at", table_name="bug_reports")
    op.drop_column("bug_reports", "updated_at")
