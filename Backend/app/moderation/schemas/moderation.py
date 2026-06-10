"""Moderation Pydantic schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.moderation.models.moderation import REPORT_REASONS

ReportReason = Literal[
    "spam",
    "abusive",
    "harassment",
    "hate_speech",
    "sexual",
    "violence",
    "self_harm",
    "misinformation",
    "other",
]


class ReportCreate(BaseModel):
    reason: ReportReason
    note: Optional[str] = Field(None, max_length=1000)


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    target_id: int  # post_id or comment_id depending on the source
    target_type: Literal["post", "comment"]
    reporter_id: int
    reporter_username: Optional[str] = None
    reason: str
    note: Optional[str] = None
    status: str
    resolved_at: Optional[datetime] = None
    created_at: datetime


class ReportListOut(BaseModel):
    reports: List[ReportOut]
    pagination: dict


class ResolveReportRequest(BaseModel):
    """Admin action when reviewing a report."""

    action: Literal["resolve_delete", "resolve_keep", "dismiss"]
    note: Optional[str] = Field(None, max_length=1000)


# ── Blocks ──────────────────────────────────────────────────────────────
class BlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    blocker_id: int
    target_id: int
    target_username: Optional[str] = None
    created_at: datetime


class BlockListOut(BaseModel):
    blocks: List[BlockOut]


# ── Generic ─────────────────────────────────────────────────────────────
class MessageOut(BaseModel):
    message: str
