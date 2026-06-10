"""
Security audit log.

Separate from `activity_logs` (which tracks normal user activity for streaks
and feed). This table captures security-sensitive events with verbose context
so an audit trail exists if something goes wrong.

Events recorded:
  - login_success
  - login_failure
  - logout
  - password_reset_requested
  - password_reset_completed
  - admin_action (delete post, resolve report, etc.)
  - role_granted, role_revoked

Retention: indefinite by default. In prod, set up a CloudWatch Logs export +
S3 lifecycle to archive old rows after N months.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.sqltypes import JSONBType

# Event type constants — keep small and well-defined.
EVT_LOGIN_SUCCESS = "login_success"
EVT_LOGIN_FAILURE = "login_failure"
EVT_LOGOUT = "logout"
EVT_PW_RESET_REQUESTED = "password_reset_requested"
EVT_PW_RESET_COMPLETED = "password_reset_completed"
EVT_GOOGLE_LOGIN_SUCCESS = "google_login_success"
EVT_REFRESH_TOKEN_REVOKED = "refresh_token_revoked"
EVT_ADMIN_ACTION = "admin_action"
EVT_BLOCK_USER = "block_user"
EVT_SUSPICIOUS_LOGIN = "suspicious_login"


class SecurityEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Nullable because some events (e.g. login_failure for unknown email)
    # don't bind to a user.
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Free-form structured context — JSON for portability across PG/SQLite via
    # SQLAlchemy's automatic mapping.
    meta: Mapped[Optional[dict]] = mapped_column("meta", JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_security_events_user_event", "user_id", "event_type"),
        Index("idx_security_events_event_created", "event_type", "created_at"),
        Index("idx_security_events_created", "created_at"),
    )
