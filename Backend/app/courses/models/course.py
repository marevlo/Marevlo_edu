"""Course engagement models — reactions and comments."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseReaction(Base):
    """YouTube-style like/dislike — composite PK = (user_id, course_id)."""

    __tablename__ = "course_reactions"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    course_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    reaction_type: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "reaction_type IN ('like', 'dislike')",
            name="ck_course_reactions_type",
        ),
        Index("idx_course_reactions_course_id", "course_id"),
        Index("idx_course_reactions_user_id", "user_id"),
    )


class CourseComment(Base):
    __tablename__ = "course_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    course_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("idx_course_comments_user_id", "user_id"),
        Index("idx_course_comments_created_at", "created_at"),
        Index("idx_course_comments_course_created", "course_id", "created_at"),
    )
