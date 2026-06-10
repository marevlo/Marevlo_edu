"""entitlements + rbac role, and merge the two open alembic heads

This migration does two jobs:

1. MERGE: the tree had two heads (`a1b2c3d4e5f6` and `users_002_last_seen_at`),
   which made `alembic upgrade head` (singular, used by docker-compose at
   startup) fail. Listing both in down_revision merges them into one line.

2. SCHEMA: create `entitlements` and add `users.role`.

Cross-dialect (Postgres prod + SQLite tests): batch_alter_table is used for
the ADD COLUMN so SQLite's table-rebuild path is exercised correctly.

Revision ID: entitlements_001_rbac
Revises: a1b2c3d4e5f6, users_002_last_seen_at
Create Date: 2026-05-31
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "entitlements_001_rbac"
down_revision = ("a1b2c3d4e5f6", "users_002_last_seen_at")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) users.role
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "role",
                sa.String(length=16),
                nullable=False,
                server_default="student",
            )
        )

    # 2) entitlements
    op.create_table(
        "entitlements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="comped"),
        sa.Column(
            "granted_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "product", name="uq_entitlement_user_product"),
        sa.CheckConstraint("product IN ('all_access','dsa','courses')", name="ck_entitlements_product"),
        sa.CheckConstraint("source IN ('paid','comped','trial','free')", name="ck_entitlements_source"),
        sa.CheckConstraint("status IN ('active','revoked','expired')", name="ck_entitlements_status"),
    )
    op.create_index("idx_entitlements_user_status", "entitlements", ["user_id", "status"])
    op.create_index("idx_entitlements_expires", "entitlements", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_entitlements_expires", table_name="entitlements")
    op.drop_index("idx_entitlements_user_status", table_name="entitlements")
    op.drop_table("entitlements")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("role")
