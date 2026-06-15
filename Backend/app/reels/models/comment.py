"""Reels — comments.

A flat-ish thread model: top-level comments plus one level of replies
(parent_id). Soft-deleted (deleted_at) so reply chains and counts survive a
parent deletion. Likes are a separate join table, deduped per (comment, user).
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ReelComment(Base):
    __tablename__ = "reel_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # One level of nesting: replies point at a top-level comment.
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("reel_comments.id", ondelete="CASCADE"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    author = relationship("User", foreign_keys=[user_id], lazy="select")

    __table_args__ = (
        Index("idx_reel_comments_reel", "reel_id", "created_at"),
        Index("idx_reel_comments_parent", "parent_id"),
    )


class ReelCommentLike(Base):
    __tablename__ = "reel_comment_likes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    comment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reel_comments.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", name="uq_reel_comment_like"),
        Index("idx_reel_comment_likes_comment", "comment_id"),
    )
