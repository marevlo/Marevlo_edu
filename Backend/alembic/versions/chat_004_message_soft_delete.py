"""chat: add is_deleted and deleted_for_everyone to messages

Adds soft-delete columns to the messages table:
  - is_deleted (BOOLEAN, NOT NULL, default false)
  - deleted_for_everyone (BOOLEAN, NOT NULL, default false)

Revision ID: chat_004_message_soft_delete
Revises: profile_003_student_fields
Create Date: 2026-05-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "chat_004_message_soft_delete"
down_revision = "profile_003_student_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "is_deleted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "messages",
        sa.Column(
            "deleted_for_everyone",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "deleted_for_everyone")
    op.drop_column("messages", "is_deleted")
