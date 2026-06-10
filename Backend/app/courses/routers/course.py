"""Course HTTP endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db, get_optional_user
from app.courses.schemas.course import (
    CommentCreate,
    CommentOut,
    CommentsPage,
    ReactionsOut,
    ReactRequest,
)
from app.courses.services.course_service import course_service

router = APIRouter(prefix="/courses", tags=["courses"])


# ── Reactions ───────────────────────────────────────────────────────────
@router.get("/{course_id}/reactions", response_model=ReactionsOut)
def get_reactions(
    course_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    counts = course_service.count_reactions(db, course_id)
    my = course_service.get_user_reaction(db, user_id=user.id, course_id=course_id) if user else None
    return ReactionsOut(**counts, reaction=my, my_reaction=my)


@router.post("/{course_id}/react", response_model=ReactionsOut)
def react(
    course_id: str,
    body: ReactRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new = course_service.react(db, user_id=user.id, course_id=course_id, reaction_type=body.type)
    counts = course_service.count_reactions(db, course_id)
    return ReactionsOut(**counts, reaction=new, my_reaction=new)


# ── Completion ──────────────────────────────────────────────────────────
@router.post("/{course_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
def complete_course(
    course_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a course as completed by the authenticated user."""
    course_service.mark_course_completed(db, user_id=user.id, course_id=course_id)


# ── Comments ────────────────────────────────────────────────────────────
@router.get("/{course_id}/comments", response_model=CommentsPage)
def list_comments(
    course_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    items, has_more = course_service.list_comments(
        db, course_id=course_id, page=page, limit=limit
    )
    return CommentsPage(comments=[CommentOut(**i) for i in items], has_more=has_more)


@router.post(
    "/{course_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    course_id: str,
    body: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = course_service.create_comment(
        db, user_id=user.id, course_id=course_id, content=body.content
    )
    return CommentOut(
        id=comment.id,
        author=user.username,
        user_id=user.id,
        content=comment.content,
        created_at=comment.created_at,
    )


@router.delete(
    "/{course_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_comment(
    course_id: str,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course_service.delete_comment(
        db, user_id=user.id, course_id=course_id, comment_id=comment_id
    )
