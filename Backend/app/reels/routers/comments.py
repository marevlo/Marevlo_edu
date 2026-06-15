"""Reels — comment endpoints.

  comments_public_router — optional auth: list comments (likedByMe resolves
                           when a token is present).
  comments_router        — authed: post, like, delete.
  admin pin lives on the existing reels admin router via comments_admin_router.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db, get_optional_user, require_admin
from app.reels.schemas.comment import CommentCreate
from app.reels.services.comment_service import comment_service

comments_public_router = APIRouter(prefix="/reels", tags=["reels-comments"])
comments_router = APIRouter(prefix="/reels", tags=["reels-comments"])
comments_admin_router = APIRouter(prefix="/reels/admin", tags=["reels-comments"])


@comments_public_router.get("/{reel_id}/comments")
def list_comments(reel_id: int, page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=50),
                  user: User | None = Depends(get_optional_user),
                  db: Session = Depends(get_db)):
    return comment_service.list_for_reel(db, reel_id=reel_id,
                                         viewer_id=user.id if user else None,
                                         page=page, limit=limit)


@comments_router.post("/{reel_id}/comments")
def post_comment(reel_id: int, body: CommentCreate,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return comment_service.create(db, reel_id=reel_id, user_id=user.id,
                                  body=body.body, parent_id=body.parent_id)


@comments_router.post("/comments/{comment_id}/like")
def like_comment(comment_id: int, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    return comment_service.toggle_like(db, comment_id=comment_id, user_id=user.id)


@comments_router.delete("/comments/{comment_id}")
def delete_comment(comment_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    comment_service.soft_delete(db, comment_id=comment_id, user_id=user.id)
    return {"message": "Comment deleted"}


@comments_admin_router.post("/{reel_id}/comments/{comment_id}/pin")
def pin_comment(reel_id: int, comment_id: int, pinned: bool = Query(True),
                admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return comment_service.pin(db, reel_id=reel_id, comment_id=comment_id, pinned=pinned)
