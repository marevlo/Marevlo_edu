"""
Audit logger.

Writes SecurityEvent rows. Designed to be fail-safe: a failed audit insert
never breaks the parent operation. We catch the exception, log it to the
application logger (which goes to CloudWatch in prod), and move on.

This is a deliberate design choice: an audit log that fails closed (rejecting
logins because the audit DB is full) is worse than one that fails open and
relies on duplicate logging via CloudWatch.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.common.security_event import SecurityEvent

logger = logging.getLogger(__name__)


class AuditLogger:
    """Records security-relevant events to the security_events table."""

    def log(
        self,
        db: Session,
        *,
        event_type: str,
        user_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        meta: Optional[dict] = None,
        commit: bool = True,
    ) -> None:
        """Write an event row.

        Args:
            db: An open SQLAlchemy session.
            event_type: One of the EVT_* constants in security_event.py
                (or any short string).
            user_id: The actor. None for unauthenticated events (failed login
                with unknown email, etc).
            ip_address: Real client IP (post-XFF resolution).
            user_agent: Client UA string, truncated to 255 chars.
            meta: Free-form structured detail. Keep small.
            commit: When True, commit immediately. Set False if the caller
                already has a transaction in progress and will commit later.
        """
        try:
            evt = SecurityEvent(
                user_id=user_id,
                event_type=event_type,
                ip_address=(ip_address[:64] if ip_address else None),
                user_agent=(user_agent[:255] if user_agent else None),
                meta=meta,
            )
            db.add(evt)
            if commit:
                db.commit()
        except Exception as exc:
            # Never let audit failure poison the parent op.
            logger.warning(
                "audit_log_failed event_type=%s user_id=%s err=%s",
                event_type, user_id, exc,
            )
            # Roll back this nested attempt; let the parent do whatever it wants.
            try:
                db.rollback()
            except Exception:
                pass


audit_logger = AuditLogger()
