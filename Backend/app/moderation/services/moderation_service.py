"""
Moderation service.

Owns:
  - Filing reports against posts and comments (by any authenticated user).
  - Admin queue: list reports, resolve/dismiss with optional content removal.
  - User blocks: bidirectional invisibility + DM rejection.
  - Helpers used by feed/chat: "is X blocked by Y?", "blocked-set for user U".
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.common.audit_logger import audit_logger
from app.common.security_event import EVT_ADMIN_ACTION, EVT_BLOCK_USER
from app.core.exceptions import (
    Conflict,
    Forbidden,
    NotFound,
    ValidationError,
)
from app.feed.models.post import Post, PostComment
from app.moderation.models.moderation import (
    REPORT_STATUS_DISMISSED,
    REPORT_STATUS_OPEN,
    REPORT_STATUS_RESOLVED,
    CommentReport,
    PostReport,
    UserBlock,
)

logger = logging.getLogger(__name__)


class ModerationService:
    # ── Reports (file) ──────────────────────────────────────────────────
    def report_post(
        self, db: Session, *, reporter_id: int, post_id: int, reason: str, note: Optional[str]
    ) -> PostReport:
        post = db.get(Post, post_id)
        if not post or post.deleted_at is not None:
            raise NotFound("Post not found")
        if post.user_id == reporter_id:
            raise ValidationError("You cannot report your own post")

        report = PostReport(
            post_id=post_id,
            reporter_id=reporter_id,
            reason=reason,
            note=(note.strip() if note else None),
        )
        db.add(report)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise Conflict("You have already reported this post")
        db.refresh(report)
        return report

    def report_comment(
        self,
        db: Session,
        *,
        reporter_id: int,
        comment_id: int,
        reason: str,
        note: Optional[str],
    ) -> CommentReport:
        comment = db.get(PostComment, comment_id)
        if not comment or comment.deleted_at is not None:
            raise NotFound("Comment not found")
        if comment.user_id == reporter_id:
            raise ValidationError("You cannot report your own comment")

        report = CommentReport(
            comment_id=comment_id,
            reporter_id=reporter_id,
            reason=reason,
            note=(note.strip() if note else None),
        )
        db.add(report)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise Conflict("You have already reported this comment")
        db.refresh(report)
        return report

    # ── Admin: list & resolve ───────────────────────────────────────────
    def list_reports(
        self,
        db: Session,
        *,
        target_type: str = "all",
        status: str = REPORT_STATUS_OPEN,
        page: int = 1,
        limit: int = 20,
    ) -> tuple[list[dict], int]:
        items: list[dict] = []
        post_count = 0
        comment_count = 0
        count = 0

        if target_type in ("post", "all"):
            post_count = db.execute(
                select(func.count(PostReport.id)).where(PostReport.status == status)
            ).scalar() or 0
            rows = db.execute(
                select(PostReport, User.username)
                .join(User, User.id == PostReport.reporter_id)
                .where(PostReport.status == status)
                .order_by(PostReport.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit if target_type == "post" else limit // 2 + 1)
            ).all()
            for r, uname in rows:
                items.append(
                    {
                        "id": r.id,
                        "target_id": r.post_id,
                        "target_type": "post",
                        "reporter_id": r.reporter_id,
                        "reporter_username": uname,
                        "reason": r.reason,
                        "note": r.note,
                        "status": r.status,
                        "resolved_at": r.resolved_at,
                        "created_at": r.created_at,
                    }
                )
            if target_type == "post":
                count = int(post_count)

        if target_type in ("comment", "all"):
            comment_count = db.execute(
                select(func.count(CommentReport.id)).where(CommentReport.status == status)
            ).scalar() or 0
            crows = db.execute(
                select(CommentReport, User.username)
                .join(User, User.id == CommentReport.reporter_id)
                .where(CommentReport.status == status)
                .order_by(CommentReport.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit if target_type == "comment" else limit // 2 + 1)
            ).all()
            for r, uname in crows:
                items.append(
                    {
                        "id": r.id,
                        "target_id": r.comment_id,
                        "target_type": "comment",
                        "reporter_id": r.reporter_id,
                        "reporter_username": uname,
                        "reason": r.reason,
                        "note": r.note,
                        "status": r.status,
                        "resolved_at": r.resolved_at,
                        "created_at": r.created_at,
                    }
                )
            if target_type == "comment":
                count = int(comment_count)

        # Combined total for "all"
        if target_type == "all":
            count = int(post_count) + int(comment_count)
            # Sort merged list newest first.
            items.sort(key=lambda r: r["created_at"], reverse=True)
            items = items[: limit]

        return items, int(count)

    def resolve_post_report(
        self,
        db: Session,
        *,
        admin_id: int,
        report_id: int,
        action: str,
        note: Optional[str] = None,
    ) -> PostReport:
        report = db.get(PostReport, report_id)
        if not report:
            raise NotFound("Report not found")

        post = db.get(Post, report.post_id)
        return self._apply_resolution(
            db,
            admin_id=admin_id,
            report=report,
            target=post,
            action=action,
            note=note,
        )

    def resolve_comment_report(
        self,
        db: Session,
        *,
        admin_id: int,
        report_id: int,
        action: str,
        note: Optional[str] = None,
    ) -> CommentReport:
        report = db.get(CommentReport, report_id)
        if not report:
            raise NotFound("Report not found")

        comment = db.get(PostComment, report.comment_id)
        return self._apply_resolution(
            db,
            admin_id=admin_id,
            report=report,
            target=comment,
            action=action,
            note=note,
        )

    def _apply_resolution(
        self,
        db: Session,
        *,
        admin_id: int,
        report,
        target,
        action: str,
        note: Optional[str],
    ):
        if action not in ("resolve_delete", "resolve_keep", "dismiss"):
            raise ValidationError(f"Unknown action: {action}")

        now = datetime.now(timezone.utc)

        if action == "resolve_delete":
            if target is not None and target.deleted_at is None:
                target.deleted_at = now
                target.deleted_by_user_id = admin_id
            report.status = REPORT_STATUS_RESOLVED
        elif action == "resolve_keep":
            report.status = REPORT_STATUS_RESOLVED
        else:  # dismiss
            report.status = REPORT_STATUS_DISMISSED

        report.resolved_by_user_id = admin_id
        report.resolved_at = now
        if note:
            # Appending to original note for audit trail.
            existing = report.note or ""
            report.note = (existing + ("\n" if existing else "") + f"[admin] {note}")[:1000]
        db.commit()
        db.refresh(report)

        # Tell the reporter their report was acted on.
        from app.notifications.models.notification import NOTIF_REPORT_RESOLVED
        from app.notifications.services.notification_service import notification_service
        try:
            notification_service.notify(
                db,
                user_id=report.reporter_id,
                type=NOTIF_REPORT_RESOLVED,
                payload={
                    "report_id": report.id,
                    "action": action,
                    "status": report.status,
                },
                actor_user_id=admin_id,
            )
        except Exception:
            logger.warning("notify_report_resolved_failed", exc_info=True)

        return report

    # ── Admin: direct soft-delete ───────────────────────────────────────
    def admin_delete_post(self, db: Session, *, admin_id: int, post_id: int) -> Post:
        post = db.get(Post, post_id)
        if not post:
            raise NotFound("Post not found")
        if post.deleted_at is None:
            post.deleted_at = datetime.now(timezone.utc)
            post.deleted_by_user_id = admin_id
            db.commit()
            db.refresh(post)
            audit_logger.log(
                db,
                event_type=EVT_ADMIN_ACTION,
                user_id=admin_id,
                meta={
                    "action": "delete_post",
                    "post_id": post_id,
                    "target_user_id": post.user_id,
                },
            )
        return post

    def admin_delete_comment(
        self, db: Session, *, admin_id: int, comment_id: int
    ) -> PostComment:
        comment = db.get(PostComment, comment_id)
        if not comment:
            raise NotFound("Comment not found")
        if comment.deleted_at is None:
            comment.deleted_at = datetime.now(timezone.utc)
            comment.deleted_by_user_id = admin_id
            db.commit()
            db.refresh(comment)
            audit_logger.log(
                db,
                event_type=EVT_ADMIN_ACTION,
                user_id=admin_id,
                meta={
                    "action": "delete_comment",
                    "comment_id": comment_id,
                    "target_user_id": comment.user_id,
                },
            )
        return comment

    # ── Blocks ──────────────────────────────────────────────────────────
    def block_user(self, db: Session, *, blocker_id: int, target_id: int) -> UserBlock:
        if blocker_id == target_id:
            raise ValidationError("Cannot block yourself")
        target = db.get(User, target_id)
        if not target or target.deleted_at is not None:
            raise NotFound("User not found")

        existing = db.execute(
            select(UserBlock)
            .where(UserBlock.blocker_id == blocker_id)
            .where(UserBlock.target_id == target_id)
        ).scalar_one_or_none()
        if existing:
            return existing

        block = UserBlock(blocker_id=blocker_id, target_id=target_id)
        db.add(block)
        try:
            db.commit()
        except IntegrityError:
            # Race: another request inserted concurrently. Fetch and return.
            db.rollback()
            return db.execute(
                select(UserBlock)
                .where(UserBlock.blocker_id == blocker_id)
                .where(UserBlock.target_id == target_id)
            ).scalar_one()
        db.refresh(block)
        audit_logger.log(
            db,
            event_type=EVT_BLOCK_USER,
            user_id=blocker_id,
            meta={"target_user_id": target_id},
        )
        return block

    def unblock_user(self, db: Session, *, blocker_id: int, target_id: int) -> None:
        block = db.execute(
            select(UserBlock)
            .where(UserBlock.blocker_id == blocker_id)
            .where(UserBlock.target_id == target_id)
        ).scalar_one_or_none()
        if not block:
            raise NotFound("No such block")
        db.delete(block)
        db.commit()

    def list_blocks(self, db: Session, *, blocker_id: int) -> list[dict]:
        rows = db.execute(
            select(UserBlock, User.username)
            .join(User, User.id == UserBlock.target_id)
            .where(UserBlock.blocker_id == blocker_id)
            .order_by(UserBlock.created_at.desc())
        ).all()
        return [
            {
                "id": b.id,
                "blocker_id": b.blocker_id,
                "target_id": b.target_id,
                "target_username": uname,
                "created_at": b.created_at,
            }
            for b, uname in rows
        ]

    # ── Helpers used by feed/chat ──────────────────────────────────────
    def hidden_user_ids_for(self, db: Session, *, viewer_id: int) -> set[int]:
        """Return all user IDs that should be invisible to `viewer_id`.

        That's both: people viewer has blocked, AND people who have blocked viewer.
        Used by feed.list_posts and chat.list_chats to filter rows.
        """
        rows = db.execute(
            select(UserBlock.blocker_id, UserBlock.target_id).where(
                or_(
                    UserBlock.blocker_id == viewer_id,
                    UserBlock.target_id == viewer_id,
                )
            )
        ).all()
        hidden: set[int] = set()
        for blocker_id, target_id in rows:
            other = target_id if blocker_id == viewer_id else blocker_id
            hidden.add(other)
        return hidden

    def is_blocked_either_way(
        self, db: Session, *, user_a: int, user_b: int
    ) -> bool:
        if user_a == user_b:
            return False
        row = db.execute(
            select(UserBlock.id).where(
                or_(
                    (UserBlock.blocker_id == user_a) & (UserBlock.target_id == user_b),
                    (UserBlock.blocker_id == user_b) & (UserBlock.target_id == user_a),
                )
            )
        ).scalar_one_or_none()
        return row is not None


moderation_service = ModerationService()
