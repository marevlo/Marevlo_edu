"""Course service — reactions, comments, and completion tracking."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.exceptions import Forbidden, NotFound
from app.courses.models.course import CourseComment, CourseReaction
from app.common.activity_log import ActivityLog


class CourseService:
    # ── Reactions ───────────────────────────────────────────────────────
    def count_reactions(self, db: Session, course_id: str) -> dict:
        rows = db.execute(
            select(CourseReaction.reaction_type, func.count().label("cnt"))
            .where(CourseReaction.course_id == course_id)
            .group_by(CourseReaction.reaction_type)
        ).all()
        result = {"likes": 0, "dislikes": 0}
        for rtype, cnt in rows:
            if rtype == "like":
                result["likes"] = int(cnt)
            elif rtype == "dislike":
                result["dislikes"] = int(cnt)
        return result

    def get_user_reaction(
        self, db: Session, *, user_id: int, course_id: str
    ) -> Optional[str]:
        return db.execute(
            select(CourseReaction.reaction_type)
            .where(CourseReaction.user_id == user_id)
            .where(CourseReaction.course_id == course_id)
        ).scalar_one_or_none()

    def react(
        self,
        db: Session,
        *,
        user_id: int,
        course_id: str,
        reaction_type: str,
    ) -> Optional[str]:
        """Returns the new reaction, or None if toggled off."""
        existing = db.execute(
            select(CourseReaction)
            .where(CourseReaction.user_id == user_id)
            .where(CourseReaction.course_id == course_id)
        ).scalar_one_or_none()

        if existing is None:
            db.add(CourseReaction(user_id=user_id, course_id=course_id, reaction_type=reaction_type))
            new = reaction_type
        elif existing.reaction_type == reaction_type:
            db.delete(existing)
            new = None
        else:
            existing.reaction_type = reaction_type
            new = reaction_type

        db.commit()
        return new

    # ── Comments ────────────────────────────────────────────────────────
    def list_comments(
        self, db: Session, *, course_id: str, page: int = 1, limit: int = 10
    ) -> tuple[list[dict], bool]:
        offset = (page - 1) * limit
        rows = db.execute(
            select(CourseComment, User.username)
            .join(User, User.id == CourseComment.user_id)
            .where(CourseComment.course_id == course_id)
            .order_by(CourseComment.created_at.desc())
            .offset(offset)
            .limit(limit + 1)
        ).all()

        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [
            {
                "id": c.id,
                "author": username,
                "user_id": c.user_id,
                "content": c.content,
                "created_at": c.created_at,
            }
            for c, username in rows
        ]
        return items, has_more

    def create_comment(
        self, db: Session, *, user_id: int, course_id: str, content: str
    ) -> CourseComment:
        comment = CourseComment(
            user_id=user_id, course_id=course_id, content=content.strip()
        )
        db.add(comment)
        db.commit()
        db.refresh(comment)
        return comment

    def delete_comment(
        self, db: Session, *, user_id: int, course_id: str, comment_id: int
    ) -> None:
        comment = db.get(CourseComment, comment_id)
        if not comment or comment.course_id != course_id:
            raise NotFound("Comment not found")
        if comment.user_id != user_id:
            raise Forbidden("Cannot delete another user's comment")
        db.delete(comment)
        db.commit()

    # ── Course Completion ────────────────────────────────────────────────
    def mark_course_completed(
        self, db: Session, *, user_id: int, course_id: str
    ) -> None:
        """Mark a course as completed and log the activity. Idempotent — doesn't error if already completed."""
        # Check if already completed
        existing = db.execute(
            select(ActivityLog)
            .where(ActivityLog.user_id == user_id)
            .where(ActivityLog.action == "course_completed")
            .where(ActivityLog.meta["course_id"].astext == course_id)
        ).scalar_one_or_none()
        
        if not existing:
            # Create activity log entry
            log_entry = ActivityLog(
                user_id=user_id,
                action="course_completed",
                meta={"course_id": course_id},
            )
            db.add(log_entry)
            db.commit()


course_service = CourseService()
