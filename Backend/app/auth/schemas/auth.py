"""Pydantic schemas for /auth endpoints."""
from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ── Tokens ──────────────────────────────────────────────────────────────
class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Signup / login ──────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    date_of_birth: Optional[date] = None
    guardian_email: Optional[EmailStr] = None
    guardian_consent: bool = False

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if v.lower() == v or v.upper() == v or not any(c.isdigit() for c in v):
            raise ValueError("Password must include upper, lower, and digit characters")
        return v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    is_active: bool
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None


class GoogleLoginRequest(BaseModel):
    id_token: str


class WSTicketOut(BaseModel):
    """One-shot ticket for opening a WebSocket connection."""

    ticket: str
    expires_in: int


# ── Password reset ──────────────────────────────────────────────────────
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if v.lower() == v or v.upper() == v or not any(c.isdigit() for c in v):
            raise ValueError("Password must include upper, lower, and digit characters")
        return v


# ── Generic OK ─────────────────────────────────────────────────────────
class MessageOut(BaseModel):
    message: str
