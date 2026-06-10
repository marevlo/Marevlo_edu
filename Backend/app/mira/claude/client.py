"""
Claude client for MIRA's course-ingestion + concept-extraction pipeline.

Used by scripts/mira_ingest_courses.py. The pipeline needs a structured-output
call (JSON concept extraction). This wraps the Anthropic API for prod and a
deterministic mock for dry runs/tests so ingestion is fully testable without
API spend.

Note: this is the *ingestion-time* Claude client (Sonnet for concept extraction).
The *runtime* tutoring providers live in app/mira/engine/providers.py — they're
separate concerns (build-time content prep vs per-turn tutoring).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ClaudeMessage:
    role: str
    content: str


@dataclass
class ClaudeResponse:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class ClaudeClientBase:
    """Interface the ingestion pipeline depends on."""
    async def complete(self, system: str, messages: list[ClaudeMessage],
                       model_tier: Any = None, max_tokens: int = 2000) -> ClaudeResponse:
        raise NotImplementedError

    async def complete_structured(self, system: str, messages: list[ClaudeMessage],
                                  model_tier: Any = None,
                                  schema_hint: str = "") -> tuple[dict, ClaudeResponse]:
        """Return (parsed_json, raw_response). Falls back to {} if parse fails."""
        resp = await self.complete(system, messages, model_tier=model_tier)
        text = resp.text.strip()
        # strip code fences if present
        if text.startswith("```"):
            text = text.split("```", 2)[1] if "```" in text[3:] else text
            text = text.lstrip("json").strip()
        try:
            return json.loads(text), resp
        except Exception:
            # try to find the first {...} block
            import re
            m = re.search(r"\{.*\}", text, re.S)
            if m:
                try:
                    return json.loads(m.group(0)), resp
                except Exception:
                    pass
            return {}, resp


class MockClaudeClient(ClaudeClientBase):
    """Deterministic client for dry runs/tests. Responses are registered by a
    substring match against the prompt."""
    def __init__(self):
        self._responses: list[dict] = []

    def register_response(self, prompt_contains: str, response_haiku: str,
                          response_sonnet: str) -> None:
        self._responses.append({
            "match": prompt_contains,
            "haiku": response_haiku, "sonnet": response_sonnet,
        })

    async def complete(self, system: str, messages: list[ClaudeMessage],
                       model_tier: Any = None, max_tokens: int = 2000) -> ClaudeResponse:
        haystack = system + " " + " ".join(m.content for m in messages)
        for r in self._responses:
            if r["match"] in haystack:
                # ModelTier may be an enum; default to sonnet text
                tier_name = getattr(model_tier, "name", "SONNET").upper()
                text = r["haiku"] if tier_name == "HAIKU" else r["sonnet"]
                return ClaudeResponse(text=text, model="mock", input_tokens=10, output_tokens=20)
        # default: empty concept set
        return ClaudeResponse(text='{"concepts": []}', model="mock")


class ClaudeClient(ClaudeClientBase):
    """Real Anthropic client (used only for real ingestion runs)."""
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key
        self.model = model

    async def complete(self, system: str, messages: list[ClaudeMessage],
                       model_tier: Any = None, max_tokens: int = 2000) -> ClaudeResponse:
        import httpx  # lazy; only needed for real runs
        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": self.api_key,
                         "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json=payload)
            resp.raise_for_status()
            data = resp.json()
        text = "".join(block.get("text", "") for block in data.get("content", []))
        usage = data.get("usage", {})
        return ClaudeResponse(text=text, model=self.model,
                              input_tokens=usage.get("input_tokens", 0),
                              output_tokens=usage.get("output_tokens", 0))
