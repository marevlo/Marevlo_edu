"""Feed HTTP endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.core.idempotency import IdempotencyContext, idempotency
from app.feed.schemas.post import (
    CommentCreate,
    PostCreate,
    PostImageUploadUrlIn,
    PostImageUploadUrlOut,
    PostListOut,
    PostOut,
)
from app.feed.services.feed_service import feed_service

router = APIRouter(prefix="/feed", tags=["feed"])


@router.get("/posts", response_model=PostListOut)
def list_feed(
    sort: str = Query("latest", pattern="^(latest|top)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    posts, total, liked_set = feed_service.list_posts(
        db, current_user_id=user.id, sort=sort, page=page, limit=limit
    )
    url_cache: dict[str, str | None] = {}
    items = [
        feed_service.to_out(
            p,
            liked_by_me=p.id in liked_set,
            url_cache=url_cache,
        )
        for p in posts
    ]
    return PostListOut(
        posts=items,
        pagination={
            "page": page,
            "limit": limit,
            "total_count": total,
            "total_pages": (total + limit - 1) // limit if limit else 0,
        },
    )


@router.post("/posts", response_model=PostOut)
def create_post(
    body: PostCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    idem: IdempotencyContext = Depends(idempotency),
):
    cached = idem.replay()
    if cached is not None:
        return cached

    post = feed_service.create_post(
        db,
        author_id=user.id,
        content=body.content,
        type=body.type,
        title=body.title,
        image=body.image,
        image_object_keys=body.image_object_keys,
        event_date=body.event_date,
        event_location=body.event_location,
    )
    full = feed_service.get_post(db, post.id)
    out = feed_service.to_out(full, liked_by_me=False)
    idem.store(out)
    return out


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    post = feed_service.get_post(db, post_id)
    liked = feed_service.is_liked_by(db, post_id=post.id, user_id=user.id)
    return feed_service.to_out(post, liked_by_me=liked)


@router.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    feed_service.delete_post(db, post_id=post_id, user_id=user.id)
    return {"message": "Post deleted"}


@router.post("/posts/{post_id}/like")
def toggle_like(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return feed_service.toggle_like(db, post_id=post_id, user_id=user.id)


@router.post("/posts/{post_id}/comments")
def add_comment(
    post_id: int,
    body: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    idem: IdempotencyContext = Depends(idempotency),
):
    cached = idem.replay()
    if cached is not None:
        return cached
    out = feed_service.add_comment(
        db,
        post_id=post_id,
        user_id=user.id,
        content=body.content,
        author_username=user.username,
    )
    idem.store(out)
    return out


@router.post("/posts/upload-url", response_model=PostImageUploadUrlOut)
def request_image_upload(
    body: PostImageUploadUrlIn,
    user: User = Depends(get_current_user),
):
    return feed_service.request_image_upload(
        user_id=user.id, content_type=body.content_type, size=body.size
    )
