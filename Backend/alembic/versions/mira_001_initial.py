"""mira initial (neutralized)

MIRA removed pre-deploy. Kept as a no-op ONLY to preserve the migration chain
(profile_003_student_fields chains off this revision). Creates no tables.

Revision ID: mira_001_initial
Revises: e884468cca8e
Create Date: 2026-05-30
"""
from __future__ import annotations

revision = "mira_001_initial"
down_revision = "e884468cca8e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
