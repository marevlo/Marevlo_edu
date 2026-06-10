"""
Lightweight in-process metrics.

Prometheus exposition format. We don't depend on `prometheus_client` to
keep our deployment simple; the format is small and well-defined.

What we expose:
  - http_requests_total{method,path_template,status}  — counter
  - http_request_duration_ms_bucket{method,path_template,le}  — histogram
  - http_request_duration_ms_count
  - http_request_duration_ms_sum
  - websocket_active_connections — gauge
  - db_slow_queries_total{path_template}  — counter
  - app_info{version,env}  — gauge=1

Path templates are normalized so /users/123 and /users/456 collapse into
one bucket. We do this by capturing the matched FastAPI route at request
time (Request.scope["route"].path).

The `/metrics` endpoint is unauthenticated by default — in prod, restrict
it via your security group / ALB rules to only your scraper.
"""
from __future__ import annotations

import threading
from collections import defaultdict
from typing import Optional

# Histogram buckets (milliseconds) — match what's normal for a web API:
# fast (<10ms in-cache), typical (10-100ms), slow (>500ms warning), very slow (>2s).
LATENCY_BUCKETS_MS = (
    1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
)
SLOW_QUERY_THRESHOLD_MS = 500  # log + count anything slower than this


class MetricsRegistry:
    """Thread-safe (GIL is enough for our simple counters) metrics registry.

    All counters are int. Histograms are dict[bucket_upper_bound -> count] +
    a count + a sum (cumulative ms).
    """

    def __init__(self):
        self._lock = threading.Lock()
        # request_count[(method, path_template, status_class)] -> int
        self._request_count: dict[tuple, int] = defaultdict(int)
        # latency_hist[(method, path_template)] -> dict[bucket_le -> count]
        self._latency_hist: dict[tuple, dict] = defaultdict(
            lambda: {b: 0 for b in LATENCY_BUCKETS_MS} | {"+Inf": 0}
        )
        self._latency_count: dict[tuple, int] = defaultdict(int)
        self._latency_sum: dict[tuple, float] = defaultdict(float)
        self._ws_connections = 0
        self._slow_query_count: dict[str, int] = defaultdict(int)
        self._app_info = {"version": "1.0.0", "env": "unknown"}

    def configure(self, *, version: str, env: str) -> None:
        self._app_info = {"version": version, "env": env}

    # ── HTTP request observation ────────────────────────────────────────
    def observe_request(
        self,
        *,
        method: str,
        path_template: str,
        status: int,
        duration_ms: float,
    ) -> None:
        # Normalize status to 2xx/3xx/4xx/5xx for cardinality control.
        status_class = f"{status // 100}xx"
        with self._lock:
            self._request_count[(method, path_template, status_class)] += 1

            hist = self._latency_hist[(method, path_template)]
            for upper in LATENCY_BUCKETS_MS:
                if duration_ms <= upper:
                    hist[upper] += 1
            hist["+Inf"] += 1
            self._latency_count[(method, path_template)] += 1
            self._latency_sum[(method, path_template)] += duration_ms

    # ── WebSocket connections ───────────────────────────────────────────
    def ws_connect(self) -> None:
        with self._lock:
            self._ws_connections += 1

    def ws_disconnect(self) -> None:
        with self._lock:
            self._ws_connections = max(0, self._ws_connections - 1)

    # ── Slow queries ────────────────────────────────────────────────────
    def observe_slow_query(self, *, path_template: str = "unknown") -> None:
        with self._lock:
            self._slow_query_count[path_template] += 1

    # ── Render ──────────────────────────────────────────────────────────
    def render_prometheus(self) -> str:
        """Emit metrics in Prometheus text exposition format."""
        lines: list[str] = []

        # http_requests_total
        lines.append("# HELP http_requests_total Total HTTP requests")
        lines.append("# TYPE http_requests_total counter")
        with self._lock:
            for (method, path, status_class), count in self._request_count.items():
                lines.append(
                    f'http_requests_total{{method="{_esc(method)}",path="{_esc(path)}",status="{status_class}"}} {count}'
                )

            # http_request_duration_ms histogram
            lines.append("# HELP http_request_duration_ms Request duration (ms)")
            lines.append("# TYPE http_request_duration_ms histogram")
            for (method, path), hist in self._latency_hist.items():
                for upper in LATENCY_BUCKETS_MS:
                    lines.append(
                        f'http_request_duration_ms_bucket{{method="{_esc(method)}",path="{_esc(path)}",le="{upper}"}} {hist[upper]}'
                    )
                lines.append(
                    f'http_request_duration_ms_bucket{{method="{_esc(method)}",path="{_esc(path)}",le="+Inf"}} {hist["+Inf"]}'
                )
                lines.append(
                    f'http_request_duration_ms_count{{method="{_esc(method)}",path="{_esc(path)}"}} {self._latency_count[(method, path)]}'
                )
                lines.append(
                    f'http_request_duration_ms_sum{{method="{_esc(method)}",path="{_esc(path)}"}} {self._latency_sum[(method, path)]:.2f}'
                )

            # websocket_active_connections
            lines.append("# HELP websocket_active_connections Active WS connections")
            lines.append("# TYPE websocket_active_connections gauge")
            lines.append(f"websocket_active_connections {self._ws_connections}")

            # db_slow_queries_total
            lines.append("# HELP db_slow_queries_total DB queries above threshold")
            lines.append("# TYPE db_slow_queries_total counter")
            for path, count in self._slow_query_count.items():
                lines.append(
                    f'db_slow_queries_total{{path="{_esc(path)}"}} {count}'
                )

            # app_info
            lines.append("# HELP app_info Application metadata")
            lines.append("# TYPE app_info gauge")
            lines.append(
                f'app_info{{version="{_esc(self._app_info["version"])}",env="{_esc(self._app_info["env"])}"}} 1'
            )

        return "\n".join(lines) + "\n"


def _esc(s: str) -> str:
    """Prometheus label escape."""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


# Process-wide registry.
metrics = MetricsRegistry()
