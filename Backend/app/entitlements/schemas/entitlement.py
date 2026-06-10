"""Pydantic v2 schemas for entitlement endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class EntitlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product: str
    status: str
    source: str
    expires_at: Optional[datetime] = None
    starts_at: datetime


class MyAccessOut(BaseModel):
    """What the frontend reads to decide which UI to unlock."""
    dsa: bool
    courses: bool
    all_access: bool
    entitlements: list[EntitlementOut]


class GrantRequest(BaseModel):
    """Admin grant. Also the shape a future PayU webhook maps onto."""
    user_id: int
    product: Literal["all_access", "dsa", "courses"] = "all_access"
    source: Literal["paid", "comped", "trial", "free"] = "comped"
    # ISO datetime; omit for perpetual access.
    expires_at: Optional[datetime] = None
    reason: Optional[str] = None


class RevokeRequest(BaseModel):
    user_id: int
    product: Literal["all_access", "dsa", "courses"] = "all_access"
    reason: Optional[str] = None
