"""Course-related schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ReactRequest(BaseModel):
    type: Literal["like", "dislike"]


class ReactionsOut(BaseModel):
    likes: int
    dislikes: int
    reaction: Optional[Literal["like", "dislike"]] = None
    my_reaction: Optional[Literal["like", "dislike"]] = None


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: str
    user_id: int
    content: str
    created_at: datetime


class CommentsPage(BaseModel):
    comments: List[CommentOut]
    has_more: bool
