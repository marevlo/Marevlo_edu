"""ActivityLog — shared across all features (logins, submissions, etc.)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from app.core.sqltypes import JSONBType as JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    # The DB column is named "metadata" for backwards compatibility with the
    # existing schema, but we expose it as `meta` in Python because `metadata`
    # is a reserved attribute on SQLAlchemy's declarative base.
    meta: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_activity_logs_user_action", "user_id", "action"),
        Index("idx_activity_logs_user_created", "user_id", "created_at"),
        Index("idx_activity_logs_user_action_created", "user_id", "action", "created_at"),
    )
