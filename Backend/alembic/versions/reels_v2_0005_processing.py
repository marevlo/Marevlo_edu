"""reels — async processing state (HLS + Whisper)

Revision ID: reels_v2_0005
Revises: reels_v2_0004

Reels publish immediately on upload now; these columns track the async
HLS transcode + Whisper transcription that run AFTER publish to enhance
the reel. They never gate it.
"""
from alembic import op
import sqlalchemy as sa

revision = "reels_v2_0005"
down_revision = "reels_v2_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("reels", sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reels", sa.Column("processing_completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reels", sa.Column("processing_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("reels", "processing_error")
    op.drop_column("reels", "processing_completed_at")
    op.drop_column("reels", "processing_started_at")
