"""
In-app notification model.

Designed as a generic event bucket so we don't need a new table per type:
  - type: short string identifier (comment_reply, post_liked, admin_announcement, ...)
  - payload: structured JSON the frontend renders (uses JSONBType for portability)
  - read_at: nullable; flips to a timestamp on first read

Why one table for everything: the frontend just needs a chronological stream
plus an unread badge. We don't need joins or per-type tables until the schema
proves restrictive.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.sqltypes import JSONBType

# Notification type constants — keep small and consistent.
NOTIF_COMMENT_REPLY = "comment_reply"      # someone replied to your comment
NOTIF_POST_COMMENT = "post_comment"        # someone commented on your post
NOTIF_POST_LIKE = "post_like"              # someone liked your post
NOTIF_NEW_FOLLOWER = "new_follower"
NOTIF_ADMIN_ANNOUNCEMENT = "admin_announcement"
NOTIF_CERTIFICATE_READY = "certificate_ready"
NOTIF_REPORT_RESOLVED = "report_resolved"  # your report was acted on


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # The recipient. Notifications are user-scoped; an "announcement to all"
    # creates one row per user (fan-out at write time is fine at our scale).
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Optional: the user who triggered this. Self-triggered events (your own
    # like on your own post) are filtered out at write time, not here.
    actor_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    payload: Mapped[Optional[dict]] = mapped_column(JSONBType, nullable=True)
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # Hot path: the unread-count badge needs WHERE user_id=? AND read_at IS NULL
        # plus the chronological list needs WHERE user_id=? ORDER BY created_at DESC.
        Index("idx_notifications_user_read", "user_id", "read_at"),
        Index("idx_notifications_user_created", "user_id", "created_at"),
        Index("idx_notifications_type", "type"),
    )
