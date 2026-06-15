"""reels — metered free-unlock paywall

Revision ID: reels_v2_0002
Revises: reels_v2_0001
"""
from alembic import op
import sqlalchemy as sa

revision = "reels_v2_0002"
down_revision = "reels_v2_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reel_problem_unlocks",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("problems.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "problem_id", name="uq_reel_problem_unlock"),
    )
    op.create_index("idx_unlocks_user", "reel_problem_unlocks", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_table("reel_problem_unlocks")
