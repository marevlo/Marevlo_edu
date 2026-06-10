"""Learning system endpoints: enrollment, progress, notes, bookmarks, dashboard."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.learning.schemas.learning import (
    BookmarkCreate,
    BookmarkListOut,
    BookmarkOut,
    DashboardOut,
    EnrollmentListOut,
    EnrollmentOut,
    MessageOut,
    NoteListOut,
    NoteOut,
    NoteUpsert,
    ProgressOut,
    ProgressUpdate,
)
from app.learning.services.learning_service import learning_service

router = APIRouter(prefix="/learning", tags=["learning"])


# ── Enrollment ──────────────────────────────────────────────────────────
@router.post("/enrollments/{course_id}", response_model=EnrollmentOut)
def enroll(
    course_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Self-enroll in a course. Idempotent: returns existing if already enrolled."""
    return learning_service.enroll(db, user_id=user.id, course_id=course_id)


@router.get("/enrollments", response_model=EnrollmentListOut)
def list_enrollments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = learning_service.list_enrollments(db, user_id=user.id)
    return EnrollmentListOut(enrollments=[EnrollmentOut.model_validate(e) for e in items])


# ── Progress ────────────────────────────────────────────────────────────
@router.put("/progress/{lesson_id:path}", response_model=ProgressOut)
def upsert_progress(
    lesson_id: str,
    body: ProgressUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update progress for a lesson. Auto-enrolls in the course if needed.

    Use `:path` so lesson_id can contain dots (e.g. 'recsys.m01.l03').

    Body fields are all optional — pass only what you want to change:
      - status: 'in_progress' | 'completed'
      - last_position: any string the frontend understands
      - time_delta_seconds: increment to add (capped at 600 server-side)
    """
    row = learning_service.upsert_progress(
        db,
        user_id=user.id,
        course_id=body.course_id,
        lesson_id=lesson_id,
        status=body.status,
        last_position=body.last_position,
        time_delta_seconds=body.time_delta_seconds,
    )
    return ProgressOut.model_validate(row)


@router.get("/progress/{lesson_id:path}", response_model=ProgressOut)
def get_progress(
    lesson_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = learning_service.get_progress(db, user_id=user.id, lesson_id=lesson_id)
    if not row:
        # Return a 'fresh' shape so the frontend doesn't need a separate
        # 404 path — users who haven't started just get default values.
        from app.core.exceptions import NotFound

        raise NotFound("No progress recorded for this lesson")
    return ProgressOut.model_validate(row)


@router.get("/courses/{course_id}/progress")
def list_progress_for_course(
    course_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = learning_service.list_progress_for_course(
        db, user_id=user.id, course_id=course_id
    )
    return {
        "course_id": course_id,
        "lessons": [ProgressOut.model_validate(i) for i in items],
    }


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One-shot summary: per-course aggregates + 'continue learning' shortcut.

    Designed to power the home dashboard with a single network call.
    """
    data = learning_service.dashboard(db, user_id=user.id)
    return DashboardOut(
        courses=data["courses"],
        resume=ProgressOut.model_validate(data["resume"]) if data["resume"] else None,
    )


# ── Notes ───────────────────────────────────────────────────────────────
@router.put("/notes/{lesson_id:path}", response_model=NoteOut)
def upsert_note(
    lesson_id: str,
    body: NoteUpsert,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = learning_service.upsert_note(
        db,
        user_id=user.id,
        course_id=body.course_id,
        lesson_id=lesson_id,
        content=body.content,
    )
    return NoteOut.model_validate(row)


@router.get("/notes/{lesson_id:path}", response_model=NoteOut)
def get_note(
    lesson_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = learning_service.get_note(db, user_id=user.id, lesson_id=lesson_id)
    if not row:
        from app.core.exceptions import NotFound

        raise NotFound("No note for this lesson")
    return NoteOut.model_validate(row)


@router.delete("/notes/{lesson_id:path}", response_model=MessageOut)
def delete_note(
    lesson_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    learning_service.delete_note(db, user_id=user.id, lesson_id=lesson_id)
    return MessageOut(message="Note deleted")


@router.get("/notes", response_model=NoteListOut)
def list_notes(
    course_id: str | None = Query(None, description="Filter to a single course"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = learning_service.list_notes(db, user_id=user.id, course_id=course_id)
    return NoteListOut(notes=[NoteOut.model_validate(i) for i in items])


# ── Bookmarks ───────────────────────────────────────────────────────────
@router.post("/bookmarks/{lesson_id:path}", response_model=BookmarkOut)
def add_bookmark(
    lesson_id: str,
    body: BookmarkCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = learning_service.add_bookmark(
        db,
        user_id=user.id,
        course_id=body.course_id,
        lesson_id=lesson_id,
        caption=body.caption,
    )
    return BookmarkOut.model_validate(row)


@router.delete("/bookmarks/{lesson_id:path}", response_model=MessageOut)
def remove_bookmark(
    lesson_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    learning_service.remove_bookmark(db, user_id=user.id, lesson_id=lesson_id)
    return MessageOut(message="Bookmark removed")


@router.get("/bookmarks", response_model=BookmarkListOut)
def list_bookmarks(
    course_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = learning_service.list_bookmarks(db, user_id=user.id, course_id=course_id)
    return BookmarkListOut(bookmarks=[BookmarkOut.model_validate(i) for i in items])
