"""MIRA turn logs — the training dataset for MIRA-1 and the analytics substrate.

Two tables:
  mira_turn_logs    : one row per chat turn — the full (input context, output)
                      pair plus routing/cost/parse facts. This IS the future
                      fine-tuning corpus; fields chosen so a pair can be
                      reconstructed without joining application tables.
  mira_turn_signals : append-only quality events attached to a turn
                      (checkpoint result, depth-pill taps, explain-differently,
                      thumbs, follow-up picks, repair, escalation). The nightly
                      labeler folds these into quality_label on the log row.

quality_label lifecycle: NULL (fresh) -> "taught" | "neutral" | "failed",
set by scripts/label_turns.py. Export to parquet via
scripts/export_training_data.py (hashes user ids, respects opt-out).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (DateTime, Float, Index, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.sqltypes import JSONBType

# closed vocabulary so the labeler and analytics never meet free-text drift
SIGNAL_KINDS = ("checkpoint_pass", "checkpoint_fail", "repair_taken",
                "depth_intuition", "depth_mechanism", "depth_math",
                "explain_differently", "thumbs_up", "thumbs_down",
                "follow_up_pick", "escalated", "step_revisit")


class MiraTurnLog(Base):
    __tablename__ = "mira_turn_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    turn_id: Mapped[str] = mapped_column(String(64), nullable=False)  # = request_id
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False,
                                                 default=datetime.utcnow)
    # ── the input side of the pair ───────────────────────────────────────
    question: Mapped[str] = mapped_column(Text, nullable=False)
    history: Mapped[list] = mapped_column(JSONBType, nullable=False, default=list)
    page_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    doc_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    course_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lesson_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    level: Mapped[str | None] = mapped_column(String(24), nullable=True)
    style: Mapped[str | None] = mapped_column(String(24), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(32), nullable=False,
                                                default="v2")
    # ── routing / outcome facts ──────────────────────────────────────────
    intent: Mapped[str | None] = mapped_column(String(24), nullable=True)
    concept: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lane: Mapped[str | None] = mapped_column(String(24), nullable=True)
    served_from: Mapped[str | None] = mapped_column(String(24), nullable=True)
    parse_ok: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    in_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    out_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cost_inr: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # ── the output side of the pair ──────────────────────────────────────
    blocks: Mapped[list] = mapped_column(JSONBType, nullable=False, default=list)
    # ── labeling ─────────────────────────────────────────────────────────
    quality_label: Mapped[str | None] = mapped_column(String(16), nullable=True)
    labeled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("turn_id", name="uq_mira_turn_logs_turn"),
        Index("ix_mira_turn_logs_user_time", "user_id", "created_at"),
        Index("ix_mira_turn_logs_label", "quality_label"),
    )


class MiraTurnSignal(Base):
    __tablename__ = "mira_turn_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    turn_id: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    detail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False,
                                                 default=datetime.utcnow)

    __table_args__ = (
        Index("ix_mira_turn_signals_turn", "turn_id"),
        Index("ix_mira_turn_signals_kind_time", "kind", "created_at"),
    )
