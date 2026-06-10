"""
HTTP client for the external code runner service.

The runner is a separate process (the existing IDE backend at IDE_RUNNER_URL).
It exposes:
    POST /run    -> { stdout, stderr, statusCode, runtimeMs? }
"""
from __future__ import annotations

import logging

import requests
from requests.exceptions import RequestException

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailable

logger = logging.getLogger(__name__)


class RunnerClient:
    """Thin retry-free HTTP client. Failures bubble up as 503."""

    def __init__(self, *, timeout_seconds: float = 30.0) -> None:
        self.timeout = timeout_seconds

    def run(self, *, language: str, code: str, stdin: str = "", timeout_ms: int | None = None, memory_mb: int | None = None) -> dict:
        url = f"{get_settings().IDE_RUNNER_URL.rstrip('/')}/run"
        
        payload = {"language": language, "code": code, "stdin": stdin}
        if timeout_ms is not None:
            payload["timeoutMs"] = timeout_ms
        if memory_mb is not None:
            payload["memoryMb"] = memory_mb

        try:
            resp = requests.post(
                url,
                json=payload,
                timeout=self.timeout,
            )
        except RequestException as exc:
            logger.warning("runner_unreachable url=%s err=%s", url, exc)
            raise ServiceUnavailable("Code runner is unavailable") from exc

        if resp.status_code >= 500:
            logger.warning("runner_server_error url=%s status=%d body=%s", url, resp.status_code, resp.text[:200])
            raise ServiceUnavailable("Code runner returned an error")

        try:
            data = resp.json()
        except ValueError as exc:
            logger.warning("runner_invalid_json url=%s body=%s", url, resp.text[:200])
            raise ServiceUnavailable("Code runner returned invalid response") from exc

        return {
            "stdout": data.get("stdout", ""),
            "stderr": data.get("stderr", ""),
            "exit_code": int(data.get("statusCode", data.get("exit_code", 0)) or 0),
            "runtime_ms": data.get("runtimeMs") or data.get("runtime_ms"),
            "memory_kb": data.get("memoryKb") or data.get("memory_kb"),
        }


runner_client = RunnerClient()
