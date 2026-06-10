"""users: add last_seen_at column

Tracks when a user last had an active WebSocket connection, used for
"last seen" display in chat.

Revision ID: users_002_last_seen_at
Revises: chat_007_deleted_for_sender
Create Date: 2026-05-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "users_002_last_seen_at"
down_revision = "chat_007_deleted_for_sender"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "last_seen_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "last_seen_at")
