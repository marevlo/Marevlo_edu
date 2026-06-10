"""
Sync and async Redis clients.

We use sync Redis for refresh-token storage (called from sync routes) and
async Redis for WebSocket pubsub. Both share the same URL.

Both clients are lazy — they don't connect at import time, so tests with
no Redis available can still import the module.
"""
from __future__ import annotations

import logging
from typing import Optional

import redis as redis_sync
import redis.asyncio as redis_async

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class RedisManager:
    def __init__(self) -> None:
        self._sync: Optional[redis_sync.Redis] = None
        self._async: Optional[redis_async.Redis] = None

    @property
    def sync(self) -> redis_sync.Redis:
        if self._sync is None:
            url = get_settings().REDIS_URL
            self._sync = redis_sync.Redis.from_url(
                url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2
            )
        return self._sync

    @property
    def async_(self) -> redis_async.Redis:
        if self._async is None:
            url = get_settings().REDIS_URL
            self._async = redis_async.from_url(url, decode_responses=True)
        return self._async

    async def close(self) -> None:
        if self._async is not None:
            await self._async.aclose()
        if self._sync is not None:
            self._sync.close()


redis_manager = RedisManager()
