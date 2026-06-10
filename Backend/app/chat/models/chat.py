"""Chat (DM), follow, and message-read models."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
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


class Follow(Base):
    """User follow relationships."""

    __tablename__ = "follows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    follower_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    following_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow_pair"),
        Index("idx_follows_follower_id", "follower_id"),
        Index("idx_follows_following_id", "following_id"),
    )


class Chat(Base):
    """DM conversation between exactly two users.

    Invariant: user_1_id < user_2_id (enforced by ChatService) so the
    UNIQUE(user_1_id, user_2_id) constraint truly prevents duplicates.
    """

    __tablename__ = "chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_1_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    user_2_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
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
    last_message_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    messages = relationship(
        "Message", cascade="all, delete-orphan", lazy="noload", back_populates="chat"
    )

    __table_args__ = (
        UniqueConstraint("user_1_id", "user_2_id", name="uq_chat_pair"),
        Index("idx_chats_user_1_id", "user_1_id"),
        Index("idx_chats_user_2_id", "user_2_id"),
        Index("idx_chats_last_message_at", "last_message_at"),
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    chat_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("user_sessions.id", ondelete="SET NULL"), nullable=True
    )
    log_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("activity_logs.id", ondelete="SET NULL"), nullable=True
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_edited: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    deleted_for_everyone: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # Sender-only hide: message is hidden from the sender's view but the
    # recipient can still read it.  Does NOT set is_deleted or change content.
    deleted_for_sender: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    reply_to_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True
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

    chat = relationship("Chat", back_populates="messages", lazy="select")
    sender = relationship("User", foreign_keys=[sender_id], lazy="select")
    reply_to_msg = relationship(
        "Message",
        foreign_keys=[reply_to_id],
        remote_side="Message.id",
        lazy="select",
    )
    reactions = relationship(
        "MessageReaction", cascade="all, delete-orphan", lazy="select", back_populates="message"
    )
    reads = relationship(
        "MessageRead", cascade="all, delete-orphan", lazy="noload", back_populates="message"
    )

    __table_args__ = (
        Index("idx_messages_chat_id", "chat_id"),
        Index("idx_messages_chat_created", "chat_id", "created_at"),
        Index("idx_messages_sender_id", "sender_id"),
        Index("idx_messages_session_id", "session_id"),
    )


class MessageRead(Base):
    __tablename__ = "message_reads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    reader_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    message = relationship("Message", back_populates="reads", lazy="select")

    __table_args__ = (
        UniqueConstraint("message_id", "reader_id", name="uq_message_reader"),
        Index("idx_message_reads_message_id", "message_id"),
        Index("idx_message_reads_reader_id", "reader_id"),
    )


class MessageReaction(Base):
    """Per-user emoji reaction on a message."""

    __tablename__ = "message_reactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    emoji: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    message = relationship("Message", back_populates="reactions", lazy="select")
    reactor = relationship("User", foreign_keys=[user_id], lazy="select")

    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_message_reaction"),
        Index("idx_message_reactions_message_id", "message_id"),
    )
