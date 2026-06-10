"""
User learning system models.

Design choices:
  - course_id and lesson_id are STRINGS (e.g. "recsys", "recsys.m01.l03")
    matching how the frontend already references content. Courses live as
    files in the repo, not DB rows; this avoids a redundant catalog table.

  - course_enrollments is the foundation for paid-access gating later.
    Today every user can self-enroll (free); when payments land, the
    `source` column distinguishes "free", "paid", "trial", "comped".

  - lesson_progress is the workhorse. last_position is a free-form string
    so the frontend can encode "75%" or "section-3.2" or "00:14:23" for
    video. status is a small vocabulary: not_started | in_progress | completed.

  - lesson_notes and lesson_bookmarks are SEPARATE tables (not columns on
    lesson_progress) so reading the dashboard doesn't pull notes text, and
    so we can index/sort bookmarks independently.

  - All four tables have (user_id, course_id) compound indexes — the
    dashboard's "give me everything for user X in course Y" is the hot path.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseEnrollment(Base):
    """A user has enrolled in a course.

    For free courses, enrollment is created on first lesson access.
    For paid courses (later), enrollment is created by the payment webhook
    and gates access to lessons via the entitlement-check decorator.
    """

    __tablename__ = "course_enrollments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(128), nullable=False)

    # 'free' (default) | 'paid' | 'trial' | 'comped'
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="free", server_default="free"
    )
    # 'active' | 'expired' | 'revoked'
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_enrollment_per_user_course"),
        Index("idx_enrollments_user_course", "user_id", "course_id"),
        Index("idx_enrollments_user_status", "user_id", "status"),
        CheckConstraint(
            "source IN ('free','paid','trial','comped')",
            name="ck_enrollments_source",
        ),
        CheckConstraint(
            "status IN ('active','expired','revoked')",
            name="ck_enrollments_status",
        ),
    )


class LessonProgress(Base):
    """One row per (user, lesson). Status + last_position drive the dashboard
    and the resume-from-where-you-left-off behaviour."""

    __tablename__ = "lesson_progress"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(128), nullable=False)
    lesson_id: Mapped[str] = mapped_column(String(128), nullable=False)

    # 'not_started' | 'in_progress' | 'completed'
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="in_progress", server_default="in_progress"
    )
    # Free-form scroll/scrub position the frontend interprets.
    # Examples: "75", "section-3.2", "00:14:23".
    last_position: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Total seconds the user has spent on this lesson across visits.
    # Frontend pings every 30s with a delta; service ignores values > 600s
    # (idle browser tabs).
    time_spent_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_progress_per_user_lesson"),
        Index("idx_progress_user_course", "user_id", "course_id"),
        Index("idx_progress_user_status", "user_id", "status"),
        Index("idx_progress_last_accessed", "user_id", "last_accessed_at"),
        CheckConstraint(
            "status IN ('not_started','in_progress','completed')",
            name="ck_progress_status",
        ),
    )


class LessonNote(Base):
    """A user's personal note attached to a lesson. One per (user, lesson).
    Updates overwrite — no version history, by design (notes are personal,
    they're not paid content)."""

    __tablename__ = "lesson_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(128), nullable=False)
    lesson_id: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_note_per_user_lesson"),
        Index("idx_notes_user_course", "user_id", "course_id"),
    )


class LessonBookmark(Base):
    """A 'saved for later' marker. Lightweight — just (user, lesson) +
    optional caption."""

    __tablename__ = "lesson_bookmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(128), nullable=False)
    lesson_id: Mapped[str] = mapped_column(String(128), nullable=False)
    caption: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_bookmark_per_user_lesson"),
        Index("idx_bookmarks_user_course", "user_id", "course_id"),
        Index("idx_bookmarks_user_created", "user_id", "created_at"),
    )
