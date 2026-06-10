"""mira feature tables

Creates MIRA's tables now that MIRA is a Marevlo feature (the earlier
mira_001_initial was neutralized when MIRA was removed pre-deploy; this brings
the tables back as part of the integrated feature).

Tables:
  mira_user_state, mira_usage_events, mira_credit_ledger,
  mira_allotment_usage, mira_learning_events, mira_concept_lattices

Revision ID: mira_002_feature_tables
Revises: entitlements_001_rbac
Create Date: 2026-06-06
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

import app.core.sqltypes  # noqa: F401 — JSONBType used in columns below

revision = "mira_002_feature_tables"
down_revision = "entitlements_001_rbac"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── mira_user_state ────────────────────────────────────────────────
    op.create_table(
        "mira_user_state",
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("state", app.core.sqltypes.JSONBType(), nullable=False),
        sa.Column("preferred_style", sa.String(32), nullable=True),
        sa.Column("turns", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── mira_usage_events ──────────────────────────────────────────────
    op.create_table(
        "mira_usage_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.Column("course_id", sa.String(128), nullable=True),
        sa.Column("lesson_id", sa.String(128), nullable=True),
        sa.Column("concept", sa.String(128), nullable=True),
        sa.Column("intent", sa.String(32), nullable=True),
        sa.Column("answer_format", sa.String(32), nullable=True),
        sa.Column("provider", sa.String(32), nullable=True),
        sa.Column("served_from", sa.String(32), nullable=True),
        sa.Column("estimated_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("actual_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("charged_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("build_credit_delta", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_inr", sa.Numeric(10, 4), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_mira_usage_user", "mira_usage_events", ["user_id", "created_at"])
    op.create_index("idx_mira_usage_request", "mira_usage_events", ["request_id"])
    op.create_index("idx_mira_usage_course", "mira_usage_events", ["course_id"])

    # ── mira_credit_ledger ─────────────────────────────────────────────
    op.create_table(
        "mira_credit_ledger",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ref", sa.String(128), nullable=True),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(32), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "reason IN ('purchase','charge','refund','monthly_allotment','admin_grant')",
            name="ck_mira_credit_reason"),
        sa.UniqueConstraint("ref", "reason", name="uq_mira_credit_ref_reason"),
    )
    op.create_index("idx_mira_credit_user", "mira_credit_ledger", ["user_id", "created_at"])

    # ── mira_allotment_usage ───────────────────────────────────────────
    op.create_table(
        "mira_allotment_usage",
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("entitlement_key", sa.String(64), primary_key=True),
        sa.Column("used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── mira_learning_events ───────────────────────────────────────────
    op.create_table(
        "mira_learning_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("concept", sa.String(128), nullable=False),
        sa.Column("course_id", sa.String(128), nullable=True),
        sa.Column("lesson_id", sa.String(128), nullable=True),
        sa.Column("event_type", sa.String(32), nullable=False),
        sa.Column("detail", app.core.sqltypes.JSONBType(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_mira_learning_user_concept", "mira_learning_events", ["user_id", "concept"])
    op.create_index("idx_mira_learning_user_created", "mira_learning_events", ["user_id", "created_at"])

    # ── mira_concept_lattices ──────────────────────────────────────────
    op.create_table(
        "mira_concept_lattices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("course_id", sa.String(128), nullable=False),
        sa.Column("module_id", sa.String(128), nullable=True),
        sa.Column("lattice", app.core.sqltypes.JSONBType(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("generated_by", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("course_id", "module_id", name="uq_lattice_course_module"),
    )
    op.create_index("idx_lattice_course", "mira_concept_lattices", ["course_id"])


def downgrade() -> None:
    op.drop_table("mira_concept_lattices")
    op.drop_table("mira_learning_events")
    op.drop_table("mira_allotment_usage")
    op.drop_table("mira_credit_ledger")
    op.drop_table("mira_usage_events")
    op.drop_table("mira_user_state")
