"""
WebSocket ticket flow.

Browsers can't set custom Authorization headers on the WebSocket handshake,
which forces auth via query string. Sending the long-lived access token in the
URL is risky because URLs can leak (browser history, server logs, referrer).

Solution: short-lived one-shot tickets.

  1. Client (already authenticated) calls  POST /auth/ws-ticket
  2. Server generates a random ticket, stores `ws_ticket:{ticket}` -> user_id
     in Redis with a 60-second TTL, and returns the ticket.
  3. Client opens  wss://api/chat/ws?ticket=<ticket>
  4. Server pops the key (GETDEL) — atomically reading user_id and deleting
     the ticket so it can't be replayed.

Properties:
  - Ticket leaks have a 60-second blast radius.
  - Replays are impossible (GETDEL).
  - The long-lived access token never appears in a URL.
"""
from __future__ import annotations

import logging
import secrets
from typing import Optional

from redis.exceptions import RedisError

from app.core.exceptions import TokenError
from app.core.redis_client import redis_manager

logger = logging.getLogger(__name__)

TICKET_TTL_SECONDS = 60


def _key(ticket: str) -> str:
    return f"ws_ticket:{ticket}"


class WSTicketService:
    def issue(self, *, user_id: int) -> str:
        ticket = secrets.token_urlsafe(32)  # ~256 bits of entropy
        try:
            redis_manager.sync.setex(_key(ticket), TICKET_TTL_SECONDS, str(user_id))
        except RedisError as exc:
            logger.warning("ws_ticket_issue_failed user_id=%s err=%s", user_id, exc)
            raise TokenError("Could not issue WebSocket ticket") from exc
        return ticket

    def consume(self, ticket: str) -> Optional[int]:
        """Atomically read and delete the ticket. Returns user_id or None."""
        if not ticket:
            return None
        try:
            # GETDEL is atomic — concurrent consumers never both succeed.
            value = redis_manager.sync.getdel(_key(ticket))
        except RedisError as exc:
            logger.warning("ws_ticket_consume_failed err=%s", exc)
            return None
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None


ws_ticket_service = WSTicketService()
