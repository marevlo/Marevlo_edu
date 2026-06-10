"""
Map domain exceptions and unhandled errors to consistent JSON responses.

Response shape (always identical, easy for the frontend to handle):
    {
        "error": {
            "code": "email_already_registered",
            "message": "Email is already registered",
            "request_id": "..."
        }
    }
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import DomainError

logger = logging.getLogger(__name__)


def _error_payload(code: str, message: str, request: Request) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError):
        # Log at WARNING for 4xx, ERROR for 5xx
        log_method = logger.warning if exc.http_status < 500 else logger.error
        log_method("domain_error code=%s status=%d detail=%s", exc.code, exc.http_status, exc.detail)
        return JSONResponse(
            status_code=exc.http_status,
            content=_error_payload(exc.code, exc.detail, request),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        # Pydantic-raised HTTPExceptions (FastAPI default) get a consistent shape.
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload(
                code=f"http_{exc.status_code}",
                message=str(exc.detail) if exc.detail else "HTTP error",
                request=request,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        # Pydantic v2 sometimes attaches the original Exception in ctx; those
        # objects are not JSON-serializable. Sanitize before returning.
        safe_errors = []
        for err in exc.errors():
            safe = dict(err)
            ctx = safe.get("ctx")
            if isinstance(ctx, dict):
                safe["ctx"] = {
                    k: (str(v) if isinstance(v, BaseException) else v)
                    for k, v in ctx.items()
                }
            # Drop non-essential `input` if it's not serializable.
            if "input" in safe:
                try:
                    import json as _json

                    _json.dumps(safe["input"])
                except (TypeError, ValueError):
                    safe["input"] = repr(safe["input"])[:200]
            safe_errors.append(safe)

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                **_error_payload("validation_error", "Request validation failed", request),
                "errors": safe_errors,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        # Log full traceback but never leak internals to the client.
        logger.exception("unhandled_exception path=%s", request.url.path)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_payload(
                "internal_error",
                "An unexpected error occurred. Please try again later.",
                request,
            ),
        )
