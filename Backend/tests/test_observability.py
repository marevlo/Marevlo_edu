"""
Observability:
  - /metrics endpoint emits valid Prometheus exposition format
  - request observation increments counters and histograms
  - slow query logger fires on a deliberately-slow statement
"""
import time

from sqlalchemy import text


def test_metrics_endpoint_returns_prometheus_format(client):
    """A bare-minimum smoke test that the endpoint emits expected metric names."""
    # Issue a few requests so the registry has data.
    client.get("/health")
    client.get("/health")
    client.post("/auth/signup", json={"username": "alice", "email": "a@x.com", "password": "Password1"})

    r = client.get("/metrics")
    assert r.status_code == 200
    body = r.text
    # Prometheus format starts with HELP/TYPE comments.
    assert "# HELP http_requests_total" in body
    assert "# TYPE http_requests_total counter" in body
    # Histogram for request duration.
    assert "http_request_duration_ms_bucket" in body
    assert "http_request_duration_ms_count" in body
    assert "http_request_duration_ms_sum" in body
    # WS gauge.
    assert "websocket_active_connections" in body
    # app_info.
    assert "app_info" in body


def test_metrics_collapses_path_parameters(client):
    """Two calls to /feed/posts/123 and /feed/posts/456 should land in the
    same path bucket — `/feed/posts/{post_id}/like`-style — not separate buckets."""
    client.post("/auth/signup", json={"username": "alice", "email": "a@x.com", "password": "Password1"})
    tok = client.post(
        "/auth/login", data={"username": "a@x.com", "password": "Password1"}
    ).json()["access_token"]
    H = {"Authorization": f"Bearer {tok}"}
    p1 = client.post("/feed/posts", json={"content": "p1", "type": "post"}, headers=H).json()["id"]
    p2 = client.post("/feed/posts", json={"content": "p2", "type": "post"}, headers=H).json()["id"]

    # Both like calls should share a path bucket.
    client.post(f"/feed/posts/{p1}/like", headers=H)
    client.post(f"/feed/posts/{p2}/like", headers=H)

    body = client.get("/metrics").text
    # The metric line for the like endpoint should appear and have count >= 2 across
    # the two like calls. The path label should NOT contain the literal id.
    like_lines = [
        line for line in body.splitlines()
        if "http_requests_total" in line and "/like" in line
    ]
    assert any('path="/feed/posts/{post_id}/like"' in line for line in like_lines), (
        f"Path template was not collapsed; lines:\n{like_lines}"
    )
    # And no line should contain the raw id.
    for line in like_lines:
        assert f"/{p1}/" not in line and f"/{p2}/" not in line


def test_slow_query_logger_fires(caplog):
    """With threshold=0 every query is 'slow' and gets logged."""
    import logging

    from sqlalchemy import StaticPool, create_engine
    from sqlalchemy.orm import sessionmaker

    from app.core import slow_query as sq

    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sq.install_slow_query_logger(eng, threshold_ms=0)
    SF = sessionmaker(bind=eng)

    caplog.set_level(logging.WARNING, logger="app.slow_query")
    with SF() as db:
        db.execute(text("SELECT 1 AS x"))

    matched = [r for r in caplog.records if "slow_query" in r.getMessage()]
    assert matched, "expected at least one slow_query log line"
    assert "elapsed_ms" in matched[0].getMessage()


def test_slow_query_logger_skips_fast_queries(caplog):
    """With a high threshold, no slow_query logs should appear."""
    import logging

    from sqlalchemy import StaticPool, create_engine
    from sqlalchemy.orm import sessionmaker

    from app.core import slow_query as sq

    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sq.install_slow_query_logger(eng, threshold_ms=60000)
    SF = sessionmaker(bind=eng)

    caplog.set_level(logging.WARNING, logger="app.slow_query")
    with SF() as db:
        db.execute(text("SELECT 1"))

    matched = [r for r in caplog.records if "slow_query" in r.getMessage()]
    assert matched == []
