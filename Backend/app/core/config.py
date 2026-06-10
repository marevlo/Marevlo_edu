"""
Application configuration.

Loaded once at startup via `get_settings()`. Refuses to start in production
with insecure defaults. All values come from environment variables (12-factor).

In AWS, prod secrets come from Secrets Manager, injected as env vars by the
ECS task definition.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List, Literal, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


Environment = Literal["dev", "test", "staging", "prod"]


class Settings(BaseSettings):
    """All runtime configuration. Validated on first access."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Environment ──────────────────────────────────────────────────────
    ENV: Environment = "dev"
    DEBUG: bool = False
    APP_NAME: str = "Marevlo API"
    APP_VERSION: str = "1.0.0"

    # Minor handling (DPDP Act). MINORS_MODE: "consent" = collect a guardian email
    # + consent for under-MINOR_AGE users; "block" = restrict the platform to
    # MINOR_AGE+ only. NOTE: confirm the compliant approach with a lawyer.
    MINOR_AGE: int = 18
    MINORS_MODE: str = "consent"
    REQUIRE_DOB: bool = True  # require date of birth at signup (off in tests)

    # ── Database ─────────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+psycopg2://marevlo:marevlo@localhost:5432/marevlo_dev"
    )
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE_SECONDS: int = 1800
    DB_POOL_PRE_PING: bool = True
    DB_ECHO: bool = False  # log SQL — never enable in prod

    # ── Redis ────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_REQUIRED: bool = True  # if False, app degrades gracefully

    # ── JWT ──────────────────────────────────────────────────────────────
    JWT_SECRET: str = "dev-only-do-not-use-in-prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── CORS ─────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Course access ────────────────────────────────────────────────────
    # Courses have no per-course product column (course_id is a free-form slug),
    # so the mapping is config-driven. ENFORCE_COURSE_ACCESS gates the check
    # (on in prod, off in tests). COURSE_PRODUCT_DEFAULT is the product required
    # for any non-free course; FREE_COURSE_IDS lists free slugs; OVERRIDES holds
    # "slug:product" exceptions (e.g. "dsa-course:dsa").
    ENFORCE_COURSE_ACCESS: bool = True
    COURSE_PRODUCT_DEFAULT: str = "all_access"
    FREE_COURSE_IDS: str = ""
    COURSE_PRODUCT_OVERRIDES: str = ""

    # ── S3 / file storage ────────────────────────────────────────────────
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET: Optional[str] = None
    S3_ENDPOINT_URL: Optional[str] = None  # for MinIO/LocalStack in dev
    S3_PRESIGN_TTL_PUT_SECONDS: int = 600
    S3_PRESIGN_TTL_GET_SECONDS: int = 3600
    S3_PRESIGN_CACHE_SIZE: int = 5000

    # ── Email (SES via SMTP) ─────────────────────────────────────────────
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASS: Optional[str] = None
    SMTP_FROM: str = "no-reply@marevlo.com"
    SMTP_USE_TLS: bool = True

    # ── Firebase (Google login) ──────────────────────────────────────────
    FIREBASE_CREDENTIALS_JSON: Optional[str] = None
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None
    # check_revoked=True forces an extra live call to Google on EVERY login to
    # test for revocation. The Google ID token is consumed once, seconds after
    # the client minted it, and the app issues its own JWT session afterwards —
    # so revocation-at-login buys almost nothing while adding a hard network
    # dependency on the login hot path. Default off; flip on only if you need
    # immediate Firebase-side revocation enforcement.
    FIREBASE_CHECK_REVOKED: bool = False

    # ── External services ────────────────────────────────────────────────
    IDE_RUNNER_URL: str = "http://localhost:4000"
    NOTEBOOK_BASE_URL: str = ""

    # ── Rate limiting ────────────────────────────────────────────────────
    RATE_LIMIT_ENABLED: bool = True
    TRUSTED_PROXIES: str = ""  # comma-separated CIDRs of trusted proxies

    @property
    def trusted_proxy_list(self) -> List[str]:
        return [p.strip() for p in self.TRUSTED_PROXIES.split(",") if p.strip()]

    # ── Request limits ───────────────────────────────────────────────────
    # Hard cap on request body size at the middleware layer. Avatar/feed images
    # use S3 presigned PUTs (don't pass through API), so this only needs to
    # cover JSON bodies + the resume upload (5 MB), with headroom.
    MAX_REQUEST_BYTES: int = 10 * 1024 * 1024  # 10 MB

    # ── Logging ──────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: Literal["json", "text"] = "json"

    # ── Sentry ───────────────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = None
    SENTRY_TRACES_SAMPLE_RATE: float = 0.05

    # ── Validators ───────────────────────────────────────────────────────
    @field_validator("JWT_SECRET")
    @classmethod
    def _validate_jwt_secret(cls, v: str, info) -> str:
        # info.data may not have ENV at this point; we re-check in `validate_for_env`.
        if not v or len(v) < 16:
            raise ValueError("JWT_SECRET must be at least 16 characters")
        return v

    def validate_for_env(self) -> None:
        """Cross-field validation that runs after all settings are loaded.

        Called from main.py at startup. Refuses to start with insecure config
        in non-dev environments.
        """
        if self.ENV in ("staging", "prod"):
            if self.JWT_SECRET == "dev-only-do-not-use-in-prod":
                raise RuntimeError(
                    f"JWT_SECRET must be set to a real secret in {self.ENV}. "
                    "Set it via Secrets Manager / environment variable."
                )
            if self.DEBUG:
                raise RuntimeError(f"DEBUG must be False in {self.ENV}")
            if self.DB_ECHO:
                raise RuntimeError(f"DB_ECHO must be False in {self.ENV}")
            if not self.S3_BUCKET:
                raise RuntimeError(f"S3_BUCKET must be set in {self.ENV}")

    @property
    def is_prod(self) -> bool:
        return self.ENV == "prod"

    @property
    def is_dev(self) -> bool:
        return self.ENV == "dev"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton. Call this from anywhere — it's free after the first call."""
    return Settings()
