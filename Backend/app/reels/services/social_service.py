"""Reels — social graph: follow creators + the following feed.

Reuses the platform-wide Follow model (app.chat.models.chat.Follow) — a reel
follow is just a user follow, so there is no separate reels follow table.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.chat.models.chat import Follow
from app.core.exceptions import NotFound, ValidationError
from app.reels.models.reel import Reel


class SocialService:
    def toggle_follow(self, db: Session, *, follower_id: int, following_id: int) -> dict:
        if follower_id == following_id:
            raise ValidationError("You cannot follow yourself")
        from app.auth.models.user import User
        if db.query(User.id).filter(User.id == following_id).first() is None:
            raise NotFound("User not found")

        row = (db.query(Follow)
               .filter(Follow.follower_id == follower_id,
                       Follow.following_id == following_id).first())
        if row:
            db.delete(row)
            db.commit()
            return {"following": False, "followers": self._follower_count(db, following_id)}

        db.add(Follow(follower_id=follower_id, following_id=following_id))
        db.commit()
        try:
            from app.reels.services.notification_service import notify_new_follower
            notify_new_follower(db, creator_id=following_id, follower_id=follower_id)
        except Exception:  # noqa: BLE001
            pass
        return {"following": True, "followers": self._follower_count(db, following_id)}

    def is_following(self, db: Session, *, follower_id: int | None, following_id: int) -> bool:
        if not follower_id:
            return False
        return db.query(Follow.id).filter(
            Follow.follower_id == follower_id,
            Follow.following_id == following_id).first() is not None

    def following_feed(self, db: Session, *, user_id: int, page: int, limit: int) -> tuple[list[Reel], int]:
        creator_ids = [i for (i,) in db.query(Follow.following_id).filter(
            Follow.follower_id == user_id)]
        if not creator_ids:
            return [], 0
        q = (db.query(Reel)
             .options(selectinload(Reel.author), selectinload(Reel.anchors))
             .filter(Reel.user_id.in_(creator_ids),
                     Reel.status == "approved", Reel.deleted_at.is_(None)))
        total = q.with_entities(func.count(Reel.id)).order_by(None).scalar() or 0
        rows = (q.order_by(Reel.published_at.desc().nullslast(), Reel.created_at.desc())
                .offset((page - 1) * limit).limit(limit).all())
        return rows, total

    def _follower_count(self, db: Session, user_id: int) -> int:
        return db.query(func.count(Follow.id)).filter(
            Follow.following_id == user_id).scalar() or 0


social_service = SocialService()
