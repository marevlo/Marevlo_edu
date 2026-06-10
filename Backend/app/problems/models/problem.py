"""Problem and test case models."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    time_limit_s: Mapped[Optional[float]] = mapped_column(Float, default=2.0, nullable=True)
    memory_limit_mb: Mapped[Optional[int]] = mapped_column(Integer, default=256, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    testcases = relationship(
        "ProblemTestCase",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        Index("idx_problems_difficulty", "difficulty"),
        Index("idx_problems_created_at", "created_at"),
        Index("idx_problems_slug", "slug"),
    )


class ProblemTestCase(Base):
    __tablename__ = "problem_testcases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    problem_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("problems.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    input: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
