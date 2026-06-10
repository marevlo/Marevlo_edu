"""Problem submission model."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ProblemSubmission(Base):
    __tablename__ = "problem_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    problem_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("problems.id", ondelete="CASCADE"), nullable=False
    )
    language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    test_cases_passed: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_test_cases: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    execution_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    memory_used: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_submissions_user_status", "user_id", "status"),
        Index("idx_submissions_user_problem", "user_id", "problem_id"),
        Index("idx_submissions_problem_status", "problem_id", "status"),
        Index("idx_submissions_submitted_at", "submitted_at"),
    )
