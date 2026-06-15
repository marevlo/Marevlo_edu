"""Reels — notification helpers.

Thin wrappers over the platform notification service
(app.notifications.services.notification_service) so reels don't run a parallel
notification system. Each helper is best-effort; callers wrap them in try/except
so a notification failure never breaks the triggering action. The platform
service already filters self-notifications and respects per-user prefs.

Types are reel-specific strings carried in `type`; the renderable context lives
in `payload` (reelId, reelTitle, actor username). "new_follower" reuses the
platform's existing constant so it shares the social-notifications toggle.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.notifications.models.notification import NOTIF_NEW_FOLLOWER
from app.notifications.services.notification_service import notification_service
from app.reels.models.reel import Reel

logger = logging.getLogger(__name__)

NOTIF_REEL_COMMENT = "reel_comment"
NOTIF_REEL_LIKE_MILESTONE = "reel_like_milestone"

_LIKE_MILESTONES = (100, 500, 1000, 5000, 10000)


def _username(db: Session, user_id: int | None) -> str:
    if not user_id:
        return "Someone"
    from app.auth.models.user import User
    u = db.query(User).filter(User.id == user_id).first()
    return getattr(u, "username", "Someone") or "Someone"


def notify_comment(db: Session, *, reel_id: int, commenter_id: int, comment) -> None:
    reel = db.query(Reel).filter(Reel.id == reel_id).first()
    if reel is None:
        return
    notification_service.notify(
        db, user_id=reel.user_id, type=NOTIF_REEL_COMMENT, actor_user_id=commenter_id,
        payload={"reelId": reel_id, "reelTitle": reel.title,
                 "actor": _username(db, commenter_id),
                 "commentId": getattr(comment, "id", None)},
    )


def notify_like_milestone(db: Session, *, reel: Reel) -> None:
    if reel.like_count in _LIKE_MILESTONES:
        notification_service.notify(
            db, user_id=reel.user_id, type=NOTIF_REEL_LIKE_MILESTONE,
            payload={"reelId": reel.id, "reelTitle": reel.title, "likes": reel.like_count},
        )


def notify_new_follower(db: Session, *, creator_id: int, follower_id: int) -> None:
    notification_service.notify(
        db, user_id=creator_id, type=NOTIF_NEW_FOLLOWER, actor_user_id=follower_id,
        payload={"actor": _username(db, follower_id)},
    )
