"""chat: add deleted_for_sender to messages

Distinguishes "delete for myself" (sender-only hide) from "delete for everyone".
The existing is_deleted + deleted_for_everyone flags continue to represent
public deletion; deleted_for_sender is a private visibility flag for the sender.

Revision ID: chat_007_deleted_for_sender
Revises: chat_006_message_reactions
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "chat_007_deleted_for_sender"
down_revision = "chat_006_message_reactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "deleted_for_sender",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "deleted_for_sender")
