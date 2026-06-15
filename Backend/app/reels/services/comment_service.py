"""Reels — comment service: list, create (rate-limited + light spam filter),
like toggle, soft-delete, pin."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import Forbidden, NotFound, ValidationError
from app.feed.schemas.post import format_relative_time
from app.reels.models.comment import ReelComment, ReelCommentLike
from app.reels.models.reel import Reel

# Deliberately tiny — a real filter belongs behind a service. This just blocks
# the most obvious abuse at the door; reports + admin takedown handle the rest.
_BLOCKLIST = re.compile(r"\b(fuck|shit|bitch|asshole|cunt)\b", re.IGNORECASE)
_COMMENT_RATE = 20          # comments
_COMMENT_WINDOW = 300       # per 5 minutes per user


class CommentService:
    def _reel_or_404(self, db: Session, reel_id: int) -> Reel:
        reel = (db.query(Reel)
                .filter(Reel.id == reel_id, Reel.deleted_at.is_(None)).first())
        if reel is None:
            raise NotFound("Reel not found")
        return reel

    def list_for_reel(self, db: Session, *, reel_id: int, viewer_id: int | None,
                      page: int, limit: int) -> dict:
        self._reel_or_404(db, reel_id)
        base = (db.query(ReelComment)
                .options(selectinload(ReelComment.author))
                .filter(ReelComment.reel_id == reel_id,
                        ReelComment.deleted_at.is_(None)))
        total = (base.filter(ReelComment.parent_id.is_(None))
                 .order_by(None).count())
        tops = (base.filter(ReelComment.parent_id.is_(None))
                .order_by(ReelComment.is_pinned.desc(), ReelComment.created_at.desc())
                .offset((page - 1) * limit).limit(limit).all())
        top_ids = [c.id for c in tops]
        replies = []
        if top_ids:
            replies = (base.filter(ReelComment.parent_id.in_(top_ids))
                       .order_by(ReelComment.created_at.asc()).all())

        liked = self._liked_ids(db, [c.id for c in tops + replies], viewer_id)
        by_parent: dict[int, list] = {}
        for r in replies:
            by_parent.setdefault(r.parent_id, []).append(
                self._to_out(r, viewer_id, liked))
        items = [self._to_out(c, viewer_id, liked, replies=by_parent.get(c.id, []))
                 for c in tops]
        return {"comments": items, "total": total,
                "pages": (total + limit - 1) // limit if limit else 0}

    def create(self, db: Session, *, reel_id: int, user_id: int,
               body: str, parent_id: int | None) -> dict:
        from app.core.rate_guard import rate_guard
        rate_guard.check(key=f"reel_comment:{user_id}",
                         limit=_COMMENT_RATE, window_seconds=_COMMENT_WINDOW)
        self._reel_or_404(db, reel_id)
        body = (body or "").strip()
        if not body:
            raise ValidationError("Comment cannot be empty")
        if _BLOCKLIST.search(body):
            raise ValidationError("Please keep comments respectful")

        if parent_id is not None:
            parent = (db.query(ReelComment)
                      .filter(ReelComment.id == parent_id,
                              ReelComment.reel_id == reel_id,
                              ReelComment.deleted_at.is_(None)).first())
            if parent is None:
                raise NotFound("Parent comment not found")
            # one level of nesting only — replies attach to the top-level root
            if parent.parent_id is not None:
                parent_id = parent.parent_id

        c = ReelComment(reel_id=reel_id, user_id=user_id, body=body, parent_id=parent_id)
        db.add(c)
        db.commit()
        db.refresh(c)
        # notify the creator (best-effort)
        try:
            from app.reels.services.notification_service import notify_comment
            notify_comment(db, reel_id=reel_id, commenter_id=user_id, comment=c)
        except Exception:  # noqa: BLE001 — never fail a comment on notify error
            pass
        return self._to_out(c, user_id, set())

    def toggle_like(self, db: Session, *, comment_id: int, user_id: int) -> dict:
        c = (db.query(ReelComment)
             .filter(ReelComment.id == comment_id,
                     ReelComment.deleted_at.is_(None)).first())
        if c is None:
            raise NotFound("Comment not found")
        row = (db.query(ReelCommentLike)
               .filter(ReelCommentLike.comment_id == comment_id,
                       ReelCommentLike.user_id == user_id).first())
        if row:
            db.delete(row)
            c.like_count = max(0, c.like_count - 1)
            on = False
        else:
            db.add(ReelCommentLike(comment_id=comment_id, user_id=user_id))
            c.like_count += 1
            on = True
        db.commit()
        return {"on": on, "count": c.like_count}

    def soft_delete(self, db: Session, *, comment_id: int, user_id: int,
                    is_admin: bool = False) -> None:
        from datetime import datetime, timezone
        c = db.query(ReelComment).filter(ReelComment.id == comment_id).first()
        if c is None or c.deleted_at is not None:
            raise NotFound("Comment not found")
        if c.user_id != user_id and not is_admin:
            raise Forbidden("You can only delete your own comment")
        c.deleted_at = datetime.now(timezone.utc)
        db.commit()

    def pin(self, db: Session, *, reel_id: int, comment_id: int, pinned: bool = True) -> dict:
        c = (db.query(ReelComment)
             .filter(ReelComment.id == comment_id, ReelComment.reel_id == reel_id,
                     ReelComment.deleted_at.is_(None)).first())
        if c is None:
            raise NotFound("Comment not found")
        c.is_pinned = pinned
        db.commit()
        return {"id": c.id, "isPinned": c.is_pinned}

    # ── internals ────────────────────────────────────────────────────────
    def _liked_ids(self, db: Session, comment_ids: list[int], viewer_id: int | None) -> set[int]:
        if not viewer_id or not comment_ids:
            return set()
        return {i for (i,) in db.query(ReelCommentLike.comment_id).filter(
            ReelCommentLike.user_id == viewer_id,
            ReelCommentLike.comment_id.in_(comment_ids))}

    def _to_out(self, c: ReelComment, viewer_id: int | None, liked: set[int],
                replies: list | None = None) -> dict:
        return {
            "id": c.id, "reelId": c.reel_id, "parentId": c.parent_id,
            "body": c.body,
            "author": getattr(c.author, "username", "unknown"),
            "authorId": c.user_id,
            "likeCount": c.like_count, "isPinned": c.is_pinned,
            "likedByMe": c.id in liked,
            "mine": viewer_id is not None and c.user_id == viewer_id,
            "time": format_relative_time(c.created_at),
            "replies": replies or [],
        }


comment_service = CommentService()
