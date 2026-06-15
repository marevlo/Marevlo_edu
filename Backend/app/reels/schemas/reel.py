"""Reels schemas."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class AnchorIn(BaseModel):
    anchor_type: str = Field(..., pattern="^(problem|topic|concept|course|module)$")
    anchor_id: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=140)
    source: str = Field("creator", pattern="^(creator|auto|moderator)$")
    confidence: Optional[float] = Field(None, ge=0, le=1)


class ReelUploadUrlIn(BaseModel):
    video_content_type: str = Field(..., pattern="^(video/mp4|video/webm)$")
    video_size: int = Field(..., gt=0)
    thumbnail_content_type: Optional[str] = Field(None, pattern="^(image/jpeg|image/png|image/webp)$")
    thumbnail_size: Optional[int] = Field(None, gt=0)


class ReelCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=140)
    description: Optional[str] = Field(None, max_length=2000)
    reel_type: str = Field("concept_explainer")
    difficulty: Optional[str] = Field(None, pattern="^(Easy|Medium|Hard)$")
    language: str = Field("English", max_length=30)
    video_object_key: str
    thumbnail_object_key: Optional[str] = None
    duration_seconds: int = Field(..., ge=1)
    anchors: List[AnchorIn] = Field(..., min_length=1)
    declared_rights: bool
    transcript_text: Optional[str] = Field(None, max_length=20000)


class ViewIn(BaseModel):
    watched_seconds: int = Field(0, ge=0)
    completion_percent: int = Field(0, ge=0, le=100)
    source: str = Field("floater", max_length=30)


class CtaClickIn(BaseModel):
    source: str = Field("floater", max_length=30)


class ReportIn(BaseModel):
    reason: str = Field(..., pattern="^(copyright|spam|wrong_explanation|offensive|personal_info|low_quality|other)$")
    description: Optional[str] = Field(None, max_length=2000)


class ModerationActionIn(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|hide|restore|takedown)$")
    reason: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)


class AnchorsUpdateIn(BaseModel):
    anchors: List[AnchorIn] = Field(..., min_length=1)


class ReportResolveIn(BaseModel):
    outcome: str = Field(..., pattern="^(dismiss|takedown|restore_and_dismiss)$")
