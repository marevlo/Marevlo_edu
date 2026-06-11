"""
Notification service.

Responsibilities:
  - Create notifications (single recipient or fan-out to all users).
  - List notifications for the current user, with unread count.
  - Mark one or all as read.
  - Push to the recipient's WebSocket if connected.

Write path is async-friendly:
  notification_service.notify(
      db, user_id=42, type=NOTIF_POST_COMMENT, payload={"post_id": 7}, actor_user_id=11,
  )

Push to WebSocket happens via app.chat.services.connection_manager.send_to_user
which in turn publishes to Redis pubsub for cross-process fanout. We DON'T
fail the parent operation if push fails — the row is always written; the
push is best-effort.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.notifications.models.notification import (
    NOTIF_ADMIN_ANNOUNCEMENT,
    NOTIF_COMMENT_REPLY,
    NOTIF_NEW_FOLLOWER,
    NOTIF_POST_COMMENT,
    NOTIF_POST_LIKE,
    Notification,
)
from app.notifications.models.preference import UserNotificationPrefs

logger = logging.getLogger(__name__)

# Which preference toggle governs each notification type. Types not listed
# here (certificate_ready, report_resolved, ...) are always delivered.
PREF_FIELD_BY_TYPE = {
    NOTIF_COMMENT_REPLY: "in_app_social",
    NOTIF_POST_COMMENT: "in_app_social",
    NOTIF_POST_LIKE: "in_app_social",
    NOTIF_NEW_FOLLOWER: "in_app_social",
    NOTIF_ADMIN_ANNOUNCEMENT: "in_app_announcements",
}


class NotificationService:
    # ── Create ──────────────────────────────────────────────────────────
    def notify(
        self,
        db: Session,
        *,
        user_id: int,
        type: str,
        payload: Optional[dict] = None,
        actor_user_id: Optional[int] = None,
        commit: bool = True,
    ) -> Notification:
        """Persist a notification for one recipient.

        Self-notifications are filtered: if actor_user_id == user_id we no-op
        (no point telling you about your own action). Recipients who disabled
        the type's preference toggle are skipped (missing row = defaults = allow).
        """
        if actor_user_id is not None and actor_user_id == user_id:
            return None  # type: ignore[return-value]

        if not self._prefs_allow(db, user_id=user_id, type=type):
            return None  # type: ignore[return-value]

        notif = Notification(
            user_id=user_id,
            type=type,
            actor_user_id=actor_user_id,
            payload=payload,
        )
        db.add(notif)
        if commit:
            db.commit()
            db.refresh(notif)
        return notif

    def notify_many(
        self,
        db: Session,
        *,
        user_ids: Iterable[int],
        type: str,
        payload: Optional[dict] = None,
        actor_user_id: Optional[int] = None,
    ) -> int:
        """Fan-out to multiple recipients in one transaction. Returns count written."""
        rows = []
        for uid in user_ids:
            if actor_user_id is not None and actor_user_id == uid:
                continue
            rows.append(
                Notification(
                    user_id=uid,
                    type=type,
                    actor_user_id=actor_user_id,
                    payload=payload,
                )
            )
        if not rows:
            return 0
        db.add_all(rows)
        db.commit()
        return len(rows)

    def announce_to_all(
        self,
        db: Session,
        *,
        type: str,
        payload: dict,
        actor_user_id: Optional[int] = None,
    ) -> int:
        """Admin-style announcement: write a notification to every active user.

        At our scale (≤ a few thousand users) one INSERT per user is fine.
        At Coursera scale you'd want a fan-in/fan-out queue. We're not there.

        Users who opted out of announcements are excluded; users with no
        prefs row keep the default (announcements on).
        """
        ids = [
            uid for (uid,) in db.execute(
                select(User.id)
                .outerjoin(
                    UserNotificationPrefs,
                    UserNotificationPrefs.user_id == User.id,
                )
                .where(User.is_active.is_(True))
                .where(
                    or_(
                        UserNotificationPrefs.user_id.is_(None),
                        UserNotificationPrefs.in_app_announcements.is_(True),
                    )
                )
            ).all()
        ]
        return self.notify_many(
            db,
            user_ids=ids,
            type=type,
            payload=payload,
            actor_user_id=actor_user_id,
        )

    # ── Preferences ─────────────────────────────────────────────────────
    def _prefs_allow(self, db: Session, *, user_id: int, type: str) -> bool:
        """True if the recipient's prefs allow this notification type.

        Missing prefs row means defaults (everything on). Unknown types are
        always allowed — preference gating is opt-in per type.
        """
        field = PREF_FIELD_BY_TYPE.get(type)
        if field is None:
            return True
        prefs = db.get(UserNotificationPrefs, user_id)
        if prefs is None:
            return True
        return bool(getattr(prefs, field))

    def get_prefs(self, db: Session, *, user_id: int) -> UserNotificationPrefs:
        """Get-or-create the user's prefs row (defaults = everything on)."""
        prefs = db.get(UserNotificationPrefs, user_id)
        if prefs is None:
            prefs = UserNotificationPrefs(user_id=user_id)
            db.add(prefs)
            db.commit()
            db.refresh(prefs)
        return prefs

    def update_prefs(
        self, db: Session, *, user_id: int, fields: dict
    ) -> UserNotificationPrefs:
        """Partial update — only the provided toggles change."""
        prefs = self.get_prefs(db, user_id=user_id)
        for key in ("in_app_social", "in_app_announcements", "email_updates"):
            value = fields.get(key)
            if value is not None:
                setattr(prefs, key, bool(value))
        db.commit()
        db.refresh(prefs)
        return prefs

    # ── Read ────────────────────────────────────────────────────────────
    def list_for_user(
        self,
        db: Session,
        *,
        user_id: int,
        page: int = 1,
        limit: int = 20,
        only_unread: bool = False,
    ) -> tuple[list[dict], int, int]:
        """Return (rows, total_count, unread_count). Joins User to surface
        the actor's username so the frontend doesn't need a second call."""
        # Counts in two cheap queries.
        total = (
            db.execute(
                select(func.count(Notification.id)).where(
                    Notification.user_id == user_id
                )
            ).scalar()
            or 0
        )
        unread = (
            db.execute(
                select(func.count(Notification.id))
                .where(Notification.user_id == user_id)
                .where(Notification.read_at.is_(None))
            ).scalar()
            or 0
        )

        # The page itself, joined to User for actor_username.
        q = (
            select(Notification, User.username)
            .outerjoin(User, User.id == Notification.actor_user_id)
            .where(Notification.user_id == user_id)
        )
        if only_unread:
            q = q.where(Notification.read_at.is_(None))
        q = (
            q.order_by(Notification.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )

        rows = db.execute(q).all()
        items = []
        for n, actor_uname in rows:
            items.append(
                {
                    "id": n.id,
                    "type": n.type,
                    "actor_user_id": n.actor_user_id,
                    "actor_username": actor_uname,
                    "payload": n.payload,
                    "read_at": n.read_at,
                    "created_at": n.created_at,
                }
            )
        return items, int(total), int(unread)

    def unread_count(self, db: Session, *, user_id: int) -> int:
        return (
            db.execute(
                select(func.count(Notification.id))
                .where(Notification.user_id == user_id)
                .where(Notification.read_at.is_(None))
            ).scalar()
            or 0
        )

    # ── Mark read ───────────────────────────────────────────────────────
    def mark_read(
        self, db: Session, *, user_id: int, notification_id: int
    ) -> int:
        """Mark a single notification read. Returns rows affected (0 or 1).

        Filters by user_id so you can't mark someone else's notifications.
        """
        now = datetime.now(timezone.utc)
        result = db.execute(
            update(Notification)
            .where(Notification.id == notification_id)
            .where(Notification.user_id == user_id)
            .where(Notification.read_at.is_(None))
            .values(read_at=now)
        )
        db.commit()
        return result.rowcount or 0

    def mark_all_read(self, db: Session, *, user_id: int) -> int:
        """Mark all of this user's unread notifications as read."""
        now = datetime.now(timezone.utc)
        result = db.execute(
            update(Notification)
            .where(Notification.user_id == user_id)
            .where(Notification.read_at.is_(None))
            .values(read_at=now)
        )
        db.commit()
        return result.rowcount or 0


notification_service = NotificationService()
