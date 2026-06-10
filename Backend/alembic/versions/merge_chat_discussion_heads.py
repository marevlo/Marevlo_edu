"""Merge discussion branch into chat/users sequence

Merges the discussion branch into the chat/users branch so Alembic has a
single head before the profile repair migration.

Revision ID: merge_001_discussion_into_chain
Revises: d3f8c2a1b4e9, users_002_last_seen_at
Create Date: 2026-05-20
"""
from typing import Sequence, Union


revision: str = "merge_001_discussion_into_chain"
down_revision: Union[str, Sequence[str], None] = (
    "d3f8c2a1b4e9",
    "users_002_last_seen_at",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
