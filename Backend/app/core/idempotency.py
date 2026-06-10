"""
Idempotency keys.

Pattern: client sends `Idempotency-Key: <uuid>` on a POST it wants de-duplicated.
We hash (user_id + method + path + key) into a Redis key. If we've seen it,
return the cached response. Otherwise, run the handler and cache the result.

Concurrent identical requests are de-duplicated via `SET NX`: the first one
in claims the key with an "in-progress" sentinel, so the second one gets a
409 telling it to retry. This prevents the handler from running twice in a
race.

Scope is per-user — an attacker can't poison another user's cache because
the user ID is part of the hash.

Failure mode: Redis errors fail-open (treat as no idempotency). Idempotency
is a UX nicety, not a security control.

Usage:

    @router.post("/feed/posts")
    def create_post(
        body: PostCreate,
        idem: IdempotencyContext = Depends(idempotency),
        ...
    ):
        cached = idem.replay()
        if cached is not None:
            return cached
        result = ... # run handler
        idem.store(result)
        return result
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

from fastapi import Depends, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from app.auth.models.user import User
from app.core.dependencies import get_current_user
from app.core.exceptions import Conflict
from app.core.redis_client import redis_manager

logger = logging.getLogger(__name__)

IDEMPOTENCY_TTL_SECONDS = 10 * 60
_INPROGRESS = "__inprogress__"


def _hash(user_id: int, method: str, path: str, raw_key: str) -> str:
    payload = f"{user_id}|{method}|{path}|{raw_key}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class IdempotencyContext:
    """Per-request idempotency state. Lives on a single request only."""

    def __init__(self, *, redis_key: Optional[str], cached: Optional[dict]):
        self.redis_key = redis_key
        self._cached = cached

    @property
    def active(self) -> bool:
        return self.redis_key is not None

    def replay(self) -> Optional[JSONResponse]:
        """Return the cached response if this is a hit, else None."""
        if self._cached is None:
            return None
        return JSONResponse(
            status_code=self._cached.get("status", 200),
            content=self._cached.get("body", {}),
            headers={"Idempotent-Replay": "true"},
        )

    def store(self, value: Any, *, status: int = 200) -> None:
        """Cache the handler's response under the idempotency key."""
        if not self.active or self.redis_key is None:
            return
        try:
            body = jsonable_encoder(value)
            redis_manager.sync.set(
                self.redis_key,
                json.dumps({"status": status, "body": body}, default=str),
                ex=IDEMPOTENCY_TTL_SECONDS,
            )
        except RedisError as exc:
            logger.warning("idempotency_store_failed err=%s", exc)


def idempotency(
    request: Request,
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> IdempotencyContext:
    if not idempotency_key or not idempotency_key.strip() or len(idempotency_key) > 128:
        return IdempotencyContext(redis_key=None, cached=None)

    rk = "idem:" + _hash(user.id, request.method, request.url.path, idempotency_key.strip())

    try:
        client = redis_manager.sync
        existing = client.get(rk)
        if existing == _INPROGRESS:
            raise Conflict(
                "An identical request is already being processed. Please retry."
            )
        if existing:
            try:
                return IdempotencyContext(redis_key=rk, cached=json.loads(existing))
            except (ValueError, KeyError):
                pass

        ok = client.set(rk, _INPROGRESS, nx=True, ex=IDEMPOTENCY_TTL_SECONDS)
        if not ok:
            raise Conflict(
                "An identical request is already being processed. Please retry."
            )
    except RedisError as exc:
        logger.warning("idempotency_redis_error err=%s", exc)
        return IdempotencyContext(redis_key=None, cached=None)

    return IdempotencyContext(redis_key=rk, cached=None)
