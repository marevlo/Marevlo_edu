"""Pydantic schemas for /profile endpoints."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    name: Optional[str] = None
    headline: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    college: Optional[str] = None
    college_year: Optional[str] = None
    company: Optional[str] = None
    dob: Optional[date] = None
    level: Optional[str] = None
    interests: Optional[str] = None
    skills: Optional[Any] = None
    xp: int = 0
    avatar_url: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    resume_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    headline: Optional[str] = Field(None, max_length=150)
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=100)
    college: Optional[str] = Field(None, max_length=150)
    college_year: Optional[str] = Field(None, max_length=30)
    company: Optional[str] = Field(None, max_length=150)
    dob: Optional[date] = None
    github_url: Optional[str] = Field(None, max_length=255)
    linkedin_url: Optional[str] = Field(None, max_length=255)
    skills: Optional[Any] = None


class StatsOut(BaseModel):
    xp: int = 0
    level: int = 1
    streak: int = 0
    rank: Optional[int] = None
    courses_completed: int = 0
    problems_solved: int = 0
    easy_solved: int = 0
    medium_solved: int = 0
    hard_solved: int = 0


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    badge_key: str
    label: str
    description: str
    icon: str
    color: str
    earned_at: Optional[datetime] = None


class ActivityPoint(BaseModel):
    date: str
    count: int


# ── Avatar (presigned PUT) ───────────────────────────────────────────────
class AvatarUploadUrlIn(BaseModel):
    content_type: str
    size: int = Field(..., gt=0)


class AvatarUploadUrlOut(BaseModel):
    upload_url: str
    object_key: str
    expires_in: int
    max_size: int


class AvatarConfirmIn(BaseModel):
    object_key: str
