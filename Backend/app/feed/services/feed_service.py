"""
Feed service.

Performance notes:
- list_posts uses selectinload for author + comments + comment authors,
  reducing the per-page DB query count from O(N) to O(1) regardless of N.
- "liked by me" is computed in a single subquery that returns the set of
  post_ids the current user has liked among those on the page — instead of
  loading every post's full like list to scan it.
- S3 GET URLs are cached in-process by S3Storage so we don't burn through
  the rate limit on a hot feed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional, Set, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth.models.user import User
from app.core.exceptions import (
    Forbidden,
    NotFound,
    StorageNotConfigured,
    ValidationError,
)
from app.core.storage import (
    MAX_POST_IMAGES,
    MAX_SIZE_POST_IMAGE,
    POST_IMAGE_CONTENT_TYPES,
    storage,
)
from app.feed.models.post import Post, PostComment, PostLike
from app.feed.schemas.post import CommentOut, PostOut, format_relative_time

logger = logging.getLogger(__name__)


class FeedService:
    DEFAULT_LIMIT = 20

    # ── Listing ─────────────────────────────────────────────────────────
    def list_posts(
        self,
        db: Session,
        *,
        current_user_id: int,
        sort: str = "latest",
        page: int = 1,
        limit: int = DEFAULT_LIMIT,
    ) -> Tuple[List[Post], int, Set[int]]:
        """Returns (posts, total, liked_post_ids).

        Excludes:
          - soft-deleted posts (deleted_at IS NOT NULL)
          - posts authored by users that the viewer has blocked, or that
            have blocked the viewer
        """
        # Local import to avoid a circular dependency at module load time.
        from app.moderation.services.moderation_service import moderation_service

        hidden_user_ids = moderation_service.hidden_user_ids_for(db, viewer_id=current_user_id)

        sort_column = (
            Post.like_count.desc() if sort == "top" else Post.created_at.desc()
        )

        base_filters = [Post.deleted_at.is_(None)]
        if hidden_user_ids:
            base_filters.append(~Post.user_id.in_(hidden_user_ids))

        query = (
            select(Post)
            .where(*base_filters)
            .order_by(sort_column, Post.id.desc())
            .options(
                selectinload(Post.author),
                selectinload(Post.comments).selectinload(PostComment.author),
            )
        )
        total_count = db.execute(
            select(func.count(Post.id)).where(*base_filters)
        ).scalar() or 0

        posts = (
            db.execute(query.offset((page - 1) * limit).limit(limit))
            .scalars()
            .unique()  # safety with selectinload chains
            .all()
        )

        liked_set: Set[int] = set()
        if posts:
            post_ids = [p.id for p in posts]
            rows = db.execute(
                select(PostLike.post_id)
                .where(PostLike.user_id == current_user_id)
                .where(PostLike.post_id.in_(post_ids))
            ).all()
            liked_set = {r[0] for r in rows}

        return posts, total_count, liked_set

    # ── Serialization ───────────────────────────────────────────────────
    def to_out(
        self,
        post: Post,
        *,
        liked_by_me: bool,
        url_cache: dict[str, Optional[str]] | None = None,
    ) -> PostOut:
        author = post.author
        is_article = post.type == "article"
        is_event = post.type == "event"

        def resolve_url_cached(object_key: Optional[str]) -> Optional[str]:
            if not object_key:
                return None
            if url_cache is None:
                return storage.resolve_url(object_key)
            if object_key not in url_cache:
                url_cache[object_key] = storage.resolve_url(object_key)
            return url_cache[object_key]

        event_details = None
        if is_event:
            event_details = {
                "title": post.title,
                "date": post.event_date.isoformat() if post.event_date else None,
                "location": post.event_location,
            }

        # Images
        images: list[str] = []
        for k in (post.image_object_keys or []):
            url = resolve_url_cached(k)
            if url:
                images.append(url)
        if not images and post.image_url:
            url = resolve_url_cached(post.image_url)
            if url:
                images.append(url)

        comments_list = [
            CommentOut(
                id=c.id,
                author=(c.author.username if c.author else "deleted_user"),
                content=c.content,
                time=format_relative_time(c.created_at),
            )
            for c in (post.comments or [])
            if c.deleted_at is None  # hide soft-deleted comments
        ]

        return PostOut(
            id=post.id,
            author=author.username if author else "deleted_user",
            avatar=(author.username[0].upper() if author and author.username else "?"),
            content=post.content,
            image=images[0] if images else None,
            images=images,
            likes=post.like_count,
            comments=post.comment_count,
            reposts=post.repost_count,
            time=format_relative_time(post.created_at),
            likedByMe=liked_by_me,
            isArticle=is_article,
            isEvent=is_event,
            title=post.title,
            eventDetails=event_details,
            commentsList=comments_list,
        )

    # ── Image upload-url (presigned PUT) ────────────────────────────────
    def request_image_upload(
        self, *, user_id: int, content_type: str, size: int
    ) -> dict:
        if not storage.is_configured():
            raise StorageNotConfigured()
        if content_type not in POST_IMAGE_CONTENT_TYPES:
            raise ValidationError("Image must be JPEG, PNG, or WebP")
        if size <= 0 or size > MAX_SIZE_POST_IMAGE:
            raise ValidationError(f"Image must be between 1 byte and {MAX_SIZE_POST_IMAGE} bytes")

        key = storage.post_image_key(user_id, content_type)
        url = storage.presigned_put(key=key, content_type=content_type, max_size=size)
        from app.core.config import get_settings

        return {
            "upload_url": url,
            "object_key": key,
            "expires_in": get_settings().S3_PRESIGN_TTL_PUT_SECONDS,
            "max_size": MAX_SIZE_POST_IMAGE,
        }

    # ── Create / Read / Delete ──────────────────────────────────────────
    def create_post(
        self,
        db: Session,
        *,
        author_id: int,
        content: str,
        type: str,
        title: Optional[str],
        image: Optional[str],
        image_object_keys: Optional[List[str]],
        event_date: Optional[datetime],
        event_location: Optional[str],
    ) -> Post:
        from app.moderation.services.profanity import contains_profanity

        if contains_profanity(content) or (title and contains_profanity(title)):
            raise ValidationError(
                "Your post contains language that's not allowed. "
                "Please rephrase and try again."
            )
        validated_keys: list[str] | None = None
        legacy_image: str | None = None

        if image_object_keys:
            from app.core.file_validation import validate_magic_bytes

            keys = image_object_keys[:MAX_POST_IMAGES]
            for k in keys:
                if not storage.key_belongs_to_user(k, author_id):
                    raise Forbidden("Image key does not belong to this user")
                if not k.startswith(f"users/{author_id}/feed/"):
                    raise Forbidden("Image key is not in the feed prefix")
                head = storage.head_object(k)
                if head is None:
                    raise ValidationError(f"Image not found in S3: {k}")
                if head.get("ContentLength", 0) > MAX_SIZE_POST_IMAGE:
                    storage.delete_object(k)
                    raise ValidationError("Image exceeds size limit")
                declared_ct = head.get("ContentType", "")
                if declared_ct not in POST_IMAGE_CONTENT_TYPES:
                    storage.delete_object(k)
                    raise ValidationError("Image is not a supported type")
                # Magic-byte sniff. Don't trust the declared Content-Type.
                try:
                    head_bytes = storage.fetch_first_bytes(k, n=1024)
                    if not head_bytes:
                        raise ValidationError(f"Could not read image: {k}")
                    validate_magic_bytes(
                        head_bytes, declared_content_type=declared_ct
                    )
                except ValidationError:
                    storage.delete_object(k)
                    raise
            validated_keys = keys
        elif image:
            legacy_image = image

        post = Post(
            user_id=author_id,
            type=type,
            content=content,
            title=title,
            image_url=legacy_image,
            image_object_keys=validated_keys,
            event_date=event_date,
            event_location=event_location,
        )
        db.add(post)
        db.commit()
        db.refresh(post)
        return post

    def get_post(self, db: Session, post_id: int) -> Post:
        post = (
            db.execute(
                select(Post)
                .where(Post.id == post_id)
                .where(Post.deleted_at.is_(None))
                .options(
                    selectinload(Post.author),
                    selectinload(Post.comments).selectinload(PostComment.author),
                )
            )
            .scalar_one_or_none()
        )
        if not post:
            raise NotFound("Post not found")
        return post

    def is_liked_by(self, db: Session, *, post_id: int, user_id: int) -> bool:
        return (
            db.execute(
                select(PostLike.id)
                .where(PostLike.post_id == post_id)
                .where(PostLike.user_id == user_id)
                .limit(1)
            ).scalar_one_or_none()
            is not None
        )

    def delete_post(self, db: Session, *, post_id: int, user_id: int) -> None:
        post = db.get(Post, post_id)
        if not post:
            raise NotFound("Post not found")
        if post.user_id != user_id:
            raise Forbidden("Cannot delete another user's post")
        # Best-effort: delete associated S3 objects
        for k in (post.image_object_keys or []):
            if k:
                storage.delete_object(k)
        if post.image_url and storage.looks_like_object_key(post.image_url):
            storage.delete_object(post.image_url)
        db.delete(post)
        db.commit()

    # ── Likes ───────────────────────────────────────────────────────────
    def toggle_like(self, db: Session, *, post_id: int, user_id: int) -> dict:
        post = db.get(Post, post_id)
        if not post:
            raise NotFound("Post not found")

        existing = db.execute(
            select(PostLike).where(PostLike.post_id == post_id).where(PostLike.user_id == user_id)
        ).scalar_one_or_none()

        if existing:
            db.delete(existing)
            post.like_count = max(0, post.like_count - 1)
            liked = False
        else:
            db.add(PostLike(post_id=post_id, user_id=user_id))
            post.like_count = (post.like_count or 0) + 1
            liked = True

        db.commit()
        db.refresh(post)

        # Notify author on a fresh like (not on unlike). notify() filters
        # self-likes via the actor==recipient short-circuit.
        if liked:
            from app.notifications.models.notification import NOTIF_POST_LIKE
            from app.notifications.services.notification_service import notification_service
            try:
                notification_service.notify(
                    db,
                    user_id=post.user_id,
                    type=NOTIF_POST_LIKE,
                    payload={"post_id": post.id},
                    actor_user_id=user_id,
                )
            except Exception:
                # Notification is best-effort; the like itself already committed.
                logger.warning("notify_like_failed post_id=%s", post.id, exc_info=True)

        return {"id": post.id, "likes": post.like_count, "likedByMe": liked}

    # ── Comments ────────────────────────────────────────────────────────
    def add_comment(
        self, db: Session, *, post_id: int, user_id: int, content: str, author_username: str
    ) -> dict:
        from app.moderation.services.profanity import contains_profanity

        if contains_profanity(content):
            raise ValidationError(
                "Your comment contains language that's not allowed. "
                "Please rephrase and try again."
            )

        post = db.get(Post, post_id)
        if not post or post.deleted_at is not None:
            raise NotFound("Post not found")
        comment = PostComment(post_id=post_id, user_id=user_id, content=content)
        db.add(comment)
        post.comment_count = (post.comment_count or 0) + 1
        db.commit()
        db.refresh(comment)

        # Notify the post author (skipped automatically if it's a self-comment).
        from app.notifications.models.notification import NOTIF_POST_COMMENT
        from app.notifications.services.notification_service import notification_service
        try:
            notification_service.notify(
                db,
                user_id=post.user_id,
                type=NOTIF_POST_COMMENT,
                payload={
                    "post_id": post.id,
                    "comment_id": comment.id,
                    "preview": content[:140],
                },
                actor_user_id=user_id,
            )
        except Exception:
            logger.warning("notify_comment_failed post_id=%s", post.id, exc_info=True)

        return {
            "id": comment.id,
            "author": author_username,
            "content": comment.content,
            "time": "Just now",
        }


feed_service = FeedService()
