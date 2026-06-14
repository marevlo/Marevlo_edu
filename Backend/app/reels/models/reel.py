"""Marevlo Reels — models.

Architecture (matches the approved prototype):
- A Reel is short educational video wired to the learning graph through
  ReelAnchor rows (problem / topic / concept / course / module).
- Anchors carry a denormalized `label` snapshot so rails and chips render
  without joining across apps; `anchor_id` is a string to stay decoupled
  from other modules' PK types.
- Status flow: processing -> pending -> approved | rejected; approved can
  become hidden (auto-hide on high-risk report) and back.
- Every moderation decision is a ReelModerationAction row — the audit log.
- ReelCtaEvent logs each resolved CTA + click so "watched -> attempted ->
  solved" is a real join, not an estimate.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

REEL_STATUSES = ("processing", "pending", "approved", "rejected", "hidden")
ANCHOR_TYPES = ("problem", "topic", "concept", "course", "module")
REEL_TYPES = (
    "concept_explainer",
    "problem_walkthrough",
    "common_mistake",
    "shortcut_intuition",
    "interview_style",
    "visual_intuition",
    "code_explanation",
    "revision_bite",
)


class ReelTopic(Base):
    """Reels' own topic/concept taxonomy (problems table has no topic col)."""

    __tablename__ = "reel_topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), default="topic", nullable=False)  # topic|concept
    parent_slug: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Reel(Base):
    __tablename__ = "reels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(140), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reel_type: Mapped[str] = mapped_column(String(30), default="concept_explainer", nullable=False)
    difficulty: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    language: Mapped[str] = mapped_column(String(30), default="English", nullable=False)

    video_object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    hls_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    thumbnail_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(40), nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), default="pending", server_default="pending", nullable=False
    )
    creator_declared_rights: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    like_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    save_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    avg_completion: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    author = relationship("User", foreign_keys=[user_id], lazy="select")
    anchors = relationship(
        "ReelAnchor", cascade="all, delete-orphan", lazy="selectin",
        order_by="ReelAnchor.id",
    )
    transcript = relationship(
        "ReelTranscript", cascade="all, delete-orphan", lazy="select", uselist=False
    )

    __table_args__ = (
        Index("idx_reels_status_created", "status", "deleted_at", "created_at"),
        Index("idx_reels_user", "user_id"),
        Index("idx_reels_slug", "slug"),
    )


class ReelAnchor(Base):
    __tablename__ = "reel_anchors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False
    )
    anchor_type: Mapped[str] = mapped_column(String(20), nullable=False)
    anchor_id: Mapped[str] = mapped_column(String(80), nullable=False)  # str(problem.id) | topic slug | free label slug
    label: Mapped[str] = mapped_column(String(140), nullable=False)  # render snapshot
    source: Mapped[str] = mapped_column(String(20), default="creator", nullable=False)  # creator|auto|moderator
    confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("reel_id", "anchor_type", "anchor_id", name="uq_reel_anchor"),
        Index("idx_anchor_lookup", "anchor_type", "anchor_id"),
        Index("idx_anchor_reel", "reel_id"),
    )


class ReelTranscript(Base):
    __tablename__ = "reel_transcripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    transcript_text: Mapped[str] = mapped_column(Text, nullable=False)
    vtt_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    language: Mapped[str] = mapped_column(String(30), default="English", nullable=False)
    generated_by: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)  # whisper|manual
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ReelLike(Base):
    __tablename__ = "reel_likes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("reel_id", "user_id", name="uq_reel_like"),
        Index("idx_reel_likes_reel", "reel_id"),
    )


class ReelSave(Base):
    """'Save for revision' — distinct intent from a like."""
    __tablename__ = "reel_saves"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("reel_id", "user_id", name="uq_reel_save"),
        Index("idx_reel_saves_user", "user_id"),
    )


class ReelView(Base):
    """Deduped per (reel, user) for logged-in; anonymous views only bump the counter."""
    __tablename__ = "reel_views"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("reel_id", "user_id", name="uq_reel_view"),
        Index("idx_reel_views_reel", "reel_id"),
    )


class ReelCtaEvent(Base):
    """One row per resolved-and-clicked CTA — the learning-impact join key."""
    __tablename__ = "reel_cta_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    persona: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str] = mapped_column(String(30), nullable=False)  # problem_page|topic_page|floater|public|search
    cta_action: Mapped[str] = mapped_column(String(40), nullable=False)
    cta_label: Mapped[str] = mapped_column(String(120), nullable=False)
    clicked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (Index("idx_cta_reel_user", "reel_id", "user_id"),)


class ReelModerationAction(Base):
    __tablename__ = "reel_moderation_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    reviewer_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(30), nullable=False)  # approve|reject|hide|restore|anchor_edit|enqueue|auto_hide|takedown
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (Index("idx_modact_reel", "reel_id", "created_at"),)


class ReelReport(Base):
    __tablename__ = "reel_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reel_id: Mapped[int] = mapped_column(Integer, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    reporter_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)  # copyright|spam|wrong_explanation|offensive|personal_info|low_quality|other
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)  # open|dismissed|actioned
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (Index("idx_reports_status", "status", "created_at"),)


class ReelProblemUnlock(Base):
    """One free problem unlock consumed via a reel (the metered paywall).

    Unique per (user, problem): re-watching reels for an unlocked problem
    never re-consumes quota.
    """
    __tablename__ = "reel_problem_unlocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    problem_id: Mapped[int] = mapped_column(Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False)
    reel_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("reels.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "problem_id", name="uq_reel_problem_unlock"),
        Index("idx_unlocks_user", "user_id", "created_at"),
    )
