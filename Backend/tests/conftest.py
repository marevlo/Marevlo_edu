"""
Pytest fixtures.

Each test gets a fresh in-memory SQLite DB and a fakeredis instance.
The TestClient runs the full FastAPI app — same code path as production.
"""
from __future__ import annotations

import os
from typing import Generator

import pytest

# Set test env BEFORE importing any app code.
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-thats-long-enough-1234")
os.environ.setdefault("REDIS_REQUIRED", "false")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("REQUIRE_DOB", "false")
os.environ.setdefault("ENFORCE_COURSE_ACCESS", "false")
os.environ.setdefault("LOG_FORMAT", "text")

import fakeredis
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.core import database as core_db
from app.core import redis_client as core_redis
from app.core.database import Base
from app import models_registry  # noqa: F401  — populate metadata


@pytest.fixture(scope="function")
def engine():
    """Fresh SQLite-in-memory engine, sharable across threads (TestClient
    runs requests on a worker thread)."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture(scope="function")
def db_session(engine):
    SessionFactory = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    session = SessionFactory()
    yield session
    session.close()


@pytest.fixture(scope="function")
def fake_redis(monkeypatch):
    """Replace both sync and async redis with fakeredis."""
    import fakeredis.aioredis

    sync_client = fakeredis.FakeStrictRedis(decode_responses=True)
    async_client = fakeredis.aioredis.FakeRedis(decode_responses=True)

    # Reset the manager's lazy-init cache so it returns our fakes.
    core_redis.redis_manager._sync = sync_client
    core_redis.redis_manager._async = async_client

    yield sync_client

    core_redis.redis_manager._sync = None
    core_redis.redis_manager._async = None


@pytest.fixture(scope="function")
def client(engine, fake_redis, monkeypatch) -> Generator[TestClient, None, None]:
    """TestClient with the engine + fake redis wired in."""
    SessionFactory = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(core_db, "engine", engine)
    monkeypatch.setattr(core_db, "SessionLocal", SessionFactory)

    # Import after env is set and patches are applied.
    from app.main import app

    with TestClient(app) as c:
        yield c


# ── Query-budget helper ─────────────────────────────────────────────────
class QueryCounter:
    """Counts SQL statements issued during a `with` block.

    Filters out transaction-control noise (BEGIN/COMMIT/ROLLBACK/SAVEPOINT)
    and tracks only real statements. Use as:

        def test_my_endpoint_is_constant(client, query_counter):
            seed_data(client)
            with query_counter() as count:
                client.get("/some/endpoint")
            assert count.value < 10, f"too many queries: {count.value}"
    """

    NOISE_PREFIXES = ("BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE")

    def __init__(self, engine):
        self.engine = engine
        self.value = 0
        self.statements: list[str] = []
        self._listening = False

    def __enter__(self) -> "QueryCounter":
        from sqlalchemy import event

        self.value = 0
        self.statements = []
        self._listening = True

        def _capture(conn, cur, stmt, params, ctx, exm):
            if not self._listening:
                return
            head = stmt.strip().upper()
            if any(head.startswith(p) for p in self.NOISE_PREFIXES):
                return
            self.value += 1
            self.statements.append(stmt)

        self._capture = _capture
        event.listen(self.engine, "before_cursor_execute", self._capture)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        from sqlalchemy import event

        self._listening = False
        event.remove(self.engine, "before_cursor_execute", self._capture)


@pytest.fixture(scope="function")
def query_counter(engine):
    """Returns a context manager factory:

        with query_counter() as count:
            ... do work ...
        assert count.value < 10
    """

    def _factory():
        return QueryCounter(engine)

    return _factory
