"""
Refresh-token storage in Redis.

Key layout:
    refresh:{user_id}:{jti}  ->  "1"   (TTL = REFRESH_TOKEN_EXPIRE_DAYS)

This layout (user_id in the key) lets us revoke ALL of a user's refresh
tokens in a single SCAN — critical for password-reset and "log out everywhere"
flows. The previous implementation used `refresh:{jti}`, which made bulk
revocation impossible without keeping a side index.

We treat Redis as best-effort: if the storage call fails, the token is still
cryptographically valid and will be accepted on refresh. The TTL on the JWT
itself (30 days) bounds the worst case. For stronger guarantees, set
REDIS_REQUIRED=True in settings.
"""
from __future__ import annotations

import logging

from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailable
from app.core.redis_client import redis_manager

logger = logging.getLogger(__name__)


def _key(user_id: int, jti: str) -> str:
    return f"refresh:{user_id}:{jti}"


def _user_pattern(user_id: int) -> str:
    return f"refresh:{user_id}:*"


class RefreshTokenStore:
    """Encapsulates refresh-token persistence and revocation."""

    def store(self, *, user_id: int, jti: str) -> None:
        ttl = get_settings().REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
        try:
            redis_manager.sync.setex(_key(user_id, jti), ttl, "1")
        except RedisError as exc:
            logger.warning("refresh_store_failed user_id=%s err=%s", user_id, exc)
            if get_settings().REDIS_REQUIRED:
                raise ServiceUnavailable("Auth cache unavailable") from exc

    def is_valid(self, *, user_id: int, jti: str) -> bool:
        try:
            return redis_manager.sync.exists(_key(user_id, jti)) > 0
        except RedisError as exc:
            logger.warning("refresh_check_failed user_id=%s err=%s", user_id, exc)
            if get_settings().REDIS_REQUIRED:
                raise ServiceUnavailable("Auth cache unavailable") from exc
            # Fail closed: when Redis is the only revocation mechanism,
            # treat unreachable as "invalid" rather than blindly accepting.
            return False

    def revoke(self, *, user_id: int, jti: str) -> None:
        try:
            redis_manager.sync.delete(_key(user_id, jti))
        except RedisError as exc:
            logger.warning("refresh_revoke_failed user_id=%s err=%s", user_id, exc)

    def revoke_all_for_user(self, *, user_id: int) -> int:
        """Revoke every refresh token belonging to this user.

        Returns the number of tokens revoked.
        """
        count = 0
        try:
            client = redis_manager.sync
            for key in client.scan_iter(match=_user_pattern(user_id), count=200):
                client.delete(key)
                count += 1
        except RedisError as exc:
            logger.warning("refresh_revoke_all_failed user_id=%s err=%s", user_id, exc)
        return count


refresh_token_store = RefreshTokenStore()
