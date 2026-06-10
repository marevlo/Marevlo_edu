"""
Rate limiting via slowapi (in-process token bucket backed by Redis when configured).

We key on `request.state.real_ip` (set by ProxyHeadersMiddleware) so that
behind ALB, each end-user gets their own bucket — not all sharing the LB IP.
"""
from __future__ import annotations

from slowapi import Limiter
from starlette.requests import Request

from app.core.config import get_settings


def _real_ip_key(request: Request) -> str:
    """Use the post-XFF IP if our middleware set it, else fall back."""
    real_ip = getattr(request.state, "real_ip", None)
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


_settings = get_settings()


limiter = Limiter(
    key_func=_real_ip_key,
    storage_uri=_settings.REDIS_URL if _settings.REDIS_URL else None,
    enabled=_settings.RATE_LIMIT_ENABLED,
)
