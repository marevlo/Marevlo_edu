"""Embedding layer — pluggable, with a local fallback so the system always boots.

Concept matching and domain-guarding both need real semantic embeddings in
production (an open-vocabulary user question must match a concept it doesn't
literally contain — "how do I stop my gradients exploding" -> "gradient_clipping").

Design: one interface, three backends.
  - OpenAIEmbedder      (text-embedding-3-small): production default, cheap, good.
  - SelfHostedEmbedder  (any OpenAI-compatible /embeddings endpoint, e.g. a
                         bge/e5 model on your own GPU): cheapest at scale.
  - LocalHashEmbedder   (deterministic, no network): so the service runs and is
                         testable WITHOUT keys. NOT for production quality — it's
                         a structural placeholder, clearly marked.

Switch via env: EMBED_BACKEND=openai|selfhosted|local  (default: local if no key).
"""
from __future__ import annotations

import os
import math
import hashlib
from abc import ABC, abstractmethod
from functools import lru_cache


class Embedder(ABC):
    dim: int = 0
    name: str = "base"

    @abstractmethod
    def embed(self, text: str) -> list[float]:
        ...

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class LocalHashEmbedder(Embedder):
    """Deterministic bag-of-character-ngrams embedding. No network, no keys.
    Good enough to exercise matching/guard LOGIC end-to-end and to run tests.
    Replace with a real embedder in production via EMBED_BACKEND."""
    name = "local"

    def __init__(self, dim: int = 1536):
        # 1536 matches the production schema (OpenAI text-embedding-3-small) so
        # dev and prod use the same pgvector dimension. The hashing fills a
        # sparse vector regardless of dim.
        self.dim = dim

    def embed(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        toks = _tokens(text)
        for tok in toks:
            # word-level
            h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
            v[h % self.dim] += 1.0
            # char trigrams capture morphology (gradient/gradients/grad)
            for i in range(len(tok) - 2):
                tri = tok[i:i + 3]
                h2 = int(hashlib.md5(tri.encode()).hexdigest(), 16)
                v[h2 % self.dim] += 0.5
        n = math.sqrt(sum(x * x for x in v))
        return [x / n for x in v] if n else v


class _OpenAICompatibleEmbedder(Embedder):
    """Shared HTTP impl for OpenAI and any OpenAI-compatible /embeddings endpoint."""
    endpoint = ""
    model_id = ""
    env_key = ""

    def __init__(self, dim: int):
        self.dim = dim

    def embed(self, text: str) -> list[float]:
        return self.embed_batch([text])[0]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        import urllib.request, json
        key = os.environ.get(self.env_key, "")
        body = json.dumps({"model": self.model_id, "input": texts}).encode()
        req = urllib.request.Request(
            self.endpoint, data=body, method="POST",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return [item["embedding"] for item in data["data"]]


class OpenAIEmbedder(_OpenAICompatibleEmbedder):
    name = "openai"
    endpoint = "https://api.openai.com/v1/embeddings"
    model_id = os.environ.get("EMBED_MODEL", "text-embedding-3-small")
    env_key = "OPENAI_API_KEY"

    def __init__(self):
        super().__init__(dim=1536)


class SelfHostedEmbedder(_OpenAICompatibleEmbedder):
    name = "selfhosted"
    endpoint = os.environ.get("EMBED_ENDPOINT", "http://localhost:8001/v1/embeddings")
    model_id = os.environ.get("EMBED_MODEL", "bge-base-en-v1.5")
    env_key = "EMBED_API_KEY"

    def __init__(self):
        super().__init__(dim=int(os.environ.get("EMBED_DIM", "768")))


def build_embedder() -> Embedder:
    backend = os.environ.get("EMBED_BACKEND", "").lower()
    if backend == "openai" or (not backend and os.environ.get("OPENAI_API_KEY")):
        return OpenAIEmbedder()
    if backend == "selfhosted":
        return SelfHostedEmbedder()
    return LocalHashEmbedder()


def _tokens(text: str) -> list[str]:
    import re
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 1]
