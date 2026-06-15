"""Knowledge base — open-domain concept matching + semantic domain guard.

This REPLACES the hardcoded 7-concept LATTICE. A real user asks anything; this
matches an open vocabulary of questions to the closest known concept by EMBEDDING
similarity (so "how do I stop my gradients blowing up" matches gradient_problems
even though it shares no words with the concept id), and REJECTS questions that
aren't about AI/ML/DS/DSA at all.

Loaded from data/concepts.json at startup. Grow the domain by editing that file
or moving it to Postgres — no code change. Concept embeddings are computed once
at boot (and should be cached/persisted in production; see persistence.py).
"""
from __future__ import annotations

import os
import json
from dataclasses import dataclass, field
from functools import lru_cache

from .embeddings import Embedder, build_embedder, cosine


@dataclass
class Concept:
    id: str
    domain: str
    aliases: list[str]
    prereqs: list[str]
    embedding: list[float] = field(default_factory=list)


@dataclass
class MatchResult:
    concept_id: str
    score: float          # cosine similarity to the best concept
    in_domain: bool       # did it clear the domain threshold?
    domain: str


class KnowledgeBase:
    """Holds all concepts + their embeddings; does matching and domain-guarding.

    Two thresholds (tunable via env), the core knobs:
      DOMAIN_THRESHOLD  — below this top-similarity, the question is OFF-DOMAIN
                          (reject politely). This is the open-world guard.
      Matching always returns the argmax concept above the domain threshold.

    Issue #17: 0.28 was calibrated against the LOCAL HASH embedder. A real
    embedder (OpenAI text-embedding-3-small, bge/e5) has a very different
    similarity distribution, so this MUST be retuned once real embeddings are
    enabled — otherwise the guard either accepts everything or rejects valid
    questions. The value is env-overridable (MIRA_DOMAIN_THRESHOLD) so it can
    be retuned without a deploy.
    TODO(eval): when EMBED_BACKEND != local, run the domain eval set and set
    MIRA_DOMAIN_THRESHOLD from the in/out-of-domain separation point. Do NOT
    rely on the 0.28 default with a real backend.
    """
    DOMAIN_THRESHOLD = float(os.environ.get(
        "MIRA_DOMAIN_THRESHOLD",
        # default depends on the active embedder: the hash embedder needs the
        # historically-calibrated 0.28; a real backend gets a conservative
        # placeholder that the eval above must replace.
        "0.28" if os.environ.get("EMBED_BACKEND", "").lower() in ("", "local")
        else "0.35"))

    def __init__(self, embedder: Embedder | None = None, concepts_path: str | None = None,
                 entries: list[dict] | None = None):
        self.embedder = embedder or build_embedder()
        self.concepts: dict[str, Concept] = {}
        if entries is not None:
            # build directly from provided concept entries (e.g. a course lattice);
            # fall back to built-ins only if the provided list is empty.
            self._load_entries(entries or self._BUILTIN)
        else:
            self._load(concepts_path or _default_path())
        self._embed_all()

    # Built-in fallback lattice so the engine always boots, even before any
    # concepts.json has been authored. Production replaces with the real ~140
    # AI/ML/DS/DSA + technical-learning concept graph.
    _BUILTIN: list[dict] = [
        {"id": "transformer", "domain": "ai",
         "aliases": ["transformer", "attention is all you need", "self-attention model"],
         "prereqs": ["attention", "neural_network"]},
        {"id": "attention", "domain": "ai",
         "aliases": ["attention", "self-attention", "qkv", "query key value"],
         "prereqs": ["embedding"]},
        {"id": "embedding", "domain": "ai",
         "aliases": ["embedding", "vector representation", "dense vector"], "prereqs": []},
        {"id": "neural_network", "domain": "ml",
         "aliases": ["neural network", "deep learning", "mlp", "forward pass"], "prereqs": []},
        {"id": "backprop", "domain": "ml",
         "aliases": ["backprop", "backpropagation", "chain rule gradient"], "prereqs": ["neural_network"]},
        {"id": "gradient_descent", "domain": "ml",
         "aliases": ["gradient descent", "sgd", "adam optimizer"], "prereqs": ["backprop"]},
        {"id": "overfitting", "domain": "ml",
         "aliases": ["overfitting", "generalization", "regularization"], "prereqs": []},
        {"id": "rag", "domain": "ai",
         "aliases": ["rag", "retrieval augmented", "retrieval-augmented generation"], "prereqs": ["embedding"]},
        {"id": "chunking", "domain": "ai",
         "aliases": ["chunking", "chunk size", "text splitting"], "prereqs": ["rag"]},
        {"id": "lora", "domain": "ai",
         "aliases": ["lora", "low-rank adaptation", "fine-tuning adapter"], "prereqs": ["transformer"]},
        {"id": "sparse_autoencoder", "domain": "ai",
         "aliases": ["sparse autoencoder", "sae", "monosemantic features", "interpretability"],
         "prereqs": ["neural_network"]},
        {"id": "isolation_forest", "domain": "ml",
         "aliases": ["isolation forest", "anomaly detection", "outlier"], "prereqs": []},
        {"id": "binary_search", "domain": "dsa",
         "aliases": ["binary search", "search sorted", "logn search"], "prereqs": []},
        {"id": "dynamic_programming", "domain": "dsa",
         "aliases": ["dynamic programming", "dp", "memoization", "bottom up"], "prereqs": []},
        {"id": "graph_bfs", "domain": "dsa",
         "aliases": ["bfs", "breadth first", "shortest path unweighted"], "prereqs": []},
        {"id": "graph_dfs", "domain": "dsa",
         "aliases": ["dfs", "depth first", "recursion graph"], "prereqs": []},
    ]

    def _load(self, path: str) -> None:
        try:
            with open(path) as f:
                data = json.load(f)
            entries = data["concepts"]
        except (FileNotFoundError, KeyError, json.JSONDecodeError):
            entries = self._BUILTIN
        self._load_entries(entries)

    def _load_entries(self, entries: list[dict]) -> None:
        """Populate concepts from entry dicts. Accepts BOTH shapes:
          - engine native:   {id, domain, aliases, prereqs}
          - ingestion lattice:{id, name, keywords, prerequisites, difficulty}
        so a lattice from mira_concept_lattices loads directly."""
        for c in entries:
            cid = c["id"]
            aliases = c.get("aliases")
            if aliases is None:
                aliases = list(c.get("keywords", []))
                name = c.get("name")
                if name and name.lower() not in [a.lower() for a in aliases]:
                    aliases = [name] + aliases
                if not aliases:
                    aliases = [cid.replace("-", " ").replace("_", " ")]
            prereqs = c.get("prereqs", c.get("prerequisites", []))
            domain = c.get("domain", "course")
            self.concepts[cid] = Concept(
                id=cid, domain=domain, aliases=aliases, prereqs=prereqs)

    def _embed_all(self) -> None:
        """Embed each concept once, in ONE batched call.

        Issue #6: the old per-concept loop made 115 serial HTTP calls with a
        real embedder (30-60s first request), and any failure propagated as a
        raw 500. Now: one embed_batch call; on failure, concepts keep empty
        embeddings and match() degrades to 'general' instead of crashing."""
        items = list(self.concepts.values())
        texts = [c.id.replace("_", " ") + " " + " ".join(c.aliases) for c in items]
        try:
            vecs = self.embedder.embed_batch(texts)
            for c, v in zip(items, vecs):
                c.embedding = v
        except Exception:
            import logging
            logging.getLogger("mira.kb").exception(
                "concept embedding failed (%s backend) — KB will match as "
                "'general' until embeddings succeed", self.embedder.name)

    def match(self, question: str) -> MatchResult:
        """Embed the question, return the closest concept + whether it's in-domain.

        Issue #6: an embedding-provider failure (rate limit, outage, bad key)
        must never propagate as a raw 500 — degrade to the open 'general'
        concept; the intent classifier still owns the domain decision."""
        try:
            q = self.embedder.embed(question)
        except Exception:
            import logging
            logging.getLogger("mira.kb").warning(
                "question embedding failed (%s backend) — degrading to "
                "concept='general'", self.embedder.name)
            return MatchResult(concept_id="general", score=0.0,
                               in_domain=False, domain="none")
        best_id, best_score = "general", -1.0
        for c in self.concepts.values():
            s = cosine(q, c.embedding)
            if s > best_score:
                best_id, best_score = c.id, s
        in_domain = best_score >= self.DOMAIN_THRESHOLD
        dom = self.concepts[best_id].domain if best_id in self.concepts else "none"
        return MatchResult(concept_id=best_id if in_domain else "general",
                           score=round(best_score, 3), in_domain=in_domain, domain=dom)

    def prereqs_of(self, concept_id: str) -> list[str]:
        c = self.concepts.get(concept_id)
        return c.prereqs if c else []

    def has_prereqs(self, concept_id: str) -> bool:
        return bool(self.prereqs_of(concept_id))

    def exists(self, concept_id: str) -> bool:
        return concept_id in self.concepts

    def all_in_domain(self, concept_id: str) -> str:
        c = self.concepts.get(concept_id)
        return c.domain if c else "none"


