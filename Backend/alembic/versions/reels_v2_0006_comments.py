"""reels — comments + comment likes (Phase 2)

Revision ID: reels_v2_0006
Revises: reels_v2_0005

Notifications reuse the platform `notifications` table — no new table here.
"""
from alembic import op
import sqlalchemy as sa

revision = "reels_v2_0006"
down_revision = "reels_v2_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reel_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("reel_comments.id", ondelete="CASCADE"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("like_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_reel_comments_reel", "reel_comments", ["reel_id", "created_at"])
    op.create_index("idx_reel_comments_parent", "reel_comments", ["parent_id"])

    op.create_table(
        "reel_comment_likes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("comment_id", sa.Integer(), sa.ForeignKey("reel_comments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("comment_id", "user_id", name="uq_reel_comment_like"),
    )
    op.create_index("idx_reel_comment_likes_comment", "reel_comment_likes", ["comment_id"])


def downgrade() -> None:
    op.drop_index("idx_reel_comment_likes_comment", table_name="reel_comment_likes")
    op.drop_table("reel_comment_likes")
    op.drop_index("idx_reel_comments_parent", table_name="reel_comments")
    op.drop_index("idx_reel_comments_reel", table_name="reel_comments")
    op.drop_table("reel_comments")
