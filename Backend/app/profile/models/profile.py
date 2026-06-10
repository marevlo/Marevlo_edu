"""User profile and achievement models."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from app.core.sqltypes import JSONBType as JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserProfile(Base):
    """One-to-one with users. Created lazily on first access."""

    __tablename__ = "user_profiles"

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )

    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    headline: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    college: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    college_year: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    dob: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    interests: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    skills: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)

    xp: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    github_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    resume_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    badge_key: Mapped[str] = mapped_column(String(50), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "badge_key", name="uq_user_badge"),
        Index("idx_user_achievements_user", "user_id"),
    )
