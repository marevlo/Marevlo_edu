"""Chat schemas (DM, follow, messages)."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted_by_me: bool = False


class ReactionCreate(BaseModel):
    emoji: str = Field(..., min_length=1, max_length=8)


class ReplyPreview(BaseModel):
    id: int
    sender_username: str
    content: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    sender_username: str
    content: str
    is_edited: bool
    is_deleted: bool = False
    deleted_for_everyone: bool = False
    reply_to_id: Optional[int] = None
    reply_to: Optional[ReplyPreview] = None
    reactions: List[ReactionSummary] = []
    created_at: str
    time_ago: str
    session_id: Optional[int] = None
    log_id: Optional[int] = None
    is_read: bool = False


class _MessageContent(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)

    @field_validator("content")
    @classmethod
    def strip_content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("cannot be blank")
        return v


class MessageEdit(_MessageContent):
    pass


class ChatOut(BaseModel):
    id: int
    user_1_id: int
    user_2_id: int
    user_1_username: str
    user_2_username: str
    is_active: bool
    last_message_preview: Optional[str] = None
    last_message_at: Optional[str] = None
    unread_count: int = 0
    other_user_online: bool = False
    other_user_last_seen_at: Optional[str] = None
    created_at: str


class ChatDetailOut(BaseModel):
    id: int
    user_1_id: int
    user_2_id: int
    user_1_username: str
    user_2_username: str
    is_active: bool
    messages: List[MessageOut] = []
    created_at: str


class ChatListOut(BaseModel):
    chats: List[ChatOut]
    pagination: dict


class MessageCreate(_MessageContent):
    reply_to_id: Optional[int] = None


class FollowOut(BaseModel):
    id: int
    follower_id: int
    following_id: int
    follower_username: str
    following_username: str
    created_at: str


class UserSearchOut(BaseModel):
    id: int
    username: str
