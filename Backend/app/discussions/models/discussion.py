"""Discussion (posts / replies / upvotes / reactions) models."""
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DiscussionPost(Base):
    __tablename__ = "discussion_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    problem_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    tag: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_spoiler: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    is_pinned: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)
    is_edited: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)

    upvote_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Relationships — lazy="noload" to prevent N+1 queries
    author = relationship("User", foreign_keys=[user_id], lazy="select")
    replies = relationship(
        "DiscussionReply",
        cascade="all, delete-orphan",
        lazy="noload",
        order_by="DiscussionReply.created_at",
    )
    upvotes = relationship(
        "DiscussionPostUpvote",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        Index("idx_disc_posts_problem_id", "problem_id"),
        Index("idx_disc_posts_user_id", "user_id"),
        Index("idx_disc_posts_created_at", "created_at"),
        Index("idx_disc_posts_problem_created", "problem_id", "created_at"),
        Index("idx_disc_posts_deleted_created", "deleted_at", "created_at"),
        Index("idx_disc_posts_pinned_upvote", "is_pinned", "upvote_count"),
    )


class DiscussionPostUpvote(Base):
    __tablename__ = "discussion_post_upvotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("discussion_posts.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_disc_post_upvote"),
        Index("idx_disc_post_upvotes_post_id", "post_id"),
        Index("idx_disc_post_upvotes_user_id", "user_id"),
    )


class DiscussionReply(Base):
    __tablename__ = "discussion_replies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    post_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("discussion_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_accepted: Mapped[bool] = mapped_column(default=False, server_default="false", nullable=False)

    upvote_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Relationships
    author = relationship("User", foreign_keys=[user_id], lazy="select")
    upvotes = relationship(
        "DiscussionReplyUpvote",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    reactions = relationship(
        "DiscussionReplyReaction",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        Index("idx_disc_replies_post_id", "post_id"),
        Index("idx_disc_replies_user_id", "user_id"),
        Index("idx_disc_replies_created_at", "created_at"),
        Index("idx_disc_replies_post_created", "post_id", "created_at"),
        Index("idx_disc_replies_accepted_upvote", "is_accepted", "upvote_count"),
    )


class DiscussionReplyUpvote(Base):
    __tablename__ = "discussion_reply_upvotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reply_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("discussion_replies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("reply_id", "user_id", name="uq_disc_reply_upvote"),
        Index("idx_disc_reply_upvotes_reply_id", "reply_id"),
        Index("idx_disc_reply_upvotes_user_id", "user_id"),
    )


class DiscussionReplyReaction(Base):
    __tablename__ = "discussion_reply_reactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reply_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("discussion_replies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("reply_id", "user_id", "emoji", name="uq_disc_reply_reaction"),
        Index("idx_disc_reactions_reply_id", "reply_id"),
    )