def _default_path() -> str:
    return os.path.join(os.path.dirname(__file__), "data", "concepts.json")


# A single shared KB instance per process (built once at startup). Cheap to hold;
# embeddings are computed once. In a multi-worker deploy each worker builds its own,
# OR (better) loads precomputed concept vectors from pgvector — see persistence.py.
@lru_cache(maxsize=1)
def get_kb() -> KnowledgeBase:
    return KnowledgeBase()


# Per-course KB cache. Each course's concept lattice (from mira_concept_lattices)
# is loaded once and reused. This is what makes MIRA actually use Marevlo course
# concepts at runtime instead of the built-in fallback.
# Issue #12: bounded (each entry holds a full embedding set). Oldest course is
# evicted past the cap; re-ingestion still calls clear_course_kb_cache().
_COURSE_KB_CACHE: "OrderedDict[str, KnowledgeBase]" = None  # set below
_COURSE_KB_MAX = int(os.environ.get("MIRA_COURSE_KB_CACHE_MAX", "32"))


def get_course_kb(db, course_id: str) -> KnowledgeBase:
    """Build (and cache) a KnowledgeBase from the concept lattices stored for
    `course_id`. Falls back to the global built-in KB if the course has no
    lattices yet (e.g. before ingestion has run)."""
    global _COURSE_KB_CACHE
    if _COURSE_KB_CACHE is None:
        from collections import OrderedDict
        _COURSE_KB_CACHE = OrderedDict()
    if course_id in _COURSE_KB_CACHE:
        _COURSE_KB_CACHE.move_to_end(course_id)  # mark recently used
        return _COURSE_KB_CACHE[course_id]
    entries: list[dict] = []
    try:
        from sqlalchemy import select
        from app.mira.models.db_models import MiraConceptLattice
        rows = db.execute(
            select(MiraConceptLattice).where(MiraConceptLattice.course_id == course_id)
        ).scalars().all()
        for r in rows:
            for c in (r.lattice or {}).get("concepts", []):
                # tag with course so domain isn't 'none'
                c.setdefault("domain", "course")
                entries.append(c)
    except Exception:
        entries = []
    if not entries:
        # no lattice for this course yet -> use the global KB (built-ins)
        return get_kb()
    kb = KnowledgeBase(entries=entries)
    _COURSE_KB_CACHE[course_id] = kb
    while len(_COURSE_KB_CACHE) > _COURSE_KB_MAX:
        _COURSE_KB_CACHE.popitem(last=False)  # drop least-recently-used
    return kb


def clear_course_kb_cache() -> None:
    """Call after re-ingesting a course so the new lattice is picked up."""
    if _COURSE_KB_CACHE is not None:
        _COURSE_KB_CACHE.clear()
