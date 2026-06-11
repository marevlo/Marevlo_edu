"""Router + failover + cache floor.

Routing  = who answers by default (cost/quality). Separate from...
Failover = who covers when a provider is DOWN (reliability).
Floor    = cache + golden answers so MIRA never shows a dead box.

The 'capability override' wins over tier: a misconception correction or a
research stress-test goes to the strong model even for a free user, because
those are 'must-not-get-this-wrong' moments (and they're rare, so affordable).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from .providers import Provider, Completion

log = logging.getLogger("mira.router")


# ----------------------------- circuit breaker -----------------------------
@dataclass
class Breaker:
    fails: int = 0
    open_until: float = 0.0
    THRESHOLD = 3
    COOLDOWN = 30.0  # seconds

    def is_open(self) -> bool:
        return time.time() < self.open_until

    def record(self, ok: bool) -> None:
        if ok:
            self.fails = 0
        else:
            self.fails += 1
            if self.fails >= self.THRESHOLD:
                self.open_until = time.time() + self.COOLDOWN
                self.fails = 0


@dataclass
class Router:
    providers: dict[str, Provider]
    breakers: dict[str, Breaker] = field(default_factory=dict)

    def _breaker(self, name: str) -> Breaker:
        return self.breakers.setdefault(name, Breaker())

    # ---------- routing: pick the default lane ----------
    # Tiers: free / day / plus / pro  (no sonnet/opus in production routing)
    def pick_lane(self, tier: str, action: str, hard: bool,
                  turns_used: int = 0, monthly_budget: int = 0) -> str:
        # capability override: misconception correction always gets the strong model
        if action in ("misconception_correction", "research_stress_test"):
            return "gpt"
        if action in ("grade", "scaffold_question"):
            return "qwen"
        # free tier is qwen-only (rare minimax handled by capability override above)
        if tier == "free":
            return "qwen"
        # paid tiers: MiniMax workhorse, GPT on hard turns — BUT the GPT share
        # slides toward MiniMax as the user's monthly volume climbs (cost control,
        # invisible to the user). Implemented in should_use_gpt().
        if hard and self.should_use_gpt(tier, turns_used, monthly_budget):
            return "gpt"
        return "minimax"

    @staticmethod
    def gpt_share(turns_used: int, low: int, high: int) -> float:
        """Linear ramp: full GPT eligibility below `low`, zero above `high`."""
        if turns_used <= low:
            return 1.0
        if turns_used >= high:
            return 0.0
        return 1.0 - (turns_used - low) / (high - low)

    def should_use_gpt(self, tier: str, turns_used: int, monthly_budget: int) -> bool:
        """As monthly volume rises, probabilistically slide hard turns from GPT to
        MiniMax. A light user gets GPT on hard turns; a heavy user is gently moved
        to MiniMax. The user never sees the swap. This protects Pro-tier margin."""
        import random as _r
        if monthly_budget <= 0:
            return True
        low = int(monthly_budget * 0.5)   # full GPT below 50% of budget
        high = int(monthly_budget * 0.9)  # no GPT above 90% of budget
        return _r.random() < self.gpt_share(turns_used, low, high)

    # ---------- failover order if the chosen lane is down ----------
    FAILOVER = {
        "gpt": ["gpt", "minimax", "qwen"],
        "minimax": ["minimax", "gpt", "qwen"],
        "qwen": ["qwen", "minimax", "gpt"],
    }

    def complete(self, lane: str, system: str, user: str, max_tokens: int = 1200) -> Completion:
        """Try the lane; on breaker-open or failure, walk the failover chain."""
        chain = self.FAILOVER.get(lane, [lane, "qwen"])
        last: Completion | None = None
        for name in chain:
            if name not in self.providers:
                continue
            br = self._breaker(name)
            if br.is_open():
                continue
            comp = self.providers[name].complete(system, user, max_tokens)
            br.record(comp.ok)
            last = comp
            if comp.ok:
                return comp
            log.warning("MIRA provider '%s' failed: %s", name, comp.error)
        # everything failed -> signal caller to use the cache/golden floor
        return last or Completion(text="", usage=None, latency_ms=0, provider="none",
                                  ok=False, error="all providers down")


# ----------------------------- cache + floor -----------------------------
@dataclass
class CacheEntry:
    blocks: list[dict]
    quality: float = 1.0
    hits: int = 0


@dataclass
class ResponseCache:
    """Tiny in-memory semantic-ish cache for the demo. In prod: Redis L1 +
    pgvector L2. Key here is (concept, depth, style) bucket."""
    store: dict[str, CacheEntry] = field(default_factory=dict)
    golden: dict[str, list[dict]] = field(default_factory=dict)  # ~200 hand-written floor

    @staticmethod
    def key(concept: str, depth: str, style: str) -> str:
        return f"{concept}|{depth}|{style}"

    def get(self, concept: str, depth: str, style: str) -> list[dict] | None:
        e = self.store.get(self.key(concept, depth, style))
        if e and e.quality >= 0.5:
            e.hits += 1
            return e.blocks
        return None

    def put(self, concept: str, depth: str, style: str, blocks: list[dict]) -> None:
        self.store[self.key(concept, depth, style)] = CacheEntry(blocks=blocks)

    def golden_answer(self, concept: str) -> list[dict] | None:
        """The never-dead floor: zero model calls, human-written."""
        return self.golden.get(concept)
