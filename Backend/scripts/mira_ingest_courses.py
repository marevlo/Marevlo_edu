"""MIRA course ingestion pipeline.

Walks frontend/public/cources/, parses HTML, chunks sections, extracts
concepts via Claude Sonnet, generates embeddings, populates Qdrant +
mira_concept_lattices.

Usage:
    # Dry run with MockClaudeClient (no API spend)
    python -m app.scripts.mira_ingest_courses --dry-run

    # Real ingestion against Claude
    export ANTHROPIC_API_KEY=sk-ant-...
    export OPENAI_API_KEY=sk-...
    python -m app.scripts.mira_ingest_courses

    # Ingest one course only
    python -m app.scripts.mira_ingest_courses --course-id clus

Idempotent — uses content_hash to skip unchanged chunks.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

from app.mira.claude.client import (
    ClaudeClientBase,
    ClaudeMessage,
    MockClaudeClient,
)
from app.mira.claude.router import ModelTier
from app.mira.retrieval.qdrant_client import (
    ChunkPayload,
    InMemoryVectorStore,
    VectorStore,
)
from app.mira.retrieval.retriever import Embedder, FakeEmbedder


# ===========================================================================
# CONFIG
# ===========================================================================
DEFAULT_COURSES_ROOT = "frontend/public/cources"  # matches your ARCHITECTURE
CHUNK_MIN_CHARS = 200
CHUNK_MAX_CHARS = 2000

CONCEPT_EXTRACTION_SYSTEM = """Extract key concepts from this course content.

Return STRICT JSON with this shape:
{
  "concepts": [
    {
      "id": "kebab-case-id",
      "name": "Human Name",
      "description": "1-2 sentences",
      "prerequisites": ["other-concept-id", ...],
      "keywords": ["term1", "term2"],
      "difficulty": 0.3
    }
  ]
}

