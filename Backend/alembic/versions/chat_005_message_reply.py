"""chat: add reply_to_id to messages

Allows messages to reference the message they are replying to.

Revision ID: chat_005_message_reply
Revises: chat_004_message_soft_delete
Create Date: 2026-05-20
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "chat_005_message_reply"
down_revision = "chat_004_message_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("reply_to_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_messages_reply_to_id",
        "messages",
        "messages",
        ["reply_to_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("idx_messages_reply_to_id", "messages", ["reply_to_id"])


def downgrade() -> None:
    op.drop_index("idx_messages_reply_to_id", table_name="messages")
    op.drop_constraint("fk_messages_reply_to_id", "messages", type_="foreignkey")
    op.drop_column("messages", "reply_to_id")
