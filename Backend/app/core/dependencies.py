"""
FastAPI dependency providers.

`get_db` — request-scoped SQLAlchemy session.
`get_current_user` — required authenticated user. Raises 401 otherwise.
`get_optional_user` — None if no auth or invalid auth, else a User.
"""
from __future__ import annotations

from typing import Optional

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core import database as _db_module
from app.core.exceptions import AccountInactive, TokenError
from app.core.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)
_optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_db() -> Session:
    # Resolve SessionLocal at call time (not import time) so that tests can
    # monkeypatch app.core.database.SessionLocal and have it take effect.
    db = _db_module.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token, expected_type="access")
    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise TokenError("Token is missing required claims") from exc

    user = db.get(User, user_id)
    if not user or not user.is_usable():
        raise AccountInactive()

    # Stash the session id for downstream services that want to attribute
    # actions to a specific login (e.g. chat messages).
    sid = payload.get("sid")
    if sid is not None:
        try:
            user.session_id = int(sid)  # type: ignore[attr-defined]
        except (TypeError, ValueError):
            pass
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Same as `get_current_user` but rejects non-admins with 403.

    Use this on every admin endpoint:
        @router.get("/admin/reports")
        def list_reports(admin: User = Depends(require_admin), ...):
    """
    from app.core.exceptions import Forbidden

    is_admin = getattr(user, "is_admin", False) or getattr(user, "role", "student") == "admin"
    if not is_admin:
        raise Forbidden("Admin privileges required")
    return user


def get_optional_user(
    request: Request,
    token: Optional[str] = Depends(_optional_oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    try:
        payload = decode_token(token, expected_type="access")
        user_id = int(payload["sub"])
    except Exception:
        return None
    user = db.get(User, user_id)
    if not user or not user.is_usable():
        return None
    return user
