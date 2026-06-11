"""
Request middleware.

- RequestIdMiddleware: stamps every request with a unique ID for tracing.
- ProxyHeadersMiddleware: extracts the real client IP from X-Forwarded-For when
  the request comes through a trusted load balancer (ALB).
- MaxBodySizeMiddleware: rejects oversized request bodies before they hit the
  app — protects memory under hostile clients and complements the per-field
  size validators in pydantic.
"""
from __future__ import annotations

import logging
import time
import uuid
from ipaddress import ip_address, ip_network
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inject a request ID and log every request with timing."""

    HEADER = "X-Request-ID"

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Honor an inbound request ID (e.g. set by ALB) or mint a new one.
        rid = request.headers.get(self.HEADER) or uuid.uuid4().hex
        request.state.request_id = rid

        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "request_failed",
                extra={
                    "request_id": rid,
                    "method": request.method,
                    "path": request.url.path,
                    "elapsed_ms": round(elapsed_ms, 2),
                },
            )
            raise

        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers[self.HEADER] = rid
        # Best-effort metrics: extract the matched route template so
        # /users/123 and /users/456 collapse into one bucket.
        path_template = _path_template_from(request)
        try:
            from app.core.metrics import metrics

            metrics.observe_request(
                method=request.method,
                path_template=path_template,
                status=response.status_code,
                duration_ms=elapsed_ms,
            )
        except Exception:
            pass
        logger.info(
            "request_completed",
            extra={
                "request_id": rid,
                "method": request.method,
                "path": request.url.path,
                "path_template": path_template,
                "status": response.status_code,
                "elapsed_ms": round(elapsed_ms, 2),
            },
        )
        return response


def _path_template_from(request) -> str:
    """Return the matched route's path template, or fall back to URL path.

    Path templates are bounded-cardinality (one entry per route) which is
    what we want for Prometheus labels. The URL path itself can be
    unbounded (/users/123, /users/124, ...).
    """
    route = request.scope.get("route")
    if route and hasattr(route, "path"):
        return route.path
    # Fallback for paths that didn't match a route (404s, exception paths).
    return request.url.path


class ProxyHeadersMiddleware(BaseHTTPMiddleware):
    """Read X-Forwarded-For when requests come from trusted proxies (ALB).

    Without this, request.client.host is the LB IP and rate limiting becomes
    global (every user shares one bucket).
    """

    def __init__(self, app):
        super().__init__(app)
        settings = get_settings()
        self.trusted_networks = []
        for cidr in settings.trusted_proxy_list:
            try:
                self.trusted_networks.append(ip_network(cidr, strict=False))
            except ValueError:
                logger.warning("Invalid trusted_proxy CIDR: %s", cidr)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    def _is_trusted(self, host: str | None) -> bool:
        if not host:
            return False
        if not self.trusted_networks:
            return False
        try:
            ip = ip_address(host)
        except ValueError:
            return False
        return any(ip in net for net in self.trusted_networks)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_host = request.client.host if request.client else None
        if self._is_trusted(client_host):
            xff = request.headers.get("x-forwarded-for")
            if xff:
                # Leftmost IP is the original client.
                real_ip = xff.split(",")[0].strip()
                # Stash on state — slowapi reads request.state.real_ip via our key_func.
                request.state.real_ip = real_ip
                return await call_next(request)
        request.state.real_ip = client_host
        return await call_next(request)


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject bodies larger than `max_bytes` with 413 before they reach handlers.

    Two layers of defense:
      1. If the client sends Content-Length and it exceeds the cap, reject up
         front (no body read, zero memory cost).
      2. If Content-Length is missing or lying (e.g. chunked uploads), wrap
         the receive() callable to count bytes and short-circuit when the cap
         is exceeded.
    """

    def __init__(self, app, max_bytes: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip WebSocket and OPTIONS — they don't carry meaningful bodies.
        if request.method in ("OPTIONS", "HEAD", "GET", "DELETE"):
            return await call_next(request)

        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > self.max_bytes:
                    from fastapi.responses import JSONResponse as _JR

                    return _JR(
                        status_code=413,
                        content={
                            "error": {
                                "code": "payload_too_large",
                                "message": f"Request body exceeds {self.max_bytes} bytes",
                                "request_id": getattr(request.state, "request_id", None),
                            }
                        },
                    )
            except ValueError:
                pass  # malformed Content-Length; fall through to streaming check

        # Streaming check: wrap `receive` to enforce a running byte cap.
        original_receive = request._receive
        bytes_seen = 0
        max_bytes = self.max_bytes

        async def limited_receive():
            nonlocal bytes_seen
            msg = await original_receive()
            if msg.get("type") == "http.request":
                body = msg.get("body", b"") or b""
                bytes_seen += len(body)
                if bytes_seen > max_bytes:
                    # Force the connection closed; ASGI doesn't have a clean
                    # mid-stream rejection, so we raise.
                    raise _PayloadTooLarge(max_bytes)
            return msg

        request._receive = limited_receive

        try:
            return await call_next(request)
        except _PayloadTooLarge as exc:
            from fastapi.responses import JSONResponse as _JR

            return _JR(
                status_code=413,
                content={
                    "error": {
                        "code": "payload_too_large",
                        "message": f"Request body exceeds {exc.cap} bytes",
                        "request_id": getattr(request.state, "request_id", None),
                    }
                },
            )


class _PayloadTooLarge(Exception):
    def __init__(self, cap: int) -> None:
        self.cap = cap
