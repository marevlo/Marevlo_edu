"""
MIRA concept-lattice model.

Stores the concept graph extracted from a Marevlo course (via the ingestion
pipeline) — concepts, prerequisites, difficulty. The runtime tutor reads this to
build learning paths, mastery maps, and 'next concept' recommendations.

This is the bridge from Marevlo course CONTENT to MIRA's adaptive structure: we
do NOT maintain a separate concept graph by hand; ingestion extracts it from the
courses and writes it here.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.sqltypes import JSONBType


class MiraConceptLattice(Base):
    """One lattice per (course_id, module_id). module_id NULL = course-level."""
    __tablename__ = "mira_concept_lattices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    course_id: Mapped[str] = mapped_column(String(128), nullable=False)
    module_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # { "concepts": [ {id,name,description,prerequisites,keywords,difficulty}, ... ] }
    lattice: Mapped[dict] = mapped_column(JSONBType, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    generated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("course_id", "module_id", name="uq_lattice_course_module"),
        Index("idx_lattice_course", "course_id"),
    )
