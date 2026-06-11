"""
Per-user notification preferences.

One row per user, created lazily on first read/write — a missing row means
"all defaults" (everything on). Three coarse toggles instead of a per-type
matrix: social in-app events, admin announcements, and product emails.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserNotificationPrefs(Base):
    __tablename__ = "user_notification_prefs"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # In-app: comment replies, post comments/likes, new followers.
    in_app_social: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    # In-app: admin announcements.
    in_app_announcements: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    # Email: product updates / non-transactional mail.
    email_updates: Mapped[bool] = mapped_column(
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
