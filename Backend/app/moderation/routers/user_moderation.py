"""End-user moderation endpoints — report a post/comment, block a user."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.moderation.schemas.moderation import (
    BlockListOut,
    BlockOut,
    MessageOut,
    ReportCreate,
    ReportOut,
)
from app.moderation.services.moderation_service import moderation_service

router = APIRouter(tags=["moderation"])


# ── Reports ─────────────────────────────────────────────────────────────
@router.post("/feed/posts/{post_id}/report", response_model=ReportOut)
def report_post(
    post_id: int,
    body: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = moderation_service.report_post(
        db,
        reporter_id=user.id,
        post_id=post_id,
        reason=body.reason,
        note=body.note,
    )
    return ReportOut(
        id=r.id,
        target_id=r.post_id,
        target_type="post",
        reporter_id=r.reporter_id,
        reporter_username=user.username,
        reason=r.reason,
        note=r.note,
        status=r.status,
        resolved_at=r.resolved_at,
        created_at=r.created_at,
    )


@router.post("/feed/comments/{comment_id}/report", response_model=ReportOut)
def report_comment(
    comment_id: int,
    body: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    r = moderation_service.report_comment(
        db,
        reporter_id=user.id,
        comment_id=comment_id,
        reason=body.reason,
        note=body.note,
    )
    return ReportOut(
        id=r.id,
        target_id=r.comment_id,
        target_type="comment",
        reporter_id=r.reporter_id,
        reporter_username=user.username,
        reason=r.reason,
        note=r.note,
        status=r.status,
        resolved_at=r.resolved_at,
        created_at=r.created_at,
    )


# ── Blocks ──────────────────────────────────────────────────────────────
@router.post("/users/{user_id}/block", response_model=BlockOut)
def block_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    b = moderation_service.block_user(db, blocker_id=user.id, target_id=user_id)
    target = db.get(User, user_id)
    return BlockOut(
        id=b.id,
        blocker_id=b.blocker_id,
        target_id=b.target_id,
        target_username=target.username if target else None,
        created_at=b.created_at,
    )


@router.delete("/users/{user_id}/block", response_model=MessageOut)
def unblock_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    moderation_service.unblock_user(db, blocker_id=user.id, target_id=user_id)
    return MessageOut(message="Unblocked")


@router.get("/users/me/blocks", response_model=BlockListOut)
def my_blocks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = moderation_service.list_blocks(db, blocker_id=user.id)
    return BlockListOut(blocks=[BlockOut(**i) for i in items])
