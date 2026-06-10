"""
WebSocket connection manager.

Each ECS task has its own ConnectionManager instance. When a message is
emitted (e.g. user A sends a DM), we publish to a Redis pub/sub channel.
Every task subscribes and forwards relevant messages to its locally-connected
sockets. This is what makes WebSockets work behind a multi-instance ALB.

Resilience:
- The Redis listener has a forever-loop with exponential backoff. If Redis
  blips, we don't silently stop relaying messages — we reconnect.
- Send failures clean up dead sockets so we don't leak file descriptors.
- A periodic ping keeps idle connections alive across ALB's idle timeout.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import WebSocket

from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.redis_client import redis_manager

logger = logging.getLogger(__name__)

PUBSUB_CHANNEL = "chat_events"
ONLINE_USERS_KEY = "ws_online_users"   # Redis set — shared across all ECS tasks
PING_INTERVAL_SECONDS = 25
RECONNECT_BACKOFF_INITIAL = 1.0
RECONNECT_BACKOFF_MAX = 30.0


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[int, List[WebSocket]] = {}
        self._listener_task: Optional[asyncio.Task] = None
        self._ping_task: Optional[asyncio.Task] = None
        self._closed = False

    # ── Lifecycle ───────────────────────────────────────────────────────
    async def startup(self) -> None:
        """Called once at app startup."""
        if self._listener_task is None:
            self._listener_task = asyncio.create_task(self._listener_loop())
        if self._ping_task is None:
            self._ping_task = asyncio.create_task(self._ping_loop())

    async def shutdown(self) -> None:
        self._closed = True
        for task in (self._listener_task, self._ping_task):
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass
        # Close all open sockets
        for sockets in list(self._connections.values()):
            for ws in list(sockets):
                try:
                    await ws.close()
                except Exception:
                    pass
        self._connections.clear()

    # ── Connection management ───────────────────────────────────────────
    async def connect(self, websocket: WebSocket, user_id: int) -> None:
        await websocket.accept()
        self._connections.setdefault(user_id, []).append(websocket)
        logger.info("ws_connected user_id=%d total=%d", user_id, len(self._connections[user_id]))
        # Register in the shared Redis set so all instances agree on online status.
        try:
            await redis_manager.async_.sadd(ONLINE_USERS_KEY, str(user_id))
        except Exception as exc:
            logger.warning("redis_online_set_add_failed user_id=%d err=%s", user_id, exc)
        await self._publish({
            "type": "status_update",
            "user_id": user_id,
            "status": "online",
            "_broadcast": True,
        })

    async def disconnect(self, websocket: WebSocket, user_id: int, last_seen_at: Optional[str] = None) -> None:
        sockets = self._connections.get(user_id)
        if not sockets:
            return
        try:
            sockets.remove(websocket)
        except ValueError:
            pass
        if not sockets:
            del self._connections[user_id]
            # Remove from shared Redis set — user is now offline on this instance
            # and has no remaining sockets anywhere (local check; cross-instance
            # stragglers will clean up when their own sockets close).
            try:
                await redis_manager.async_.srem(ONLINE_USERS_KEY, str(user_id))
            except Exception as exc:
                logger.warning("redis_online_set_rem_failed user_id=%d err=%s", user_id, exc)
            payload: dict = {
                "type": "status_update",
                "user_id": user_id,
                "status": "offline",
                "_broadcast": True,
            }
            if last_seen_at:
                payload["last_seen_at"] = last_seen_at
            await self._publish(payload)
        logger.info("ws_disconnected user_id=%d remaining=%d", user_id, len(self._connections.get(user_id, [])))

    # ── Online status ───────────────────────────────────────────────────
    def is_user_online(self, user_id: int) -> bool:
        """Return True if the user has an active WebSocket on ANY instance.

        Checks the shared Redis set first; falls back to local connections
        so the REST endpoints still work if Redis is temporarily unavailable.
        """
        try:
            return bool(redis_manager.sync.sismember(ONLINE_USERS_KEY, str(user_id)))
        except (RedisError, Exception) as exc:
            logger.warning("redis_online_check_failed user_id=%d err=%s — using local fallback", user_id, exc)
            return bool(self._connections.get(user_id))

    # ── Public sending API ──────────────────────────────────────────────
    async def send_to_user(self, user_id: int, payload: dict) -> None:
        await self._publish({**payload, "_target_user_id": user_id})

    async def broadcast(self, payload: dict) -> None:
        await self._publish({**payload, "_broadcast": True})

    # ── Internal: pub/sub plumbing ──────────────────────────────────────
    async def _publish(self, payload: dict) -> None:
        try:
            await redis_manager.async_.publish(PUBSUB_CHANNEL, json.dumps(payload, default=str))
        except Exception as exc:
            # Fall back to local-only delivery so the user at least sees
            # their own messages echo on a single instance.
            logger.warning("redis_publish_failed err=%s; delivering locally only", exc)
            await self._deliver_local(payload)

    async def _listener_loop(self) -> None:
        backoff = RECONNECT_BACKOFF_INITIAL
        while not self._closed:
            try:
                pubsub = redis_manager.async_.pubsub()
                await pubsub.subscribe(PUBSUB_CHANNEL)
                logger.info("ws_listener_subscribed channel=%s", PUBSUB_CHANNEL)
                backoff = RECONNECT_BACKOFF_INITIAL
                async for msg in pubsub.listen():
                    if self._closed:
                        break
                    if msg.get("type") != "message":
                        continue
                    try:
                        payload = json.loads(msg["data"])
                    except (ValueError, TypeError) as exc:
                        logger.warning("ws_listener_bad_payload err=%s", exc)
                        continue
                    await self._deliver_local(payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("ws_listener_error err=%s reconnecting_in=%.1fs", exc, backoff)
                try:
                    await asyncio.sleep(backoff)
                except asyncio.CancelledError:
                    raise
                backoff = min(backoff * 2, RECONNECT_BACKOFF_MAX)

    async def _ping_loop(self) -> None:
        """Keep idle WebSocket connections alive through ALB's 60s idle timeout."""
        while not self._closed:
            try:
                await asyncio.sleep(PING_INTERVAL_SECONDS)
                ping = {"type": "ping"}
                for user_id in list(self._connections.keys()):
                    await self._send_to_local_sockets(user_id, ping)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("ws_ping_error err=%s", exc)

    async def _deliver_local(self, payload: dict) -> None:
        clean = {k: v for k, v in payload.items() if not k.startswith("_")}
        target = payload.get("_target_user_id")
        if target is not None:
            try:
                await self._send_to_local_sockets(int(target), clean)
            except (TypeError, ValueError):
                pass
        elif payload.get("_broadcast"):
            for user_id in list(self._connections.keys()):
                await self._send_to_local_sockets(user_id, clean)

    async def _send_to_local_sockets(self, user_id: int, payload: dict) -> None:
        sockets = self._connections.get(user_id)
        if not sockets:
            return
        dead: list[WebSocket] = []
        for ws in list(sockets):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                sockets.remove(ws)
            except ValueError:
                pass
        if user_id in self._connections and not self._connections[user_id]:
            del self._connections[user_id]


connection_manager = ConnectionManager()
