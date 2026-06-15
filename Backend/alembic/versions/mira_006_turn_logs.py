"""turn logs + signals (MIRA-1 training corpus) + user training opt-out

Revision ID: mira_006_turn_logs
Revises: mira_005_docqa_and_topups
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "mira_006_turn_logs"
down_revision = "mira_005_docqa_and_topups"
branch_labels = None
depends_on = None


def _json_type():
    return sa.JSON().with_variant(sa.dialects.postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "mira_turn_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("turn_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("history", _json_type(), nullable=False),
        sa.Column("page_context", sa.Text(), nullable=True),
        sa.Column("doc_context", sa.Text(), nullable=True),
        sa.Column("course_id", sa.String(64), nullable=True),
        sa.Column("lesson_id", sa.String(64), nullable=True),
        sa.Column("level", sa.String(24), nullable=True),
        sa.Column("style", sa.String(24), nullable=True),
        sa.Column("prompt_version", sa.String(32), nullable=False,
                  server_default="v2"),
        sa.Column("intent", sa.String(24), nullable=True),
        sa.Column("concept", sa.String(64), nullable=True),
        sa.Column("lane", sa.String(24), nullable=True),
        sa.Column("served_from", sa.String(24), nullable=True),
        sa.Column("parse_ok", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("in_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("out_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_inr", sa.Float(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("blocks", _json_type(), nullable=False),
        sa.Column("quality_label", sa.String(16), nullable=True),
        sa.Column("labeled_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("turn_id", name="uq_mira_turn_logs_turn"),
    )
    op.create_index("ix_mira_turn_logs_user_time", "mira_turn_logs",
                    ["user_id", "created_at"])
    op.create_index("ix_mira_turn_logs_label", "mira_turn_logs", ["quality_label"])

    op.create_table(
        "mira_turn_signals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("turn_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("detail", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index("ix_mira_turn_signals_turn", "mira_turn_signals", ["turn_id"])
    op.create_index("ix_mira_turn_signals_kind_time", "mira_turn_signals",
                    ["kind", "created_at"])

    # DPDP: per-user opt-out from training use; exporter honors it.
    op.add_column("users", sa.Column("training_opt_out", sa.Boolean(),
                                     nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "training_opt_out")
    op.drop_index("ix_mira_turn_signals_kind_time", table_name="mira_turn_signals")
    op.drop_index("ix_mira_turn_signals_turn", table_name="mira_turn_signals")
    op.drop_table("mira_turn_signals")
    op.drop_index("ix_mira_turn_logs_label", table_name="mira_turn_logs")
    op.drop_index("ix_mira_turn_logs_user_time", table_name="mira_turn_logs")
    op.drop_table("mira_turn_logs")
