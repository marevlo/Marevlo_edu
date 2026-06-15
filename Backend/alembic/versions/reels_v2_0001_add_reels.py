"""marevlo reels — anchored short-video layer

Revision ID: reels_v2_0001
Revises: compliance_001_verify_tos_prefs
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "reels_v2_0001"
down_revision = "compliance_001_verify_tos_prefs"
branch_labels = None
depends_on = None

TOPICS = [
    ("arrays", "Arrays", "topic"), ("strings", "Strings", "topic"),
    ("linked-list", "Linked list", "topic"), ("dynamic-programming", "Dynamic programming", "topic"),
    ("graphs", "Graphs", "topic"), ("trees", "Trees", "topic"),
    ("greedy", "Greedy", "topic"), ("python", "Python", "topic"),
    ("machine-learning", "Machine learning", "topic"), ("deep-learning", "Deep learning", "topic"),
    ("reinforcement-learning", "Reinforcement learning", "topic"),
    ("generative-ai", "Generative AI", "topic"), ("agentic-ai", "Agentic AI", "topic"),
    ("rag", "RAG", "topic"), ("recommender-systems", "Recommender systems", "topic"),
    ("time-series", "Time series", "topic"), ("nlp", "NLP", "topic"),
    ("system-design", "System design", "topic"), ("sql-databases", "SQL & databases", "topic"),
    ("memoization", "Memoization", "concept"), ("tabulation", "Tabulation", "concept"),
    ("kadanes-algorithm", "Kadane's algorithm", "concept"), ("prefix-sums", "Prefix sums", "concept"),
    ("two-pointers", "Two pointers", "concept"), ("sliding-window", "Sliding window", "concept"),
]


def upgrade() -> None:
    op.create_table(
        "reel_topics",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("slug", sa.String(60), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False, server_default="topic"),
        sa.Column("parent_slug", sa.String(60), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.create_table(
        "reels",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("slug", sa.String(140), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(140), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("reel_type", sa.String(30), nullable=False, server_default="concept_explainer"),
        sa.Column("difficulty", sa.String(12), nullable=True),
        sa.Column("language", sa.String(30), nullable=False, server_default="English"),
        sa.Column("video_object_key", sa.String(500), nullable=False),
        sa.Column("hls_url", sa.String(500), nullable=True),
        sa.Column("thumbnail_object_key", sa.String(500), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("creator_declared_rights", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("like_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("save_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_completion", sa.Float(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_reels_status_created", "reels", ["status", "deleted_at", "created_at"])
    op.create_index("idx_reels_user", "reels", ["user_id"])
    op.create_index("idx_reels_slug", "reels", ["slug"])

    op.create_table(
        "reel_anchors",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("anchor_type", sa.String(20), nullable=False),
        sa.Column("anchor_id", sa.String(80), nullable=False),
        sa.Column("label", sa.String(140), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="creator"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.UniqueConstraint("reel_id", "anchor_type", "anchor_id", name="uq_reel_anchor"),
    )
    op.create_index("idx_anchor_lookup", "reel_anchors", ["anchor_type", "anchor_id"])
    op.create_index("idx_anchor_reel", "reel_anchors", ["reel_id"])

    op.create_table(
        "reel_transcripts",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("transcript_text", sa.Text(), nullable=False),
        sa.Column("vtt_object_key", sa.String(500), nullable=True),
        sa.Column("language", sa.String(30), nullable=False, server_default="English"),
        sa.Column("generated_by", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    for tbl, uq in (("reel_likes", "uq_reel_like"), ("reel_saves", "uq_reel_save")):
        op.create_table(
            tbl,
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.UniqueConstraint("reel_id", "user_id", name=uq),
        )
    op.create_index("idx_reel_likes_reel", "reel_likes", ["reel_id"])
    op.create_index("idx_reel_saves_user", "reel_saves", ["user_id"])

    op.create_table(
        "reel_views",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("watched_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("reel_id", "user_id", name="uq_reel_view"),
    )
    op.create_index("idx_reel_views_reel", "reel_views", ["reel_id"])

    op.create_table(
        "reel_cta_events",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("persona", sa.String(30), nullable=False),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("cta_action", sa.String(40), nullable=False),
        sa.Column("cta_label", sa.String(120), nullable=False),
        sa.Column("clicked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_cta_reel_user", "reel_cta_events", ["reel_id", "user_id"])

    op.create_table(
        "reel_moderation_actions",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_modact_reel", "reel_moderation_actions", ["reel_id", "created_at"])

    op.create_table(
        "reel_reports",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("reel_id", sa.Integer(), sa.ForeignKey("reels.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reporter_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_reports_status", "reel_reports", ["status", "created_at"])

    topics = sa.table("reel_topics", sa.column("slug", sa.String), sa.column("name", sa.String),
                      sa.column("kind", sa.String), sa.column("sort_order", sa.Integer),
                      sa.column("is_active", sa.Boolean))
    op.bulk_insert(topics, [
        {"slug": s, "name": n, "kind": k, "sort_order": i, "is_active": True}
        for i, (s, n, k) in enumerate(TOPICS)])


def downgrade() -> None:
    for t in ("reel_reports", "reel_moderation_actions", "reel_cta_events", "reel_views",
              "reel_saves", "reel_likes", "reel_transcripts", "reel_anchors", "reels", "reel_topics"):
        op.drop_table(t)
