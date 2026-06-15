"""Apply Alembic migrations safely on container startup.

Run as the first step of the API container's command in ECS. Multiple API
replicas start concurrently, so we serialize migrations with a Postgres
*session-level advisory lock*: the first task acquires the lock and runs
`alembic upgrade head`; the others block on the lock, then run alembic too —
but by then the schema is already at head, so theirs is a no-op. This avoids
the classic two-replicas-both-ALTER-TABLE crash without any external coordinator.

Local dev (docker-compose) keeps its own `alembic upgrade head && gunicorn`
command, so this script is only wired into the ECS api task definition.
"""
from __future__ import annotations

import subprocess
import sys

from sqlalchemy import text

from app.core.database import engine

# Arbitrary but FIXED — every replica must use the same key to contend.
_LOCK_KEY = 778201  # "reels"/marevlo migration lock


def main() -> int:
    # One long-lived connection holds the advisory lock for the whole alembic
    # run. The lock is tied to this session, not a transaction, so it persists
    # across the subprocess until we explicitly unlock (or the conn closes).
    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _LOCK_KEY})
        conn.commit()
        try:
            print("run_migrations: lock acquired, running alembic upgrade head", flush=True)
            result = subprocess.run(["alembic", "upgrade", "head"], cwd="/app")
            if result.returncode != 0:
                print(f"run_migrations: alembic failed (exit {result.returncode})", flush=True)
                return result.returncode
            print("run_migrations: migrations applied", flush=True)
            return 0
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _LOCK_KEY})
            conn.commit()


if __name__ == "__main__":
    sys.exit(main())
