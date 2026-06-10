"""
WebSocket endpoint for real-time chat updates.

Auth: clients pass a one-shot ticket as a query parameter:
    wss://api.marevlo.com/chat/ws?ticket=<ws_ticket>

The ticket is obtained from POST /auth/ws-ticket using a normal Authorization
header; it lives 60 seconds, is atomically consumed on use, and never appears
in browser history or proxy logs the way the long-lived access token would.

For local-development convenience we ALSO accept `?token=<access_token>` —
this path is disabled in production (ENV=prod) to prevent accidental misuse.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.auth.services.ws_ticket import ws_ticket_service
from app.chat.services.connection_manager import connection_manager
from app.core.config import get_settings
from app.core.dependencies import get_db
from app.core.security import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat_ws"])


def _resolve_user(
    *,
    ticket: Optional[str],
    token: Optional[str],
    db: Session,
) -> User:
    settings = get_settings()

    # Preferred: one-shot ticket (works in prod and dev)
    if ticket:
        user_id = ws_ticket_service.consume(ticket)
        if user_id is None:
            raise ValueError("Invalid or expired WebSocket ticket")
        user = db.get(User, user_id)
        if not user or not user.is_usable():
            raise ValueError("User not found or inactive")
        return user

    # Fallback: raw access token — DEV ONLY (never in prod).
    if token and not settings.is_prod:
        payload = decode_token(token, expected_type="access")
        try:
            user_id = int(payload["sub"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Token missing required claims") from exc
        user = db.get(User, user_id)
        if not user or not user.is_usable():
            raise ValueError("User not found or inactive")
        return user

    raise ValueError("Missing ticket")


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    ticket: Optional[str] = Query(default=None),
    token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    try:
        user = _resolve_user(ticket=ticket, token=token, db=db)
    except Exception as exc:
        # Must accept before close() can carry a reason code.
        await websocket.accept()
        await websocket.close(code=1008, reason=str(exc))
        return

    await connection_manager.connect(websocket, user.id)
    try:
        while True:
            # We don't currently process inbound client messages; the listen
            # call keeps the connection alive and surfaces disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("ws_error user_id=%d err=%s", user.id, exc)
    finally:
        now = datetime.now(timezone.utc)
        try:
            user.last_seen_at = now
            db.commit()
        except Exception:
            db.rollback()
        await connection_manager.disconnect(websocket, user.id, last_seen_at=now.isoformat())
