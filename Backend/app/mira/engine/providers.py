"""Model provider adapters — the swappable slots for GPT / MiniMax / Qwen.

Every provider implements the same `complete()` interface, so the router and
pipeline never care which model they're talking to. To add a real provider you
fill in ONE method. The MockProvider lets the whole engine run and be tested
with zero API keys (and is what the 10-user harness uses by default).

Wire real keys via environment variables; nothing is hardcoded.
"""
from __future__ import annotations

import os
import json
import time
import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


# ---- per-provider token pricing (USD per 1M tokens), edit as prices change ----
PRICING = {
    "qwen":    {"in": 0.05, "out": 0.20},     # engine-room (self-host/cheap proxy est.)
    "minimax": {"in": 0.279, "out": 1.20},    # workhorse (M2.7, verified)
    "gpt":     {"in": 5.00, "out": 30.00},    # specialist (GPT-5.5, verified)
    "mock":    {"in": 0.0,  "out": 0.0},
    # sonnet/opus included so you can A/B against them as the user asked:
    "sonnet":  {"in": 3.00, "out": 15.00},
    "opus":    {"in": 15.00, "out": 75.00},
}
USD_INR = 86.0


@dataclass
class Usage:
    in_tokens: int = 0
    out_tokens: int = 0
    provider: str = "mock"

    def cost_inr(self) -> float:
        p = PRICING.get(self.provider, PRICING["mock"])
        return (self.in_tokens / 1e6 * p["in"] + self.out_tokens / 1e6 * p["out"]) * USD_INR


@dataclass
class Completion:
    text: str
    usage: Usage
    latency_ms: int
    provider: str
    ok: bool = True
    error: str | None = None


class Provider(ABC):
    """One method to implement per real model. Keep the interface identical."""
    name: str = "base"

    @abstractmethod
    def complete(self, system: str, user: str, max_tokens: int = 1200) -> Completion:
        ...

    def _approx_tokens(self, *texts: str) -> int:
        return sum(len(t) for t in texts) // 4  # ~4 chars/token rough estimate


class MockProvider(Provider):
    """Deterministic fake model. Returns valid MIRA block-JSON so the whole
    pipeline + tests run without any API key. Quality is obviously not real —
    it's for wiring/logic testing, not answer quality."""
    name = "mock"

    def complete(self, system: str, user: str, max_tokens: int = 1200) -> Completion:
        t0 = time.time()
        seed = int(hashlib.md5(user.encode()).hexdigest(), 16)
        # Emit a small, schema-valid block array that varies a little by input.
        topic = user.strip().rstrip("?").split()[-1] if user.strip() else "concept"
        blocks = [
            {"type": "callout", "variant": "idea",
             "title": "Core idea",
             "content": f"Here is the single most important point about {topic}."},
            {"type": "compare", "columns": [
                {"header": "Naive view", "points": [f"what people assume about {topic}"]},
                {"header": "Real picture", "points": [f"what actually happens with {topic}"]},
            ]},
            {"type": "check", "mode": "mcq",
             "question": f"Quick check on {topic} — which is true?",
             "options": [{"id": "a", "label": "Option A"}, {"id": "b", "label": "Option B"}]},
        ]
        text = json.dumps(blocks)
        lat = int((time.time() - t0) * 1000) + (seed % 40)  # tiny jitter
        u = Usage(self._approx_tokens(system, user), self._approx_tokens(text), "mock")
        return Completion(text=text, usage=u, latency_ms=lat, provider="mock")


