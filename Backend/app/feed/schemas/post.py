"""Feed-related schemas."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


def format_relative_time(dt: Optional[datetime]) -> str:
    if dt is None:
        return "Unknown"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    diff = (datetime.now(timezone.utc) - dt).total_seconds()
    if diff < 60:
        return "Just now"
    if diff < 3600:
        return f"{int(diff // 60)}m ago"
    if diff < 86400:
        return f"{int(diff // 3600)}h ago"
    if diff < 604800:
        return f"{int(diff // 86400)}d ago"
    return dt.strftime("%b %d, %Y")


class CommentOut(BaseModel):
    id: int
    author: str
    content: str
    time: str


class PostOut(BaseModel):
    id: int
    author: str
    avatar: str
    role: str = "Developer"
    content: str
    image: Optional[str] = None
    images: List[str] = []

    likes: int
    comments: int
    reposts: int

    time: str
    likedByMe: bool

    isArticle: bool = False
    isEvent: bool = False
    title: Optional[str] = None
    eventDetails: Optional[dict] = None

    commentsList: List[CommentOut] = []


class PostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)
    type: str = Field("post", pattern="^(post|article|event|repost)$")
    title: Optional[str] = Field(None, max_length=255)
    image: Optional[str] = None  # legacy single-image full URL
    image_object_keys: Optional[List[str]] = None
    event_date: Optional[datetime] = None
    event_location: Optional[str] = Field(None, max_length=255)


class PostListOut(BaseModel):
    posts: List[PostOut]
    pagination: dict


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class PostImageUploadUrlIn(BaseModel):
    content_type: str
    size: int = Field(..., gt=0)


class PostImageUploadUrlOut(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int
    max_size: int
