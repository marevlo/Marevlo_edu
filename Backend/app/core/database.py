"""
SQLAlchemy engine, session, and Base.

Designed for FastAPI's request-scoped session via dependency injection.
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    """SQLAlchemy 2.0 declarative base. All models inherit from this."""

    pass


# Engine creation. We use psycopg2 (sync) — FastAPI handles concurrency via
# its threadpool for sync routes, which is fine for our workload (mostly DB-bound
# CRUD). Going async-everywhere would force an asyncpg + Alembic-async rewrite
# without measurable benefit at our scale.
def _build_engine():
    url = settings.DATABASE_URL
    # SQLite (tests) ignores connection-pool tuning.
    if url.startswith("sqlite"):
        return create_engine(
            url,
            echo=settings.DB_ECHO,
            future=True,
            connect_args={"check_same_thread": False},
        )
    return create_engine(
        url,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
        pool_pre_ping=settings.DB_POOL_PRE_PING,
        echo=settings.DB_ECHO,
        future=True,
    )


engine = _build_engine()

# Install the slow-query event listener. Adds zero overhead per query
# (a perf_counter delta) and only emits on the slow tail.
try:
    from app.core.slow_query import install_slow_query_logger

    install_slow_query_logger(engine)
except Exception:
    # Don't let observability wiring break the app.
    import logging as _logging

    _logging.getLogger(__name__).exception("slow_query_install_failed")

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,  # avoid lazy-loads after commit returning to FastAPI
)
