"""Reels — social endpoints: follow creators, following feed, notifications."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.reels.services.reel_service import reel_service
from app.reels.services.social_service import social_service

social_router = APIRouter(prefix="/reels", tags=["reels-social"])


@social_router.post("/creators/{user_id}/follow")
def toggle_follow(user_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    return social_service.toggle_follow(db, follower_id=user.id, following_id=user_id)


@social_router.get("/following/feed")
def following_feed(page: int = Query(1, ge=1), limit: int = Query(10, ge=1, le=30),
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    reels, total = social_service.following_feed(db, user_id=user.id, page=page, limit=limit)
    liked, saved = reel_service.bulk_flags(db, [r.id for r in reels], user.id)
    return {
        "reels": [reel_service.to_out(db, r, user=user, source="following",
                                      liked=r.id in liked, saved=r.id in saved)
                  for r in reels],
        "pagination": {"page": page, "limit": limit, "total_count": total,
                       "total_pages": (total + limit - 1) // limit if limit else 0},
    }
