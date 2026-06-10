"""
Cross-dialect JSONB.

Postgres has true JSONB (binary, indexable, faster). SQLite (used in tests)
only has JSON. This wrapper picks the right backend at compile time so the
same model works for both production (PG) and tests (SQLite).
"""
from __future__ import annotations

from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
from sqlalchemy.types import TypeDecorator


class JSONBType(TypeDecorator):
    """Use JSONB on Postgres, JSON elsewhere."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_JSONB())
        return dialect.type_descriptor(JSON())
