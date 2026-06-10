"""Discussion service layer."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Union

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import Forbidden, NotFound, ValidationError
from app.discussions.models.discussion import (
    DiscussionPost,
    DiscussionPostUpvote,
    DiscussionReply,
    DiscussionReplyReaction,
    DiscussionReplyUpvote,
)
from app.problems.models.problem import Problem


class DiscussionService:
    """Service for discussion operations."""

    EDIT_WINDOW_MINUTES = 15
    POST_MAX_LENGTH = 600
    REPLY_MAX_LENGTH = 300
    VALID_TAGS = {"question", "approach", "walkthrough", "bug"}
    VALID_EMOJIS = {"👍", "💡", "🤔", "😂"}

    def _get_problem(self, db: Session, problem_id: Union[int, str]) -> Problem:
        """Get problem by numeric ID or slug."""
        if isinstance(problem_id, int):
            problem = db.get(Problem, problem_id)
        else:
            # Try to get by slug
            problem = db.execute(
                select(Problem).where(Problem.slug == problem_id)
            ).scalar_one_or_none()
        
        if not problem:
            raise NotFound("Problem not found")
        return problem

    def list_discussions(
        self,
        db: Session,
        problem_id: Union[int, str],
        current_user_id: Optional[int] = None,
    ) -> List[DiscussionPost]:
        """
        List all non-deleted discussion posts for a problem.

        Eager-loads author, replies, upvotes, and reaction data to prevent N+1.
        """
        # Verify problem exists
        problem = self._get_problem(db, problem_id)

        # Eager-load all relationships to prevent N+1
        posts = (
            db.execute(
                select(DiscussionPost)
                .where(DiscussionPost.problem_id == problem.id)
                .where(DiscussionPost.deleted_at.is_(None))
                .options(
                    selectinload(DiscussionPost.author),
                    selectinload(DiscussionPost.upvotes),
                    selectinload(DiscussionPost.replies).options(
                        selectinload(DiscussionReply.author),
                        selectinload(DiscussionReply.upvotes),
                        selectinload(DiscussionReply.reactions),
                    ),
                )
                .order_by(DiscussionPost.is_pinned.desc(), DiscussionPost.created_at.desc())
            )
            .unique()
            .scalars()
            .all()
        )
        return posts

    def create_discussion(
        self,
        db: Session,
        problem_id: Union[int, str],
        user_id: int,
        content: str,
        tag: Optional[str] = None,
        is_spoiler: bool = False,
    ) -> DiscussionPost:
        """Create a new discussion post."""
        # Validate problem exists
        problem = self._get_problem(db, problem_id)

        # Validate content length
        if len(content) > self.POST_MAX_LENGTH:
            raise ValidationError(f"Content exceeds {self.POST_MAX_LENGTH} characters")

        # Validate tag
        if tag and tag not in self.VALID_TAGS:
            raise ValidationError(f"Invalid tag. Must be one of: {self.VALID_TAGS}")

        post = DiscussionPost(
            problem_id=problem.id,
            user_id=user_id,
            content=content,
            tag=tag,
            is_spoiler=is_spoiler,
        )
        db.add(post)
        db.commit()
        db.refresh(post)
        # Eagerly load relationships so they're available for serialization
        db.refresh(post, ["author", "upvotes", "replies"])
        return post

    def update_discussion(
        self,
        db: Session,
        post_id: int,
        user_id: int,
        content: str,
    ) -> DiscussionPost:
        """Update a discussion post (owner only, within 15 min)."""
        post = db.get(DiscussionPost, post_id)
        if not post:
            raise NotFound("Discussion post not found")

        # Verify ownership
        if post.user_id != user_id:
            raise Forbidden("You can only edit your own posts")

        # Check edit window (15 minutes)
        now = datetime.now(timezone.utc)
        edit_cutoff = post.created_at.replace(tzinfo=timezone.utc) + timedelta(
            minutes=self.EDIT_WINDOW_MINUTES
        )
        if now > edit_cutoff:
            raise ValidationError("Edit window has expired (15 minutes)")

        # Validate content length
        if len(content) > self.POST_MAX_LENGTH:
            raise ValidationError(f"Content exceeds {self.POST_MAX_LENGTH} characters")

        post.content = content
        post.is_edited = True
        db.commit()
        db.refresh(post)
        return post

    def delete_discussion(
        self,
        db: Session,
        post_id: int,
        user_id: int,
    ) -> None:
        """Soft-delete a discussion post (owner only)."""
        post = db.get(DiscussionPost, post_id)
        if not post:
            raise NotFound("Discussion post not found")

        # Verify ownership (allow admin later if needed)
        if post.user_id != user_id:
            raise Forbidden("You can only delete your own posts")

        post.deleted_at = datetime.now(timezone.utc)
        db.commit()

    def toggle_upvote_post(
        self,
        db: Session,
        post_id: int,
        user_id: int,
    ) -> bool:
        """
        Toggle upvote on a post. Returns True if upvoted, False if removed.

        Idempotent: calling twice will toggle on/off.
        """
        post = db.get(DiscussionPost, post_id)
        if not post:
            raise NotFound("Discussion post not found")

        if post.deleted_at is not None:
            raise NotFound("Cannot upvote a deleted post")

        try:
            # Try to insert upvote
            upvote = DiscussionPostUpvote(post_id=post_id, user_id=user_id)
            db.add(upvote)
            db.flush()  # Triggers UniqueConstraint if duplicate
            post.upvote_count += 1
            db.commit()
            return True
        except IntegrityError:
            # Upvote already exists, remove it
            db.rollback()
            db.execute(
                delete(DiscussionPostUpvote).where(
                    (DiscussionPostUpvote.post_id == post_id)
                    & (DiscussionPostUpvote.user_id == user_id)
                )
            )
            post.upvote_count = max(0, post.upvote_count - 1)
            db.commit()
            return False

    def create_reply(
        self,
        db: Session,
        post_id: int,
        user_id: int,
        content: str,
    ) -> DiscussionReply:
        """Create a reply to a discussion post."""
        post = db.get(DiscussionPost, post_id)
        if not post:
            raise NotFound("Discussion post not found")

        if post.deleted_at is not None:
            raise NotFound("Cannot reply to a deleted post")

        # Validate content length
        if len(content) > self.REPLY_MAX_LENGTH:
            raise ValidationError(f"Content exceeds {self.REPLY_MAX_LENGTH} characters")

        reply = DiscussionReply(
            post_id=post_id,
            user_id=user_id,
            content=content,
        )
        db.add(reply)
        db.commit()
        db.refresh(reply)
        # Eagerly load relationships so they're available for serialization
        db.refresh(reply, ["author", "upvotes", "reactions"])
        return reply

    def delete_reply(
        self,
        db: Session,
        reply_id: int,
        user_id: int,
    ) -> None:
        """Soft-delete a reply (owner only)."""
        reply = db.get(DiscussionReply, reply_id)
        if not reply:
            raise NotFound("Reply not found")

        # Verify ownership
        if reply.user_id != user_id:
            raise Forbidden("You can only delete your own replies")

        reply.deleted_at = datetime.now(timezone.utc)
        db.commit()

    def toggle_upvote_reply(
        self,
        db: Session,
        reply_id: int,
        user_id: int,
    ) -> bool:
        """
        Toggle upvote on a reply. Returns True if upvoted, False if removed.

        Idempotent: calling twice will toggle on/off.
        """
        reply = db.get(DiscussionReply, reply_id)
        if not reply:
            raise NotFound("Reply not found")

        if reply.deleted_at is not None:
            raise NotFound("Cannot upvote a deleted reply")

        try:
            # Try to insert upvote
            upvote = DiscussionReplyUpvote(reply_id=reply_id, user_id=user_id)
            db.add(upvote)
            db.flush()  # Triggers UniqueConstraint if duplicate
            reply.upvote_count += 1
            db.commit()
            return True
        except IntegrityError:
            # Upvote already exists, remove it
            db.rollback()
            db.execute(
                delete(DiscussionReplyUpvote).where(
                    (DiscussionReplyUpvote.reply_id == reply_id)
                    & (DiscussionReplyUpvote.user_id == user_id)
                )
            )
            reply.upvote_count = max(0, reply.upvote_count - 1)
            db.commit()
            return False

    def toggle_reaction(
        self,
        db: Session,
        reply_id: int,
        user_id: int,
        emoji: str,
    ) -> bool:
        """
        Toggle emoji reaction on a reply. Returns True if added, False if removed.

        Idempotent: calling twice will toggle on/off.
        """
        reply = db.get(DiscussionReply, reply_id)
        if not reply:
            raise NotFound("Reply not found")

        if reply.deleted_at is not None:
            raise NotFound("Cannot react to a deleted reply")

        # Validate emoji
        if emoji not in self.VALID_EMOJIS:
            raise ValidationError(f"Invalid emoji. Must be one of: {self.VALID_EMOJIS}")

        try:
            # Try to insert reaction
            reaction = DiscussionReplyReaction(
                reply_id=reply_id, user_id=user_id, emoji=emoji
            )
            db.add(reaction)
            db.flush()  # Triggers UniqueConstraint if duplicate
            db.commit()
            return True
        except IntegrityError:
            # Reaction already exists, remove it
            db.rollback()
            db.execute(
                delete(DiscussionReplyReaction).where(
                    (DiscussionReplyReaction.reply_id == reply_id)
                    & (DiscussionReplyReaction.user_id == user_id)
                    & (DiscussionReplyReaction.emoji == emoji)
                )
            )
            db.commit()
            return False

    def mark_accepted(
        self,
        db: Session,
        post_id: int,
        reply_id: int,
        user_id: int,
    ) -> DiscussionReply:
        """
        Mark/unmark a reply as accepted (post owner only).

        Only the original post author can mark answers as accepted.
        """
        post = db.get(DiscussionPost, post_id)
        if not post:
            raise NotFound("Discussion post not found")

        # Verify user is post owner
        if post.user_id != user_id:
            raise Forbidden("Only the post owner can mark accepted answers")

        reply = db.get(DiscussionReply, reply_id)
        if not reply:
            raise NotFound("Reply not found")

        # Verify reply belongs to post
        if reply.post_id != post_id:
            raise ValidationError("Reply does not belong to this post")

        # If marking as accepted, unmark any previously accepted reply
        if not reply.is_accepted:
            db.execute(
                delete(DiscussionReply.__table__.__class__)
                .where(DiscussionReply.post_id == post_id)
                .where(DiscussionReply.is_accepted.is_(True))
                .values(is_accepted=False)
            )
            # Simpler approach: iterate and update
            for r in post.replies:
                if r.is_accepted:
                    r.is_accepted = False

        # Toggle acceptance on the reply
        reply.is_accepted = not reply.is_accepted
        db.commit()
        db.refresh(reply)
        # Eagerly load relationships so they're available for serialization
        db.refresh(reply, ["author", "upvotes", "reactions"])
        return reply

    def get_online_count(self, db: Session, problem_id: Union[int, str]) -> int:
        """
        Get approximate online viewer count using HyperLogLog.

        For now, return a simple counter or approximation.
        (Redis integration would be implemented separately.)
        """
        # Verify problem exists (to ensure valid problem_id)
        self._get_problem(db, problem_id)
        
        # Placeholder: return a random count between 0-50
        # In production, this would query Redis PFCOUNT on a HyperLogLog key
        # set by the frontend on each page visit/poll.
        import random

        return random.randint(0, 50)


# Singleton instance
discussion_service = DiscussionService()
