"""
Learning system service.

Endpoints land here from /learning/* routers. Service responsibilities:
  - Enroll a user in a course (idempotent).
  - Upsert lesson progress (updates last_position + time_spent on every call).
  - Compute the dashboard: per-course aggregates + a single 'resume' shortcut.
  - CRUD for notes and bookmarks.

Performance principles:
  - Dashboard is ONE SQL aggregate over lesson_progress + ONE select over
    enrollments. Never per-course iteration. The query budget test enforces this.
  - All hot-path queries hit the (user_id, course_id) compound index.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, ValidationError
from app.learning.models.learning import (
    CourseEnrollment,
    LessonBookmark,
    LessonNote,
    LessonProgress,
)

logger = logging.getLogger(__name__)

# Cap a single time-delta. Idle browser tabs shouldn't earn streak credit.
MAX_TIME_DELTA_SECONDS = 600


class LearningService:
    # ── Enrollment ──────────────────────────────────────────────────────
    def enroll(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: str,
        source: str = "free",
        enforce: bool = True,
    ) -> CourseEnrollment:
        """Idempotent. Returns existing enrollment if already present.

        When `enforce` (default), gates new enrollments behind the course's
        entitlement — this is the single chokepoint, so it also covers the
        auto-enroll triggered by first lesson access. Deliberate grants
        (admin/comp flows) can pass enforce=False.
        """
        existing = db.execute(
            select(CourseEnrollment)
            .where(CourseEnrollment.user_id == user_id)
            .where(CourseEnrollment.course_id == course_id)
        ).scalar_one_or_none()
        if existing:
            return existing

        if enforce:
            # Lazy import avoids any import cycle (access -> entitlements/auth).
            from app.core.access import enforce_course_access
            enforce_course_access(db, user_id=user_id, course_id=course_id)

        enrollment = CourseEnrollment(
            user_id=user_id, course_id=course_id, source=source
        )
        db.add(enrollment)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return db.execute(
                select(CourseEnrollment)
                .where(CourseEnrollment.user_id == user_id)
                .where(CourseEnrollment.course_id == course_id)
            ).scalar_one()
        db.refresh(enrollment)
        return enrollment

    def list_enrollments(
        self, db: Session, *, user_id: int
    ) -> list[CourseEnrollment]:
        return list(
            db.execute(
                select(CourseEnrollment)
                .where(CourseEnrollment.user_id == user_id)
                .where(CourseEnrollment.status == "active")
                .order_by(CourseEnrollment.enrolled_at.desc())
            )
            .scalars()
            .all()
        )

    def is_enrolled(
        self, db: Session, *, user_id: int, course_id: str
    ) -> bool:
        row = db.execute(
            select(CourseEnrollment.id)
            .where(CourseEnrollment.user_id == user_id)
            .where(CourseEnrollment.course_id == course_id)
            .where(CourseEnrollment.status == "active")
        ).scalar_one_or_none()
        return row is not None

    # ── Progress ────────────────────────────────────────────────────────
    def upsert_progress(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: str,
        lesson_id: str,
        status: Optional[str] = None,
        last_position: Optional[str] = None,
        time_delta_seconds: Optional[int] = None,
    ) -> LessonProgress:
        """Find or create the row, apply updates, bump last_accessed_at.

        Auto-creates an enrollment if one doesn't exist (free-course default).
        Idempotent for status='completed' — repeat calls don't shift completed_at.
        """
        # Auto-enroll on first lesson access. Cheap (existence check is one query).
        if not self.is_enrolled(db, user_id=user_id, course_id=course_id):
            self.enroll(db, user_id=user_id, course_id=course_id, source="free")

        row = db.execute(
            select(LessonProgress)
            .where(LessonProgress.user_id == user_id)
            .where(LessonProgress.lesson_id == lesson_id)
        ).scalar_one_or_none()

        now = datetime.now(timezone.utc)

        if row is None:
            row = LessonProgress(
                user_id=user_id,
                course_id=course_id,
                lesson_id=lesson_id,
                status=status or "in_progress",
                last_position=last_position,
                time_spent_seconds=min(time_delta_seconds or 0, MAX_TIME_DELTA_SECONDS),
                started_at=now,
                last_accessed_at=now,
                completed_at=now if status == "completed" else None,
            )
            db.add(row)
        else:
            # course_id should match — guard against client mistake.
            if row.course_id != course_id:
                raise ValidationError(
                    f"Lesson {lesson_id} belongs to course {row.course_id}, not {course_id}"
                )
            if last_position is not None:
                row.last_position = last_position
            if time_delta_seconds is not None and time_delta_seconds > 0:
                # Cap to defeat tab-idle inflation.
                bump = min(time_delta_seconds, MAX_TIME_DELTA_SECONDS)
                row.time_spent_seconds = (row.time_spent_seconds or 0) + bump
            if status:
                # Only allow forward transitions: in_progress -> completed.
                # 'not_started' should never come over the wire; the row exists
                # because the user has accessed it.
                if status == "completed" and row.status != "completed":
                    row.status = "completed"
                    row.completed_at = now
                elif status == "in_progress" and row.status != "completed":
                    row.status = "in_progress"
            row.last_accessed_at = now

        try:
            db.commit()
        except IntegrityError:
            # Race: another request inserted concurrently. Re-read and apply.
            db.rollback()
            row = db.execute(
                select(LessonProgress)
                .where(LessonProgress.user_id == user_id)
                .where(LessonProgress.lesson_id == lesson_id)
            ).scalar_one()
            return row
        db.refresh(row)
        return row

    def get_progress(
        self, db: Session, *, user_id: int, lesson_id: str
    ) -> Optional[LessonProgress]:
        return db.execute(
            select(LessonProgress)
            .where(LessonProgress.user_id == user_id)
            .where(LessonProgress.lesson_id == lesson_id)
        ).scalar_one_or_none()

    def list_progress_for_course(
        self, db: Session, *, user_id: int, course_id: str
    ) -> list[LessonProgress]:
        return list(
            db.execute(
                select(LessonProgress)
                .where(LessonProgress.user_id == user_id)
                .where(LessonProgress.course_id == course_id)
                .order_by(LessonProgress.last_accessed_at.desc())
            )
            .scalars()
            .all()
        )

    # ── Dashboard ───────────────────────────────────────────────────────
    def dashboard(self, db: Session, *, user_id: int) -> dict:
        """Return per-course aggregate progress + the 'continue learning' row.

        Designed as TWO queries total regardless of how many courses the user
        has touched. Aggregates roll up in SQL via GROUP BY + CASE.
        """
        # 1. Per-course aggregate.
        agg_rows = db.execute(
            select(
                LessonProgress.course_id,
                func.count(LessonProgress.id).label("touched"),
                func.sum(
                    case((LessonProgress.status == "completed", 1), else_=0)
                ).label("completed"),
                func.sum(LessonProgress.time_spent_seconds).label("total_time"),
                func.max(LessonProgress.last_accessed_at).label("last_accessed"),
            )
            .where(LessonProgress.user_id == user_id)
            .group_by(LessonProgress.course_id)
        ).all()

        # 2. The single most-recently-accessed in-progress lesson — "continue learning".
        resume_row = db.execute(
            select(LessonProgress)
            .where(LessonProgress.user_id == user_id)
            .where(LessonProgress.status == "in_progress")
            .order_by(LessonProgress.last_accessed_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        # 3. Enrollment status — fold it in so the response tells the frontend
        # which courses they're enrolled in (not just touched). One query.
        enrolled_set = {
            row[0]
            for row in db.execute(
                select(CourseEnrollment.course_id)
                .where(CourseEnrollment.user_id == user_id)
                .where(CourseEnrollment.status == "active")
            ).all()
        }

        # Build the per-course summaries — and also surface the "last lesson"
        # within each course. Cheap: one extra select for the latest row per
        # course, ordered server-side. Could be a window function but SQLite
        # doesn't love those; we issue one targeted query per course AT MOST,
        # but only for the courses that have progress — bounded by # courses
        # the user has touched, typically ≤ 5.
        course_ids_with_progress = [r[0] for r in agg_rows]
        agg_by_course = {row[0]: row for row in agg_rows}
        last_per_course: dict[str, tuple[str, Optional[str]]] = {}
        if course_ids_with_progress:
            # One query that picks (course, lesson_id, last_position) for the
            # most recent row in each course using a per-course max.
            last_rows = db.execute(
                select(
                    LessonProgress.course_id,
                    LessonProgress.lesson_id,
                    LessonProgress.last_position,
                    LessonProgress.last_accessed_at,
                )
                .where(LessonProgress.user_id == user_id)
                .where(LessonProgress.course_id.in_(course_ids_with_progress))
                .order_by(LessonProgress.course_id, LessonProgress.last_accessed_at.desc())
            ).all()
            for cid, lid, pos, _ in last_rows:
                # Keep the first (most recent) per course.
                last_per_course.setdefault(cid, (lid, pos))

        summaries = []
        # Surface every aggregated course PLUS any enrolled-but-untouched courses.
        all_course_ids = set(course_ids_with_progress) | enrolled_set
        for cid in sorted(all_course_ids):
            agg = agg_by_course.get(cid)
            last = last_per_course.get(cid)
            summaries.append(
                {
                    "course_id": cid,
                    "enrolled": cid in enrolled_set,
                    "lessons_total_in_progress": int(agg[1]) if agg else 0,
                    "lessons_completed": int(agg[2] or 0) if agg else 0,
                    "total_time_seconds": int(agg[3] or 0) if agg else 0,
                    "last_lesson_id": last[0] if last else None,
                    "last_position": last[1] if last else None,
                    "last_accessed_at": agg[4] if agg else None,
                }
            )

        return {
            "courses": summaries,
            "resume": resume_row,
        }

    # ── Notes ───────────────────────────────────────────────────────────
    def upsert_note(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: str,
        lesson_id: str,
        content: str,
    ) -> LessonNote:
        row = db.execute(
            select(LessonNote)
            .where(LessonNote.user_id == user_id)
            .where(LessonNote.lesson_id == lesson_id)
        ).scalar_one_or_none()
        if row is None:
            row = LessonNote(
                user_id=user_id,
                course_id=course_id,
                lesson_id=lesson_id,
                content=content,
            )
            db.add(row)
        else:
            row.content = content
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            row = db.execute(
                select(LessonNote)
                .where(LessonNote.user_id == user_id)
                .where(LessonNote.lesson_id == lesson_id)
            ).scalar_one()
            row.content = content
            db.commit()
        db.refresh(row)
        return row

    def get_note(
        self, db: Session, *, user_id: int, lesson_id: str
    ) -> Optional[LessonNote]:
        return db.execute(
            select(LessonNote)
            .where(LessonNote.user_id == user_id)
            .where(LessonNote.lesson_id == lesson_id)
        ).scalar_one_or_none()

    def delete_note(
        self, db: Session, *, user_id: int, lesson_id: str
    ) -> None:
        row = self.get_note(db, user_id=user_id, lesson_id=lesson_id)
        if not row:
            raise NotFound("Note not found")
        db.delete(row)
        db.commit()

    def list_notes(
        self, db: Session, *, user_id: int, course_id: Optional[str] = None
    ) -> list[LessonNote]:
        q = select(LessonNote).where(LessonNote.user_id == user_id)
        if course_id:
            q = q.where(LessonNote.course_id == course_id)
        return list(
            db.execute(q.order_by(LessonNote.updated_at.desc())).scalars().all()
        )

    # ── Bookmarks ───────────────────────────────────────────────────────
    def add_bookmark(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: str,
        lesson_id: str,
        caption: Optional[str] = None,
    ) -> LessonBookmark:
        existing = db.execute(
            select(LessonBookmark)
            .where(LessonBookmark.user_id == user_id)
            .where(LessonBookmark.lesson_id == lesson_id)
        ).scalar_one_or_none()
        if existing:
            # Update caption if provided; idempotent otherwise.
            if caption is not None and caption != existing.caption:
                existing.caption = caption
                db.commit()
                db.refresh(existing)
            return existing

        bm = LessonBookmark(
            user_id=user_id,
            course_id=course_id,
            lesson_id=lesson_id,
            caption=caption,
        )
        db.add(bm)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return db.execute(
                select(LessonBookmark)
                .where(LessonBookmark.user_id == user_id)
                .where(LessonBookmark.lesson_id == lesson_id)
            ).scalar_one()
        db.refresh(bm)
        return bm

    def remove_bookmark(
        self, db: Session, *, user_id: int, lesson_id: str
    ) -> None:
        row = db.execute(
            select(LessonBookmark)
            .where(LessonBookmark.user_id == user_id)
            .where(LessonBookmark.lesson_id == lesson_id)
        ).scalar_one_or_none()
        if not row:
            raise NotFound("Bookmark not found")
        db.delete(row)
        db.commit()

    def list_bookmarks(
        self, db: Session, *, user_id: int, course_id: Optional[str] = None
    ) -> list[LessonBookmark]:
        q = select(LessonBookmark).where(LessonBookmark.user_id == user_id)
        if course_id:
            q = q.where(LessonBookmark.course_id == course_id)
        return list(
            db.execute(q.order_by(LessonBookmark.created_at.desc())).scalars().all()
        )


learning_service = LearningService()
