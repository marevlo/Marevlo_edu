"""Learning system Pydantic schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Enrollment ──────────────────────────────────────────────────────────
class EnrollmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: str
    source: str
    status: str
    enrolled_at: datetime
    expires_at: Optional[datetime] = None


class EnrollmentListOut(BaseModel):
    enrollments: List[EnrollmentOut]


# ── Lesson progress ─────────────────────────────────────────────────────
class ProgressUpdate(BaseModel):
    """PUT body for updating progress on a lesson."""

    course_id: str = Field(..., min_length=1, max_length=128)
    status: Optional[Literal["in_progress", "completed"]] = None
    last_position: Optional[str] = Field(None, max_length=64)
    # Increment to add to time_spent_seconds. Service caps single-shot deltas
    # at 600s (10 min) to defeat idle-tab abuse.
    time_delta_seconds: Optional[int] = Field(None, ge=0, le=3600)


class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: str
    lesson_id: str
    status: str
    last_position: Optional[str] = None
    time_spent_seconds: int
    started_at: datetime
    last_accessed_at: datetime
    completed_at: Optional[datetime] = None


class CourseProgressSummary(BaseModel):
    """Aggregate per-course view used by the dashboard."""

    course_id: str
    enrolled: bool
    lessons_total_in_progress: int  # rows we've seen, not catalog total
    lessons_completed: int
    total_time_seconds: int
    last_lesson_id: Optional[str] = None  # the most recently accessed lesson
    last_position: Optional[str] = None
    last_accessed_at: Optional[datetime] = None


class DashboardOut(BaseModel):
    """Top-level learner dashboard. One call → everything the home view needs."""

    courses: List[CourseProgressSummary]
    # 'continue learning' shortcut — most-recently-accessed in-progress lesson
    resume: Optional[ProgressOut] = None


# ── Notes ───────────────────────────────────────────────────────────────
class NoteUpsert(BaseModel):
    course_id: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., min_length=1, max_length=20000)


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: str
    lesson_id: str
    content: str
    created_at: datetime
    updated_at: datetime


class NoteListOut(BaseModel):
    notes: List[NoteOut]


# ── Bookmarks ───────────────────────────────────────────────────────────
class BookmarkCreate(BaseModel):
    course_id: str = Field(..., min_length=1, max_length=128)
    caption: Optional[str] = Field(None, max_length=255)


class BookmarkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: str
    lesson_id: str
    caption: Optional[str] = None
    created_at: datetime


class BookmarkListOut(BaseModel):
    bookmarks: List[BookmarkOut]


class MessageOut(BaseModel):
    message: str
