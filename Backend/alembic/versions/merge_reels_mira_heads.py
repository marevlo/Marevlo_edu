"""Merge reels branch into the mira sequence

The reels feature branch (compliance_001 -> reels_v2_0001..0006) forked from
mira_004_daypass_and_dob at the same point as mira_005, leaving Alembic with
two heads. This no-op migration joins them so there is a single head again.

Revision ID: merge_002_reels_into_mira
Revises: mira_006_turn_logs, reels_v2_0006
Create Date: 2026-06-15
"""
from typing import Sequence, Union


revision: str = "merge_002_reels_into_mira"
down_revision: Union[str, Sequence[str], None] = (
    "mira_006_turn_logs",
    "reels_v2_0006",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
