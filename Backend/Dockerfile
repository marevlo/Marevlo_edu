# ─────────────────────────────────────────────────────────────────────
# Marevlo backend image (build context: ./Backend)
#
# Multi-stage:
#   1. builder  — installs python deps into a venv
#   2. runtime  — copies the venv + app source, runs as non-root
# ─────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Optimize sources by using a fast CDN mirror to speed up builds on Windows/WSL2
RUN if [ -f /etc/apt/sources.list ]; then sed -i 's/deb.debian.org/cdn-fastly.deb.debian.org/g' /etc/apt/sources.list; fi \
    && if [ -f /etc/apt/sources.list.d/debian.sources ]; then sed -i 's/deb.debian.org/cdn-fastly.deb.debian.org/g' /etc/apt/sources.list.d/debian.sources; fi

# build deps for psycopg2 et al.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

# ─────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app

# Optimize sources by using a fast CDN mirror to speed up builds on Windows/WSL2
RUN if [ -f /etc/apt/sources.list ]; then sed -i 's/deb.debian.org/cdn-fastly.deb.debian.org/g' /etc/apt/sources.list; fi \
    && if [ -f /etc/apt/sources.list.d/debian.sources ]; then sed -i 's/deb.debian.org/cdn-fastly.deb.debian.org/g' /etc/apt/sources.list.d/debian.sources; fi

# runtime deps only — no compilers
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash --uid 1000 marevlo

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=marevlo:marevlo app        ./app
COPY --chown=marevlo:marevlo alembic    ./alembic
COPY --chown=marevlo:marevlo alembic.ini ./alembic.ini
COPY --chown=marevlo:marevlo scripts    ./scripts

USER marevlo

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# ECS / compose passes env vars; gunicorn → uvicorn worker for prod.
CMD ["gunicorn", "app.main:app", \
    "-k", "uvicorn.workers.UvicornWorker", \
    "-w", "2", \
    "--bind", "0.0.0.0:8000", \
    "--access-logfile", "-", \
    "--error-logfile", "-", \
    "--timeout", "60", \
    "--graceful-timeout", "30", \
    "--keep-alive", "5"]
