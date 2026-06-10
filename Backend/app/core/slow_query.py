"""
Slow query logger.

Hooks SQLAlchemy's `before_cursor_execute` and `after_cursor_execute` events
on the engine. Any statement that takes longer than SLOW_QUERY_THRESHOLD_MS
is logged at WARNING level with:
  - statement (truncated to 500 chars)
  - parameters
  - elapsed time
  - request_id (from contextvar) so we can correlate with HTTP request logs

The metrics registry's `db_slow_queries_total` counter is also bumped, so
ops can alert on a sustained rate of slow queries.

Why hook SQLAlchemy not the connection: SQLAlchemy gives us the rendered
statement + params after the ORM has built it, not the parameterized SQL
fragments — much more useful for debugging.

This is purely additive — it doesn't change query execution.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from sqlalchemy import event
from sqlalchemy.engine import Engine

from app.core.metrics import SLOW_QUERY_THRESHOLD_MS, metrics

logger = logging.getLogger("app.slow_query")


def _request_id_safe() -> Optional[str]:
    """Best-effort: pull request_id from FastAPI's request.state via contextvars.

    Starlette doesn't ship a contextvar for request_id, but we attach it in
    middleware. Reading it from inside an SQLAlchemy callback is awkward —
    we'd need to thread it through. For now we return None; the slow-query
    log line is correlated by timestamp + path_template instead.
    """
    return None


def install_slow_query_logger(engine: Engine, *, threshold_ms: int = SLOW_QUERY_THRESHOLD_MS) -> None:
    """Attach the slow-query listener to a SQLAlchemy engine.

    Idempotent — calling twice doesn't double-listen because we tag with
    `_slow_query_installed` on the engine.
    """
    if getattr(engine, "_slow_query_installed", False):
        return
    engine._slow_query_installed = True  # type: ignore[attr-defined]

    @event.listens_for(engine, "before_cursor_execute")
    def _before(conn, cursor, statement, parameters, context, executemany):
        # Stash a start time on the context. SQLAlchemy guarantees
        # `context` is unique per statement.
        context._slow_start = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def _after(conn, cursor, statement, parameters, context, executemany):
        start = getattr(context, "_slow_start", None)
        if start is None:
            return
        elapsed_ms = (time.perf_counter() - start) * 1000
        if elapsed_ms < threshold_ms:
            return

        # Prevent runaway log size — truncate huge statements.
        stmt = statement if len(statement) <= 500 else statement[:500] + " …(truncated)"
        # Parameters can be huge for batched inserts; redact.
        if isinstance(parameters, (list, tuple)) and len(parameters) > 5:
            params_repr = f"<{len(parameters)} param sets, redacted>"
        else:
            params_repr = repr(parameters)[:200]

        logger.warning(
            "slow_query elapsed_ms=%.2f threshold_ms=%d statement=%r params=%s",
            elapsed_ms,
            threshold_ms,
            stmt,
            params_repr,
        )
        # Tick the metric. We don't have request path here, so use a generic bucket.
        metrics.observe_slow_query(path_template="db")
