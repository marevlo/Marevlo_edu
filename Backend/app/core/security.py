"""
Cryptographic primitives.

- Passwords: bcrypt with a hard 72-byte truncation guard (bcrypt's limit).
- JWT: jose, with `jti` for revocation tracking and clear access/refresh typing.
- OTP: HMAC-SHA256 with a server-side pepper. (bcrypt was overkill for 6-digit
  codes that live 10 minutes; HMAC is fast and more than secure for this use.)
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.exceptions import TokenError

# ── Password hashing ─────────────────────────────────────────────────────
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

BCRYPT_MAX_BYTES = 72


def _truncate_for_bcrypt(password: str) -> bytes:
    """bcrypt silently truncates anything past 72 bytes. We pre-hash long
    passwords with SHA-256 to avoid that footgun while preserving full entropy.
    """
    raw = password.encode("utf-8")
    if len(raw) <= BCRYPT_MAX_BYTES:
        return raw
    return hashlib.sha256(raw).hexdigest().encode("utf-8")


def hash_password(password: str) -> str:
    return _pwd_context.hash(_truncate_for_bcrypt(password))


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return _pwd_context.verify(_truncate_for_bcrypt(plain), hashed)
    except Exception:
        return False


# ── JWT ─────────────────────────────────────────────────────────────────
TokenType = Literal["access", "refresh", "notebook"]


def _settings():
    return get_settings()


def _encode(payload: Dict[str, Any]) -> str:
    s = _settings()
    return jwt.encode(payload, s.JWT_SECRET, algorithm=s.JWT_ALGORITHM)


def _decode(token: str) -> Dict[str, Any]:
    s = _settings()
    try:
        return jwt.decode(token, s.JWT_SECRET, algorithms=[s.JWT_ALGORITHM])
    except JWTError as exc:
        raise TokenError(f"Invalid token: {exc}") from exc


def create_access_token(*, user_id: int, session_id: int) -> str:
    s = _settings()
    now = datetime.now(timezone.utc)
    return _encode(
        {
            "sub": str(user_id),
            "sid": str(session_id),
            "type": "access",
            "iat": now,
            "exp": now + timedelta(minutes=s.ACCESS_TOKEN_EXPIRE_MINUTES),
            "jti": uuid.uuid4().hex,
        }
    )


def create_refresh_token(*, user_id: int, session_id: int) -> tuple[str, str]:
    """Returns (token, jti). Caller stores `refresh:{user_id}:{jti}` in Redis."""
    s = _settings()
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    token = _encode(
        {
            "sub": str(user_id),
            "sid": str(session_id),
            "type": "refresh",
            "iat": now,
            "exp": now + timedelta(days=s.REFRESH_TOKEN_EXPIRE_DAYS),
            "jti": jti,
        }
    )
    return token, jti


def create_notebook_token(*, user_id: int, username: str, ttl_seconds: int = 60) -> str:
    now = datetime.now(timezone.utc)
    return _encode(
        {
            "sub": str(user_id),
            "name": username,
            "type": "notebook",
            "iat": now,
            "exp": now + timedelta(seconds=ttl_seconds),
            "jti": uuid.uuid4().hex,
        }
    )


def decode_token(token: str, *, expected_type: TokenType | None = None) -> Dict[str, Any]:
    payload = _decode(token)
    if expected_type and payload.get("type") != expected_type:
        raise TokenError(f"Expected token type '{expected_type}', got '{payload.get('type')}'")
    return payload


# ── OTP hashing (HMAC) ──────────────────────────────────────────────────
def hash_otp(code: str) -> str:
    """HMAC the OTP with the JWT secret as a pepper.

    A pepper means: even if the DB leaks, the code_hash values can't be
    brute-forced without also knowing the JWT_SECRET (held in Secrets Manager).
    """
    s = _settings()
    return hmac.new(s.JWT_SECRET.encode("utf-8"), code.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_otp(code: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(code), expected_hash)


def generate_otp() -> str:
    """Cryptographically random 6-digit code."""
    return f"{secrets.randbelow(1_000_000):06d}"
