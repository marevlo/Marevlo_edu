"""User-facing notifications endpoints + admin announcement."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db, require_admin
from app.core.exceptions import NotFound
from app.notifications.schemas.notification import (
    MessageOut,
    NotificationListOut,
    NotificationOut,
    UnreadCountOut,
)
from app.notifications.services.notification_service import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def list_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    only_unread: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total, unread = notification_service.list_for_user(
        db,
        user_id=user.id,
        page=page,
        limit=limit,
        only_unread=only_unread,
    )
    return NotificationListOut(
        notifications=[NotificationOut(**i) for i in items],
        unread_count=unread,
        pagination={
            "page": page,
            "limit": limit,
            "total_count": total,
            "total_pages": (total + limit - 1) // limit if limit else 0,
        },
    )


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lightweight badge endpoint — call this every 30s from the frontend."""
    return UnreadCountOut(unread_count=notification_service.unread_count(db, user_id=user.id))


@router.post("/{notification_id}/read", response_model=MessageOut)
def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    affected = notification_service.mark_read(
        db, user_id=user.id, notification_id=notification_id
    )
    if affected == 0:
        # Either it doesn't exist, isn't yours, or was already read.
        # We collapse all three into 404 to avoid leaking which one.
        raise NotFound("Notification not found")
    return MessageOut(message="Marked read", affected=affected)


@router.post("/mark-all-read", response_model=MessageOut)
def mark_all_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    affected = notification_service.mark_all_read(db, user_id=user.id)
    return MessageOut(message="Marked all read", affected=affected)


# ── Admin announcements ─────────────────────────────────────────────────
admin_router = APIRouter(prefix="/admin/announcements", tags=["admin"])


@admin_router.post("", response_model=MessageOut)
def announce(
    payload: dict,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Broadcast a notification to every active user.

    Body should be a JSON object with at minimum a `title` and `body` so the
    frontend can render it. Example:
      {"title": "New course: RAG Evaluation", "body": "Just shipped!", "url": "/courses/rag-eval"}
    """
    if not isinstance(payload, dict) or "title" not in payload or "body" not in payload:
        from app.core.exceptions import ValidationError

        raise ValidationError("Announcement body must include 'title' and 'body'")

    from app.notifications.models.notification import NOTIF_ADMIN_ANNOUNCEMENT

    count = notification_service.announce_to_all(
        db,
        type=NOTIF_ADMIN_ANNOUNCEMENT,
        payload=payload,
        actor_user_id=admin.id,
    )
    return MessageOut(message=f"Announcement sent to {count} users", affected=count)
