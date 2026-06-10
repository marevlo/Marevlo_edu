"""
Domain exceptions. Services raise these; HTTP layer translates them.

This keeps the service layer free of FastAPI/HTTP concerns. The exception
handler in app/core/error_handlers.py maps each one to an HTTP status.
"""
from __future__ import annotations


class DomainError(Exception):
    """Base for all application-level errors."""

    code: str = "domain_error"
    http_status: int = 500
    detail: str = "Something went wrong"

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.detail
        super().__init__(self.detail)


# ── 400 Bad Request ──────────────────────────────────────────────────────
class ValidationError(DomainError):
    code = "validation_error"
    http_status = 400
    detail = "Validation failed"


class InvalidCredentials(DomainError):
    code = "invalid_credentials"
    http_status = 401
    detail = "Invalid credentials"


class TokenError(DomainError):
    code = "token_error"
    http_status = 401
    detail = "Invalid or expired token"


# ── 403 Forbidden ────────────────────────────────────────────────────────
class Forbidden(DomainError):
    code = "forbidden"
    http_status = 403
    detail = "You do not have permission to perform this action"


class AccountInactive(DomainError):
    code = "account_inactive"
    http_status = 403
    detail = "Account is inactive, suspended, or deleted"


# ── 404 Not Found ────────────────────────────────────────────────────────
class NotFound(DomainError):
    code = "not_found"
    http_status = 404
    detail = "Resource not found"


# ── 409 Conflict ─────────────────────────────────────────────────────────
class Conflict(DomainError):
    code = "conflict"
    http_status = 409
    detail = "Resource already exists"


class EmailAlreadyRegistered(Conflict):
    code = "email_already_registered"
    detail = "Email is already registered"


class UsernameTaken(Conflict):
    code = "username_taken"
    detail = "Username is already taken"


# ── 429 Rate Limited ─────────────────────────────────────────────────────
class RateLimited(DomainError):
    code = "rate_limited"
    http_status = 429
    detail = "Too many requests"


# ── 503 Service Unavailable ──────────────────────────────────────────────
class ServiceUnavailable(DomainError):
    code = "service_unavailable"
    http_status = 503
    detail = "A required service is temporarily unavailable"


class StorageNotConfigured(ServiceUnavailable):
    code = "storage_not_configured"
    detail = "File storage is not configured on the server"
