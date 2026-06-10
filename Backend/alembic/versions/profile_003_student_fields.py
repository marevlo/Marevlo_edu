"""profile student fields

Adds:
  - user_profiles.dob (DATE, nullable) — student date of birth
  - user_profiles.college_year (VARCHAR(30), nullable) — e.g. "Year 2",
    "Sophomore", "Postgrad". Free text so we can hold any school's
    convention without a fixed enum.

Both fields are nullable; existing rows get NULL on upgrade with no
backfill required.

Revision ID: profile_003_student_fields
Revises: mira_001_initial
Create Date: 2026-05-09
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "profile_003_student_fields"
down_revision = "mira_001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_profiles", sa.Column("dob", sa.Date(), nullable=True)
    )
    op.add_column(
        "user_profiles",
        sa.Column("college_year", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "college_year")
    op.drop_column("user_profiles", "dob")
