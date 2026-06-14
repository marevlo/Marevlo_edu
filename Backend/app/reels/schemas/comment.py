"""Reels — comment schemas."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)
    parent_id: Optional[int] = None


class CommentOut(BaseModel):
    id: int
    reelId: int
    parentId: Optional[int]
    body: str
    author: str
    authorId: int
    likeCount: int
    isPinned: bool
    likedByMe: bool
    mine: bool
    time: str
    replies: List["CommentOut"] = []


CommentOut.model_rebuild()