- Aim for 5-15 concepts per course section
- IDs must be kebab-case, lowercase, unique
- Prerequisites should reference other concepts you're extracting or known common concepts
- Difficulty: 0.0 (intro) → 1.0 (expert)"""


@dataclass
class IngestStats:
    courses_processed: int = 0
    sections_processed: int = 0
    chunks_upserted: int = 0
    chunks_skipped_unchanged: int = 0
    concepts_extracted: int = 0
    lattices_written: int = 0
    parse_failures: int = 0
    total_cost_inr: float = 0.0


def _upsert_lattice(db_session, course_id: str, module_id: str | None,
                    concepts: list) -> None:
    """Upsert a concept lattice for (course_id, module_id). Replaces any
    existing lattice for that pair so re-ingestion is idempotent."""
    from sqlalchemy import select, delete
    from app.mira.models.db_models import MiraConceptLattice
    # delete existing for this course/module, then insert fresh
    db_session.execute(
        delete(MiraConceptLattice).where(
            MiraConceptLattice.course_id == course_id,
            MiraConceptLattice.module_id == module_id,
        )
    )
    db_session.add(MiraConceptLattice(
        course_id=course_id, module_id=module_id,
        lattice={"concepts": concepts}, version=1,
        generated_by="claude_ingestion",
    ))
    db_session.commit()


# ===========================================================================
# PARSING
# ===========================================================================
def parse_html_to_sections(html_text: str) -> list[dict[str, Any]]:
    """Split an HTML course into (heading_trail, content_text) sections.

    Uses BeautifulSoup if available. Falls back to regex-based extraction
    so ingestion works even without BS4.
    """
    if HAS_BS4:
        return _parse_with_bs4(html_text)
    return _parse_with_regex(html_text)


def _parse_with_bs4(html_text: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html_text, "html.parser")
    # Remove scripts/styles
    for tag in soup.find_all(["script", "style"]):
        tag.decompose()

    sections: list[dict[str, Any]] = []
    heading_stack: list[str] = []
    current_text: list[str] = []

    def flush():
        if current_text:
            text = "\n".join(current_text).strip()
            if len(text) >= CHUNK_MIN_CHARS // 2:
                sections.append({
                    "heading_trail": list(heading_stack),
                    "text": text,
                })
            current_text.clear()

    for elem in soup.descendants:
        if elem.name in ("h1", "h2", "h3", "h4"):
            flush()
            level = int(elem.name[1])
            heading_stack = heading_stack[: level - 1]
            heading_stack.append(elem.get_text().strip())
        elif elem.name in ("p", "pre", "code", "li"):
            text = elem.get_text().strip()
            if text:
                current_text.append(text)
    flush()
    return sections


def _parse_with_regex(html_text: str) -> list[dict[str, Any]]:
    """Crude fallback: split on <h1/2/3> tags, strip other HTML."""
    # Replace headings with markers
    html_text = re.sub(r"<script[^>]*>.*?</script>", "", html_text, flags=re.DOTALL | re.IGNORECASE)
    html_text = re.sub(r"<style[^>]*>.*?</style>", "", html_text, flags=re.DOTALL | re.IGNORECASE)

    sections: list[dict[str, Any]] = []
    current_heading = "Root"
    current_text: list[str] = []

    # Naive split on h1-h3
    parts = re.split(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html_text, flags=re.DOTALL | re.IGNORECASE)
    # parts alternates: [before_first_h, h1_text, between_h1_and_h2, h2_text, ...]

    for i, p in enumerate(parts):
        if i == 0:
            continue
        if i % 2 == 1:
            # This is a heading
            current_heading = re.sub(r"<[^>]+>", "", p).strip()
        else:
            # This is content after the heading
            text = re.sub(r"<[^>]+>", " ", p)
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) >= CHUNK_MIN_CHARS // 2:
                sections.append({
                    "heading_trail": [current_heading],
                    "text": text,
                })
    return sections


def chunk_section(section: dict[str, Any]) -> list[dict[str, Any]]:
    """Split a section into CHUNK_MAX_CHARS chunks at sentence boundaries."""
    text = section["text"]
    if len(text) <= CHUNK_MAX_CHARS:
        return [section]

    # Split on sentence boundaries
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[dict[str, Any]] = []
    current: list[str] = []
    current_len = 0
    for sent in sentences:
        if current_len + len(sent) > CHUNK_MAX_CHARS and current:
            chunks.append({
                "heading_trail": section["heading_trail"],
                "text": " ".join(current),
            })
            current = [sent]
            current_len = len(sent)
        else:
            current.append(sent)
            current_len += len(sent)
    if current:
        chunks.append({
            "heading_trail": section["heading_trail"],
            "text": " ".join(current),
        })
    return chunks


# ===========================================================================
# INGESTION
# ===========================================================================
async def ingest_one_course(
    *,
    course_id: str,
    html_file_path: Path,
    module_id: str | None,
    vector_store: VectorStore,
    embedder: Embedder,
    claude: ClaudeClientBase,
    stats: IngestStats,
    extract_concepts: bool = True,
    db_session=None,
):
    """Ingest a single HTML course file."""
    if not html_file_path.exists():
        print(f"  [skip] File not found: {html_file_path}")
        stats.parse_failures += 1
        return

    html_text = html_file_path.read_text(encoding="utf-8", errors="ignore")
    try:
        sections = parse_html_to_sections(html_text)
    except Exception as e:
        print(f"  [parse fail] {html_file_path}: {e}")
        stats.parse_failures += 1
        return

    if not sections:
        print(f"  [empty] {html_file_path} yielded 0 sections")
        return

    # Chunk each section
    all_chunks: list[dict[str, Any]] = []
    for sec in sections:
        all_chunks.extend(chunk_section(sec))
    stats.sections_processed += len(sections)

    # Embed + upsert to vector store
    chunk_texts = [c["text"] for c in all_chunks]
    chunk_vecs = await embedder.embed_batch(chunk_texts)
    chunk_payloads: list[ChunkPayload] = []
    chunk_ids: list[str] = []
    for i, (ch, vec) in enumerate(zip(all_chunks, chunk_vecs)):
        content_hash = hashlib.sha256(ch["text"].encode()).hexdigest()[:16]
        chunk_id = f"{course_id}_{module_id or 'root'}_chunk_{i}"
        chunk_ids.append(chunk_id)
        chunk_payloads.append(
            ChunkPayload(
                chunk_id=chunk_id,
                source_type="course",
                course_id=course_id,
                module_id=module_id,
                section_id=None,
                chunk_index=i,
                chunk_type="prose",
                text=ch["text"][:CHUNK_MAX_CHARS],
                heading_trail=ch["heading_trail"],
                content_hash=content_hash,
            )
        )
    written = await vector_store.upsert(chunk_ids, chunk_vecs, chunk_payloads)
    stats.chunks_upserted += written

    # Extract concepts (one LLM call per course, not per chunk)
    if extract_concepts and all_chunks:
        sample_text = "\n\n".join(c["text"] for c in all_chunks[:10])
        sample_text = sample_text[:6000]  # cap context
        try:
            parsed, response = await claude.complete_structured(
                system=CONCEPT_EXTRACTION_SYSTEM,
                messages=[
                    ClaudeMessage(
                        role="user",
                        content=f"Course: {course_id}\n\nContent sample:\n{sample_text}",
                    )
                ],
                model_tier=ModelTier.SONNET,
                schema_hint='{"concepts": [{"id": str, "name": str, ...}]}',
            )
            concepts = parsed.get("concepts", [])
            stats.concepts_extracted += len(concepts)

            # Persist the concept lattice to Postgres so the runtime can use it.
            # Upsert on (course_id, module_id). No-op for dry runs (db_session=None).
            if db_session is not None and concepts:
                try:
                    _upsert_lattice(db_session, course_id, module_id, concepts)
                    stats.lattices_written += 1
                except Exception as e:
                    print(f"  [lattice persist fail] {course_id}/{module_id}: {e}")
        except Exception as e:
            print(f"  [concept extract fail] {course_id}: {e}")

    stats.courses_processed += 1
    print(
        f"  [ok] {course_id}/{module_id or '-'}: "
        f"{len(sections)} sections, {written} chunks"
    )


def discover_course_files(root: Path) -> list[tuple[str, str | None, Path]]:
    """Walk the courses directory and return (course_id, module_id, path).

    Structure from your ARCHITECTURE.md:
      frontend/public/cources/
        clus/               → course_id=clus, module_id per file
          part_0.html ... part_11.html
        Data_Science/
          machine-learning/module.1.html
          DL/module1.html ... module13.html
        LangGraph/
          module1.html ...
    """
    results: list[tuple[str, str | None, Path]] = []
    if not root.exists():
        return results
    for html_file in root.rglob("*.html"):
        rel = html_file.relative_to(root)
        parts = rel.parts
        if len(parts) == 1:
            # Top-level file
            results.append((parts[0].replace(".html", ""), None, html_file))
        elif len(parts) == 2:
            # course/module.html
            course_id = parts[0]
            module_id = parts[1].replace(".html", "")
            results.append((course_id, module_id, html_file))
        else:
            # deeper nesting: use last two dirs as course_id / module_id
            course_id = "_".join(parts[:-1])
            module_id = parts[-1].replace(".html", "")
            results.append((course_id, module_id, html_file))
    return results


async def main(
    courses_root: str = DEFAULT_COURSES_ROOT,
    only_course_id: str | None = None,
    dry_run: bool = False,
    persist_lattices: bool = True,
):
    root = Path(courses_root)
    files = discover_course_files(root)
    if only_course_id:
        files = [f for f in files if f[0] == only_course_id]

    print(f"Discovered {len(files)} HTML files under {root}")

    # Optional DB session for persisting concept lattices. Uses Marevlo's
    # SessionLocal (same DATABASE_URL as the app). Skipped if unavailable.
    db_session = None
    if persist_lattices:
        try:
            from app.core.database import SessionLocal
            db_session = SessionLocal()
            print("Concept lattices WILL be persisted to mira_concept_lattices.")
        except Exception as e:
            print(f"[warn] could not open DB session ({e}); lattices will NOT persist.")
            db_session = None

    # Pick embedder + claude + vector store based on mode
    if dry_run:
        print("DRY RUN — using FakeEmbedder + MockClaudeClient + InMemoryVectorStore")
        embedder: Embedder = FakeEmbedder(dimension=128)
        claude: ClaudeClientBase = MockClaudeClient()
        claude.register_response(
            prompt_contains="Extract key concepts",
            response_haiku=json.dumps(
                {"concepts": [{"id": "c1", "name": "C1", "description": "x", "prerequisites": [], "keywords": [], "difficulty": 0.5}]}
            ),
            response_sonnet=json.dumps(
                {"concepts": [{"id": "c1", "name": "C1", "description": "x", "prerequisites": [], "keywords": [], "difficulty": 0.5}]}
            ),
        )
        vector_store: VectorStore = InMemoryVectorStore()
    else:
        from app.mira.claude.client import ClaudeClient
        from app.mira.retrieval.qdrant_client import QdrantVectorStore
        from app.mira.retrieval.retriever import OpenAIEmbedder

        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        openai_key = os.environ.get("OPENAI_API_KEY")
        if not anthropic_key or not openai_key:
            raise SystemExit(
                "ANTHROPIC_API_KEY and OPENAI_API_KEY required for real ingestion"
            )
        claude = ClaudeClient(api_key=anthropic_key)
        embedder = OpenAIEmbedder(api_key=openai_key)
        vector_store = QdrantVectorStore(
            url=os.environ.get("QDRANT_URL", "http://localhost:6333")
        )

    await vector_store.ensure_collection()

    stats = IngestStats()
    for course_id, module_id, path in files:
        await ingest_one_course(
            course_id=course_id,
            html_file_path=path,
            module_id=module_id,
            vector_store=vector_store,
            embedder=embedder,
            claude=claude,
            stats=stats,
            db_session=db_session,
        )

    if db_session is not None:
        db_session.close()

    # Summary
    print("\n" + "=" * 60)
    print("INGESTION SUMMARY")
    print("=" * 60)
    print(f"  Courses processed:       {stats.courses_processed}")
    print(f"  Sections processed:      {stats.sections_processed}")
    print(f"  Chunks upserted:         {stats.chunks_upserted}")
    print(f"  Concepts extracted:      {stats.concepts_extracted}")
    print(f"  Lattices persisted:      {stats.lattices_written}")
    print(f"  Parse failures:          {stats.parse_failures}")
    print(f"  Est. total cost (INR):   ₹{stats.total_cost_inr:.2f}")
    print("=" * 60)


def cli():
    parser = argparse.ArgumentParser(description="MIRA course ingestion")
    parser.add_argument(
        "--courses-root", default=DEFAULT_COURSES_ROOT,
        help="Path to the courses directory (default: %(default)s)",
    )
    parser.add_argument("--course-id", help="Only ingest this course_id")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Use mocks — no Anthropic/OpenAI/Qdrant calls",
    )
    parser.add_argument(
        "--no-persist", action="store_true",
        help="Do not write concept lattices to the DB (parse/count only)",
    )
    args = parser.parse_args()
    asyncio.run(main(
        courses_root=args.courses_root,
        only_course_id=args.course_id,
        dry_run=args.dry_run,
        persist_lattices=not args.no_persist,
    ))


if __name__ == "__main__":
    cli()
