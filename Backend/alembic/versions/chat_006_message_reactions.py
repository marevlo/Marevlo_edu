"""chat: add message_reactions table

Stores per-user emoji reactions on messages with a unique constraint
to prevent duplicate emoji reactions from the same user.

Revision ID: chat_006_message_reactions
Revises: chat_005_message_reply
Create Date: 2026-05-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "chat_006_message_reactions"
down_revision = "chat_005_message_reply"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_reactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["message_id"], ["messages.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id", "user_id", "emoji", name="uq_message_reaction"
        ),
    )
    op.create_index(
        "idx_message_reactions_message_id", "message_reactions", ["message_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "idx_message_reactions_message_id", table_name="message_reactions"
    )
    op.drop_table("message_reactions")
