"""
Embedders for MIRA's retrieval pipeline.

FakeEmbedder    — deterministic hash-based vectors for dry runs/tests (no spend)
OpenAIEmbedder  — text-embedding-3-small (1536-dim) for real ingestion

Both expose `embed_batch(texts) -> list[list[float]]` and `embed(text)`.
"""
from __future__ import annotations

import hashlib
import math


class Embedder:
    """Interface the ingestion pipeline depends on."""
    dimension: int = 1536

    async def embed(self, text: str) -> list[float]:
        raise NotImplementedError

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [await self.embed(t) for t in texts]


class FakeEmbedder(Embedder):
    """Deterministic, dependency-free embeddings for dry runs/tests. Same text
    always maps to the same vector, so content_hash dedup is testable."""
    def __init__(self, dimension: int = 1536):
        self.dimension = dimension

    async def embed(self, text: str) -> list[float]:
        # hash the text into a fixed-length pseudo-vector, then L2-normalize
        vec = [0.0] * self.dimension
        for token in text.lower().split():
            h = int(hashlib.md5(token.encode()).hexdigest(), 16)
            idx = h % self.dimension
            vec[idx] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


class OpenAIEmbedder(Embedder):
    """Real embeddings via OpenAI text-embedding-3-small (1536-dim)."""
    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self.api_key = api_key
        self.model = model
        self.dimension = 1536

    async def embed(self, text: str) -> list[float]:
        out = await self.embed_batch([text])
        return out[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        import httpx  # lazy; only needed for real runs
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}",
                         "Content-Type": "application/json"},
                json={"model": self.model, "input": texts})
            resp.raise_for_status()
            data = resp.json()
        return [item["embedding"] for item in data["data"]]
