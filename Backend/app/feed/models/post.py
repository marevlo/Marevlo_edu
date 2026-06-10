"""Feed (post / like / comment) models."""
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
from app.core.sqltypes import JSONBType as JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    problem_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("problems.id", ondelete="SET NULL"), nullable=True
    )

    type: Mapped[str] = mapped_column(String(20), default="post", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    image_object_keys: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)

    like_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    repost_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    tags: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)
    code_snippet: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    event_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    event_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Soft delete: set when an admin removes the post for moderation reasons.
    # Filter `deleted_at IS NULL` in feed queries to hide.
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships — used with explicit selectinload, never lazy-loaded
    # (lazy="noload") to keep behavior predictable and prevent accidental
    # N+1 queries.
    author = relationship("User", foreign_keys=[user_id], lazy="select")
    comments = relationship(
        "PostComment",
        cascade="all, delete-orphan",
        lazy="noload",
        order_by="PostComment.created_at",
    )
    likes = relationship(
        "PostLike",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        Index("idx_posts_user_id", "user_id"),
        Index("idx_posts_created_at", "created_at"),
        Index("idx_posts_type", "type"),
        Index("idx_posts_problem_id", "problem_id"),
        Index("idx_posts_deleted_created", "deleted_at", "created_at"),
        Index("idx_posts_deleted_like", "deleted_at", "like_count"),
    )


class PostLike(Base):
    __tablename__ = "post_likes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_post_user_like"),
        Index("idx_post_likes_post_id", "post_id"),
        Index("idx_post_likes_user_id", "user_id"),
    )


class PostComment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    author = relationship("User", foreign_keys=[user_id], lazy="select")

    __table_args__ = (
        Index("idx_comments_post_id", "post_id"),
        Index("idx_comments_user_id", "user_id"),
    )
