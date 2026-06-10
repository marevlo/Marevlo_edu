"""User, UserSession, EmailOTP models."""
from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Nullable for OAuth-only accounts (Google).
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    google_uid: Mapped[Optional[str]] = mapped_column(
        String(128), unique=True, index=True, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # RBAC role. 'student' (default) | 'staff' | 'admin'. Authoritative going
    # forward; is_admin is retained for back-compat and kept in sync at the
    # service layer (admin role implies is_admin=True).
    role: Mapped[str] = mapped_column(
        String(16), default="student", server_default="student", nullable=False
    )
    suspended_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Age / DPDP minor handling
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    guardian_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    guardian_consent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
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
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Domain helpers ──────────────────────────────────────────────────
    def is_usable(self) -> bool:
        """True iff the account can act on the system right now."""
        if not self.is_active or self.deleted_at is not None:
            return False
        if self.suspended_until and self.suspended_until > datetime.now(timezone.utc):
            return False
        return True


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    login_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    logout_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    device: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    user = relationship("User")

    __table_args__ = (
        Index("idx_user_sessions_user_logout_login", "user_id", "logout_time", "login_time"),
    )


class EmailOTP(Base):
    __tablename__ = "email_otps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("idx_email_otps_user_active", "user_id", "used_at"),)
