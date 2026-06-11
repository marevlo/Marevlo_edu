"""Notification API schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    actor_user_id: Optional[int] = None
    actor_username: Optional[str] = None
    payload: Optional[dict] = None
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationListOut(BaseModel):
    notifications: List[NotificationOut]
    unread_count: int
    pagination: dict


class UnreadCountOut(BaseModel):
    unread_count: int


class MessageOut(BaseModel):
    message: str
    affected: int = 0


class NotificationPrefsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    in_app_social: bool
    in_app_announcements: bool
    email_updates: bool


class NotificationPrefsUpdate(BaseModel):
    """PUT body — any subset of the toggles; omitted fields are unchanged."""

    in_app_social: Optional[bool] = None
    in_app_announcements: Optional[bool] = None
    email_updates: Optional[bool] = None
