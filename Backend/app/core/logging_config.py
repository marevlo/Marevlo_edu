"""
Structured logging configuration.

In prod (LOG_FORMAT=json) we emit one JSON object per line — CloudWatch Logs
parses it natively and the fields become searchable via Logs Insights.

In dev we emit human-readable text.
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

from app.core.config import get_settings


class JsonFormatter(logging.Formatter):
    """One-line JSON per record — drop into CloudWatch as-is."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Attach extras the user passed in via logger.info("...", extra={...})
        for key, value in record.__dict__.items():
            if key in ("args", "msg", "levelname", "levelno", "pathname",
                      "filename", "module", "exc_info", "exc_text", "stack_info",
                      "lineno", "funcName", "created", "msecs", "relativeCreated",
                      "thread", "threadName", "processName", "process", "name",
                      "message", "taskName"):
                continue
            try:
                json.dumps(value)
                payload[key] = value
            except (TypeError, ValueError):
                payload[key] = str(value)

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging() -> None:
    settings = get_settings()
    handler = logging.StreamHandler(sys.stdout)
    if settings.LOG_FORMAT == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.LOG_LEVEL)

    # Tame noisy libraries
    logging.getLogger("uvicorn.access").setLevel("WARNING")
    logging.getLogger("botocore").setLevel("WARNING")
    logging.getLogger("urllib3").setLevel("WARNING")
