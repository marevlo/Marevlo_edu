"""
MIRA models — the tutoring engine's own tables, all keyed by Marevlo's
integer ``users.id``. MIRA never creates its own users or payments; identity
comes from Marevlo auth and paid access from Marevlo entitlements.

Tables:
  - mira_user_state       : per-user cognitive state (belief map, memory, style)
  - mira_usage_events     : durable per-turn audit (quota/cost/support)
  - mira_credit_ledger    : build-credit ledger (Postgres source of truth)
  - mira_allotment_usage  : entitlement-period build-allotment counter
  - mira_learning_events  : mastery evidence (quiz correct/wrong, hints, etc.)

Cross-dialect: portable column types + JSONBType so the same DDL runs on
Postgres (prod) and SQLite (tests), matching the rest of the Marevlo backend.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.sqltypes import JSONBType


class MiraUserState(Base):
    """Per-user cognitive state. One row per Marevlo user. The heavy state
    (belief map, memory, last turn) lives in a JSON blob the engine owns; the
    columns are just for indexing/inspection."""
    __tablename__ = "mira_user_state"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    state: Mapped[dict] = mapped_column(JSONBType, nullable=False, default=dict)
    preferred_style: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    turns: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MiraUsageEvent(Base):
    """Durable per-turn usage record — quota disputes, analytics, cost control."""
    __tablename__ = "mira_usage_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    lesson_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    concept: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    intent: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    answer_format: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    served_from: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    estimated_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    actual_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    charged_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    build_credit_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_inr: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_mira_usage_user", "user_id", "created_at"),
        Index("idx_mira_usage_request", "request_id"),
        Index("idx_mira_usage_course", "course_id"),
    )


class MiraCreditLedger(Base):
    """Build-credit ledger. Balance = SUM(delta). Append-only. Paid credits are
    money, so Postgres is the source of truth (Redis is only a cache).

    A purchase carries the entitlement/payment ref so a replayed grant cannot
    double-credit (enforced by the unique partial index where reason='purchase').
    """
    __tablename__ = "mira_credit_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    ref: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)  # payment/entitlement id
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)  # purchase|charge|refund|monthly_allotment|admin_grant
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_mira_credit_user", "user_id", "created_at"),
        UniqueConstraint("ref", "reason", name="uq_mira_credit_ref_reason"),
        CheckConstraint(
            "reason IN ('purchase','charge','refund','monthly_allotment','admin_grant')",
            name="ck_mira_credit_reason",
        ),
    )


class MiraAllotmentUsage(Base):
    """Entitlement-period build-allotment usage. Keyed by an entitlement anchor
    (not the calendar) so buying near a boundary can't grant a second allotment."""
    __tablename__ = "mira_allotment_usage"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    entitlement_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    used: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class MiraLearningEvent(Base):
    """Mastery evidence — what the student actually did, not just what they
    asked. Mastery is updated from these, not from question depth alone."""
    __tablename__ = "mira_learning_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    concept: Mapped[str] = mapped_column(String(128), nullable=False)
    course_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    lesson_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # answered_correct | answered_wrong | hint_used | solution_revealed |
    # concept_revisited | prerequisite_failed | practice_completed |
    # asked_simpler | asked_advanced
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[Optional[dict]] = mapped_column(JSONBType, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_mira_learning_user_concept", "user_id", "concept"),
        Index("idx_mira_learning_user_created", "user_id", "created_at"),
    )
