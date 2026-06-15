"""
MIRA document store — the retrieval substrate for BOTH user-uploaded
document Q&A and course-lesson grounding ("build it once, get both").

Tables:
  - mira_documents  : one row per ingested source (a user's PDF, or a course
                      lesson). scope distinguishes ownership:
                        scope="user"   -> owner_key = str(users.id)
                        scope="course" -> owner_key = course_id
  - mira_doc_chunks : the chunked, embedded text. Embeddings are stored as a
                      JSON list[float] (JSONBType -> JSONB on Postgres, TEXT-
                      JSON on SQLite) at the shared 1536 dim. At current scale
                      (<= a few hundred chunks per doc) cosine-in-Python over
                      one document's chunks is fast; the scale path is pgvector
                      (same dim, same rows — a column-type migration, not a
                      redesign).

Cross-dialect like the rest of MIRA's tables: runs on Postgres (prod) and
SQLite (tests) unchanged.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.sqltypes import JSONBType


class MiraDocument(Base):
    __tablename__ = "mira_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # "user" (uploaded doc, owner_key = str(user_id)) or "course"
    # (lesson grounding, owner_key = course_id).
    scope: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    owner_key: Mapped[str] = mapped_column(String(64), nullable=False)
    # for scope="course": which lesson this source is (owner_key = course_id)
    lesson_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # sha256 of the raw bytes / text — per-owner dedupe + idempotent re-ingest.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ready")  # ready|failed
    n_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    n_chunks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedder: Mapped[str] = mapped_column(String(32), nullable=False, default="local")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False,
                                                 default=datetime.utcnow)

    chunks = relationship("MiraDocChunk", back_populates="document",
                          cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (
        # idempotent ingest: the same bytes for the same owner is the same doc.
        UniqueConstraint("scope", "owner_key", "content_hash",
                         name="uq_mira_doc_owner_hash"),
        Index("ix_mira_documents_owner", "scope", "owner_key"),
    )


class MiraDocChunk(Base):
    __tablename__ = "mira_doc_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("mira_documents.id", ondelete="CASCADE"), nullable=False)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)        # order within doc
    page_start: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list] = mapped_column(JSONBType, nullable=False, default=list)

    document = relationship("MiraDocument", back_populates="chunks")

    __table_args__ = (
        Index("ix_mira_doc_chunks_doc", "document_id"),
    )
