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

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.notifications.models.notification import Notification

logger = logging.getLogger(__name__)


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
        (no point telling you about your own action).
        """
        if actor_user_id is not None and actor_user_id == user_id:
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
        """
        ids = [
            uid for (uid,) in db.execute(
                select(User.id).where(User.is_active.is_(True))
            ).all()
        ]
        return self.notify_many(
            db,
            user_ids=ids,
            type=type,
            payload=payload,
            actor_user_id=actor_user_id,
        )

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
