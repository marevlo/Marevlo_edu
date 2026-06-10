"""Moderation tables — reports and blocks."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Status taxonomy: a report is either open, resolved (admin acted), or dismissed.
REPORT_STATUS_OPEN = "open"
REPORT_STATUS_RESOLVED = "resolved"
REPORT_STATUS_DISMISSED = "dismissed"

# Reason categories — kept short and frontend-friendly.
REPORT_REASONS = (
    "spam",
    "abusive",
    "harassment",
    "hate_speech",
    "sexual",
    "violence",
    "self_harm",
    "misinformation",
    "other",
)


class PostReport(Base):
    __tablename__ = "post_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    reporter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default=REPORT_STATUS_OPEN, server_default=REPORT_STATUS_OPEN, nullable=False
    )
    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # One open report per (post, reporter) — repeat reports from the same
        # user are noise. They can re-report after their first is resolved.
        UniqueConstraint("post_id", "reporter_id", name="uq_post_report_pair"),
        Index("idx_post_reports_status", "status"),
        Index("idx_post_reports_post", "post_id"),
        Index("idx_post_reports_created", "created_at"),
        Index("idx_post_reports_status_created", "status", "created_at"),
    )


class CommentReport(Base):
    __tablename__ = "comment_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    comment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("comments.id", ondelete="CASCADE"), nullable=False
    )
    reporter_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), default=REPORT_STATUS_OPEN, server_default=REPORT_STATUS_OPEN, nullable=False
    )
    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("comment_id", "reporter_id", name="uq_comment_report_pair"),
        Index("idx_comment_reports_status", "status"),
        Index("idx_comment_reports_comment", "comment_id"),
        Index("idx_comment_reports_created", "created_at"),
        Index("idx_comment_reports_status_created", "status", "created_at"),
    )


class UserBlock(Base):
    """blocker_id has chosen to block target_id.

    Effects (enforced in services):
      - blocker doesn't see target's posts/comments in the feed
      - target doesn't see blocker's posts/comments in the feed
      - new DMs between them are rejected
      - existing chats remain readable but no new messages can be sent
    """

    __tablename__ = "user_blocks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    blocker_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("blocker_id", "target_id", name="uq_user_block_pair"),
        Index("idx_user_blocks_blocker", "blocker_id"),
        Index("idx_user_blocks_target", "target_id"),
    )
