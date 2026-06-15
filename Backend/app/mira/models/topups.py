"""Question top-ups ("+250 questions" SKU) — durable, window-scoped, replay-safe.

A row adds `tokens` to the buyer's CURRENT quota window (window_key =
MiraAccess.entitlement_key() at purchase time). resolve_access() sums active-
window rows into token_limit, so the atomic Redis gate enforces the raised
limit with no Lua changes. Unique ref = PayU retries can't double-grant.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MiraQuestionTopup(Base):
    __tablename__ = "mira_question_topups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    window_key: Mapped[str] = mapped_column(String(128), nullable=False)
    questions: Mapped[int] = mapped_column(Integer, nullable=False)
    tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    ref: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False,
                                                 default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("ref", name="uq_mira_qtopup_ref"),
        Index("ix_mira_qtopup_user_window", "user_id", "window_key"),
    )
