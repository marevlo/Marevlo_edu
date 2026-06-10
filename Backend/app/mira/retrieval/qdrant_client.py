"""
Vector store for MIRA retrieval.

ChunkPayload       — metadata stored alongside each chunk vector
VectorPoint        — (id, vector, payload) tuple for upserts
InMemoryVectorStore — dry-run/test store (no external service)
QdrantVectorStore   — real store (Qdrant) for production ingestion

Idempotency: upsert skips a chunk whose content_hash already exists, so
re-running ingestion on unchanged content is a no-op.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Optional


def _stable_point_id(chunk_id: str) -> int:
    """Deterministic 63-bit point ID from a chunk_id. Python's built-in hash()
    is randomized per process (PYTHONHASHSEED), which would make the same
    chunk_id map to different point IDs across runs — breaking idempotency and
    creating duplicate points. SHA-256 is stable, so re-ingesting the same chunk
    REPLACES the same point."""
    return int(hashlib.sha256(chunk_id.encode()).hexdigest()[:16], 16)


@dataclass
class ChunkPayload:
    chunk_id: str
    source_type: str            # course | problem | ...
    course_id: str
    module_id: Optional[str]
    section_id: Optional[str]
    chunk_index: int
    chunk_type: str             # prose | code | ...
    text: str
    heading_trail: list[str] = field(default_factory=list)
    content_hash: str = ""


@dataclass
class VectorPoint:
    id: str
    vector: list[float]
    payload: ChunkPayload


class VectorStore:
    """Interface the ingestion pipeline depends on."""
    async def ensure_collection(self) -> None:
        raise NotImplementedError

    async def upsert(self, ids: list[str], vectors: list[list[float]],
                     payloads: list[ChunkPayload]) -> int:
        """Returns the number of NEW/updated points written (skips unchanged
        content_hash). Idempotent."""
        raise NotImplementedError

    async def search(self, vector: list[float], top_k: int = 5,
                     course_id: Optional[str] = None) -> list[VectorPoint]:
        raise NotImplementedError


class InMemoryVectorStore(VectorStore):
    """Dry-run/test store. Keeps points in a dict keyed by chunk_id, with a
    content_hash index for idempotent upserts."""
    def __init__(self):
        self._points: dict[str, VectorPoint] = {}
        self._hashes: dict[str, str] = {}  # content_hash -> chunk_id

    async def ensure_collection(self) -> None:
        return None

    async def upsert(self, ids, vectors, payloads) -> int:
        written = 0
        for cid, vec, payload in zip(ids, vectors, payloads):
            h = payload.content_hash
            if h and self._hashes.get(h) == cid and cid in self._points:
                continue  # unchanged -> skip (idempotent)
            self._points[cid] = VectorPoint(id=cid, vector=vec, payload=payload)
            if h:
                self._hashes[h] = cid
            written += 1
        return written

    async def search(self, vector, top_k=5, course_id=None) -> list[VectorPoint]:
        import math
        def cos(a, b):
            dot = sum(x * y for x, y in zip(a, b))
            na = math.sqrt(sum(x * x for x in a)) or 1.0
            nb = math.sqrt(sum(y * y for y in b)) or 1.0
            return dot / (na * nb)
        candidates = [p for p in self._points.values()
                      if course_id is None or p.payload.course_id == course_id]
        ranked = sorted(candidates, key=lambda p: cos(vector, p.vector), reverse=True)
        return ranked[:top_k]


class QdrantVectorStore(VectorStore):
    """Real Qdrant-backed store for production ingestion."""
    def __init__(self, url: str = "http://localhost:6333",
                 collection: str = "mira_chunks", dim: int = 1536):
        self.url = url
        self.collection = collection
        self.dim = dim
        self._client = None

    def _qc(self):
        if self._client is None:
            from qdrant_client import QdrantClient  # lazy; only for real runs
            self._client = QdrantClient(url=self.url)
        return self._client

    async def ensure_collection(self) -> None:
        from qdrant_client.models import Distance, VectorParams
        qc = self._qc()
        existing = [c.name for c in qc.get_collections().collections]
        if self.collection not in existing:
            qc.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(size=self.dim, distance=Distance.COSINE))

    async def upsert(self, ids, vectors, payloads) -> int:
        from qdrant_client.models import PointStruct
        qc = self._qc()
        points = [
            PointStruct(id=_stable_point_id(cid), vector=vec,
                        payload={**payload.__dict__})
            for cid, vec, payload in zip(ids, vectors, payloads)
        ]
        qc.upsert(collection_name=self.collection, points=points)
        return len(points)

    async def search(self, vector, top_k=5, course_id=None) -> list[VectorPoint]:
        qc = self._qc()
        flt = None
        if course_id:
            from qdrant_client.models import FieldCondition, Filter, MatchValue
            flt = Filter(must=[FieldCondition(key="course_id",
                                              match=MatchValue(value=course_id))])
        hits = qc.search(collection_name=self.collection, query_vector=vector,
                         limit=top_k, query_filter=flt)
        out = []
        for h in hits:
            p = h.payload or {}
            out.append(VectorPoint(id=str(h.id), vector=vector,
                                   payload=ChunkPayload(**{k: p.get(k) for k in
                                       ("chunk_id", "source_type", "course_id",
                                        "module_id", "section_id", "chunk_index",
                                        "chunk_type", "text", "heading_trail",
                                        "content_hash") if k in p})))
        return out
