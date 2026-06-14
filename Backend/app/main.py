"""
Marevlo backend — FastAPI application entrypoint.

Run with:
    uvicorn app.main:app --host 0.0.0.0 --port 8000

In production (ECS Fargate):
    gunicorn app.main:app -k uvicorn.workers.UvicornWorker \
        -w 2 --bind 0.0.0.0:8000 --access-logfile -

Two workers per task gives a sensible balance — more isolation than 1, less
context-switching than 4. Scale by running more ECS tasks behind ALB rather
than packing more workers per task.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.auth.routers.auth import router as auth_router
from app.chat.routers.chat import router as chat_router
from app.chat.routers.ws import router as chat_ws_router
from app.discussions.routers.discussion import router as discussions_router
from app.chat.services.connection_manager import connection_manager
from app.core.config import get_settings
from app.core.error_handlers import register_exception_handlers
from app.core.exceptions import RateLimited
from app.core.logging_config import configure_logging
from app.core.middleware import (
    MaxBodySizeMiddleware,
    ProxyHeadersMiddleware,
    RequestIdMiddleware,
)
from app.core.rate_limiting import limiter
from app.core.redis_client import redis_manager
from app.courses.routers.course import router as courses_router
from app.feed.routers.feed import router as feed_router
from app.learning.routers.learning import router as learning_router
from app.moderation.routers.admin import router as admin_router
from app.moderation.routers.user_moderation import router as user_mod_router
from app.notifications.routers.notifications import (
    admin_router as announcements_admin_router,
    router as notifications_router,
)
from app.notebook.routers.notebook import router as notebook_router
from app.problems.routers.problem import router as problems_router
from app.profile.routers.profile import router as profile_router
from app.submissions.routers.submission import router as submissions_router
from app.bug_reports.routers.bug_report import router as bug_reports_router
from app.unlock.router import router as unlock_router
from app.entitlements.routers.entitlement import router as entitlements_router
from app.entitlements.routers.admin import router as entitlements_admin_router
from app.mira.routers.mira import router as mira_router
from app.reels.routers.reels import (
    admin_router as reels_admin_router,
    public_router as reels_public_router,
    reels_router,
)

# Import the registry so all models are loaded into Base.metadata.
from app import models_registry  # noqa: F401

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    settings.validate_for_env()
    logger.info(
        "app_startup env=%s version=%s region=%s",
        settings.ENV,
        settings.APP_VERSION,
        settings.AWS_REGION,
    )

    # Start the WebSocket pubsub listener.
    await connection_manager.startup()
    try:
        yield
    finally:
        logger.info("app_shutdown")
        await connection_manager.shutdown()
        await redis_manager.close()


def _init_sentry() -> None:
    settings = get_settings()
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            environment=settings.ENV,
            integrations=[FastApiIntegration(), SqlalchemyIntegration()],
        )
        logger.info("sentry_initialized env=%s", settings.ENV)
    except ImportError:
        logger.info("sentry_sdk not installed — skipping Sentry init")


def create_app() -> FastAPI:
    settings = get_settings()
    _init_sentry()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    # ── Middleware ──────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # ProxyHeaders runs first (innermost) so the IP it sets is available to
    # RequestIdMiddleware and the rate limiter.
    app.add_middleware(ProxyHeadersMiddleware)
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.MAX_REQUEST_BYTES)

    # ── Rate limiter ────────────────────────────────────────────────────
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request, exc):
        # Re-raise as our domain exception so the handler builds the unified
        # error payload.
        raise RateLimited("Too many requests")

    register_exception_handlers(app)

    # ── Routers ─────────────────────────────────────────────────────────
    app.include_router(auth_router)
    app.include_router(profile_router)
    app.include_router(problems_router)
    app.include_router(discussions_router)
    app.include_router(submissions_router)
    app.include_router(feed_router)
    app.include_router(chat_router)
    app.include_router(chat_ws_router)
    app.include_router(courses_router)
    app.include_router(learning_router)
    app.include_router(notebook_router)
    app.include_router(user_mod_router)
    app.include_router(admin_router)
    app.include_router(notifications_router)
    app.include_router(announcements_admin_router)
    app.include_router(unlock_router)
    app.include_router(entitlements_router)
    app.include_router(entitlements_admin_router)
    app.include_router(mira_router)
    app.include_router(bug_reports_router)
    app.include_router(reels_public_router)
    app.include_router(reels_router)
    app.include_router(reels_admin_router)

    # ── Health ──────────────────────────────────────────────────────────
    @app.get("/", tags=["meta"])
    def root():
        return {"name": settings.APP_NAME, "version": settings.APP_VERSION}

    @app.get("/health", tags=["meta"])
    def health():
        """Simple liveness probe for ALB."""
        return {"status": "healthy"}

    @app.get("/health/ready", tags=["meta"])
    def ready():
        """Readiness probe — verifies DB and Redis are reachable."""
        from sqlalchemy import text

        from app.core.database import SessionLocal

        result = {"db": False, "redis": False}
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1"))
                result["db"] = True
        except Exception as exc:
            logger.warning("readiness_db_failed err=%s", exc)
        try:
            redis_manager.sync.ping()
            result["redis"] = True
        except Exception as exc:
            logger.warning("readiness_redis_failed err=%s", exc)
        result["healthy"] = result["db"] and result["redis"]
        return result

    @app.get("/metrics", tags=["meta"])
    def prometheus_metrics():
        """Prometheus exposition endpoint.

        Restrict access at the ALB / security-group level in production —
        the metrics body is not authenticated here.
        """
        from fastapi.responses import PlainTextResponse

        from app.core.metrics import metrics

        # Refresh the app_info each scrape — cheap.
        metrics.configure(version=settings.APP_VERSION, env=settings.ENV)
        return PlainTextResponse(
            metrics.render_prometheus(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    return app


app = create_app()