class _HTTPProvider(Provider):
    """Shared base for real HTTP providers. Subclasses set endpoint + payload.
    Uses urllib so there are zero dependencies; swap for httpx in production."""
    name = "http"
    endpoint = ""
    model_id = ""
    env_key = ""

    def _headers(self) -> dict:
        key = os.environ.get(self.env_key, "")
        return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def _payload(self, system: str, user: str, max_tokens: int) -> dict:
        # OpenAI-compatible shape; MiniMax & Qwen proxies generally accept this.
        return {
            "model": self.model_id,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }

    def _extract(self, data: dict) -> str:
        return data["choices"][0]["message"]["content"]

    def complete(self, system: str, user: str, max_tokens: int = 1200) -> Completion:
        import urllib.request
        t0 = time.time()
        body = json.dumps(self._payload(system, user, max_tokens)).encode()
        req = urllib.request.Request(self.endpoint, data=body, headers=self._headers(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            text = self._extract(data)
            usage = data.get("usage", {})
            u = Usage(
                usage.get("prompt_tokens", self._approx_tokens(system, user)),
                usage.get("completion_tokens", self._approx_tokens(text)),
                self.name,
            )
            return Completion(text=text, usage=u, latency_ms=int((time.time() - t0) * 1000),
                              provider=self.name)
        except Exception as e:  # network/auth/parse — surface for failover to handle
            return Completion(text="", usage=Usage(provider=self.name),
                              latency_ms=int((time.time() - t0) * 1000),
                              provider=self.name, ok=False, error=str(e))


class GPTProvider(_HTTPProvider):
    name = "gpt"
    endpoint = "https://api.openai.com/v1/chat/completions"
    model_id = os.environ.get("GPT_MODEL", "gpt-5.5")
    env_key = "OPENAI_API_KEY"


class MiniMaxProvider(_HTTPProvider):
    name = "minimax"
    endpoint = os.environ.get("MINIMAX_ENDPOINT", "https://api.minimax.io/v1/chat/completions")
    model_id = os.environ.get("MINIMAX_MODEL", "minimax-m2.7")
    env_key = "MINIMAX_API_KEY"


class QwenProvider(_HTTPProvider):
    name = "qwen"
    # default to an OpenAI-compatible proxy; point at your self-hosted vLLM later
    endpoint = os.environ.get("QWEN_ENDPOINT", "https://api.fireworks.ai/inference/v1/chat/completions")
    model_id = os.environ.get("QWEN_MODEL", "qwen2.5-72b-instruct")
    env_key = "QWEN_API_KEY"


# Sonnet/Opus adapters so you can A/B test answer quality as requested.
class _AnthropicProvider(Provider):
    name = "anthropic"
    model_id = ""

    def complete(self, system: str, user: str, max_tokens: int = 1200) -> Completion:
        import urllib.request
        t0 = time.time()
        body = json.dumps({
            "model": self.model_id, "max_tokens": max_tokens, "system": system,
            "messages": [{"role": "user", "content": user}],
        }).encode()
        headers = {
            "x-api-key": os.environ.get("ANTHROPIC_API_KEY", ""),
            "anthropic-version": "2023-06-01", "content-type": "application/json",
        }
        req = urllib.request.Request("https://api.anthropic.com/v1/messages",
                                     data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            text = "".join(b.get("text", "") for b in data.get("content", []))
            u = data.get("usage", {})
            usage = Usage(u.get("input_tokens", 0), u.get("output_tokens", 0), self.name)
            return Completion(text=text, usage=usage, latency_ms=int((time.time() - t0) * 1000),
                              provider=self.name)
        except Exception as e:
            return Completion(text="", usage=Usage(provider=self.name),
                              latency_ms=int((time.time() - t0) * 1000),
                              provider=self.name, ok=False, error=str(e))


class SonnetProvider(_AnthropicProvider):
    name = "sonnet"
    model_id = os.environ.get("SONNET_MODEL", "claude-sonnet-4-20250514")


class OpusProvider(_AnthropicProvider):
    name = "opus"
    model_id = os.environ.get("OPUS_MODEL", "claude-opus-4-20250514")


def build_registry(use_mock: bool = True) -> dict[str, Provider]:
    """Returns name->provider. If use_mock, every slot is the mock (for offline
    tests). Otherwise real adapters; missing keys just fail and trigger failover."""
    if use_mock:
        m = MockProvider()
        return {n: m for n in ("qwen", "minimax", "gpt", "sonnet", "opus", "mock")}
    return {
        "qwen": QwenProvider(),
        "minimax": MiniMaxProvider(),
        "gpt": GPTProvider(),
        "sonnet": SonnetProvider(),
        "opus": OpusProvider(),
        "mock": MockProvider(),
    }
