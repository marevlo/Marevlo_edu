"""
MIRA document service — ingest (PDF -> pages -> chunks -> ONE batched embed
call -> store) and retrieve (cosine top-k with page citations).

Design decisions, stated so they can be challenged later:

  * ONE embed_batch call per ingest (issue #6 lesson: N serial HTTP embed
    calls was the original 30-60s first-request bug — never reintroduce it).
  * Ingestion never charges tokens/credits. It is bounded instead:
    per-plan document count (MIRA_DOC_LIMIT_*), file size (MIRA_DOC_MAX_MB),
    page count (MIRA_DOC_MAX_PAGES). The chat turn that USES the doc charges
    normally — the cost lives where the model spend happens.
  * Degrade, don't 500 (issue #6 pattern): if the embedder fails mid-ingest,
    chunks are stored with empty embeddings and retrieval falls back to
    keyword overlap scoring, so the feature is degraded but alive.
  * Same store serves course-lesson grounding: ingest_text(scope="course",
    owner_key=course_id) — uploaded-paper Q&A and "answer from Lesson 7" are
    one retrieval substrate.
"""
from __future__ import annotations

import hashlib
import io
import logging
import re

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.mira.engine.embeddings import build_embedder, cosine
from app.mira.models.documents import MiraDocChunk, MiraDocument

log = logging.getLogger("mira.documents")

# ── chunking parameters ────────────────────────────────────────────────────
# ~1400 chars ≈ 350 tokens per chunk; 200-char overlap preserves sentence
# continuity across boundaries. TOP_K=6 -> ~2.1k tokens of grounding, well
# inside the prompt budget next to page_context (8k chars) + history.
CHUNK_CHARS = 1400
CHUNK_OVERLAP = 200
TOP_K = 6

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+|\n{2,}")


class DocError(Exception):
    """User-facing ingest/retrieve error. .status carries the HTTP code."""

    def __init__(self, msg: str, status: int = 400):
        super().__init__(msg)
        self.status = status


# ── plan limits ────────────────────────────────────────────────────────────

def doc_limit_for_plan(plan: str) -> int:
    s = get_settings()
    return {
        "free": int(getattr(s, "MIRA_DOC_LIMIT_FREE", 1)),
        "plus": int(getattr(s, "MIRA_DOC_LIMIT_PLUS", 5)),
        "pro": int(getattr(s, "MIRA_DOC_LIMIT_PRO", 20)),
        "day": int(getattr(s, "MIRA_DOC_LIMIT_FREE", 1)),
    }.get(plan, int(getattr(s, "MIRA_DOC_LIMIT_FREE", 1)))


# ── extraction ─────────────────────────────────────────────────────────────

def extract_pdf_pages(data: bytes) -> list[str]:
    """PDF bytes -> list of page texts. Raises DocError on unreadable/encrypted
    input and on scanned PDFs with no text layer (OCR is out of scope — that's
    the image/vision phase, deliberately sequenced later)."""
    s = get_settings()
    max_mb = float(getattr(s, "MIRA_DOC_MAX_MB", 10))
    if len(data) > max_mb * 1024 * 1024:
        raise DocError(f"File too large (max {max_mb:.0f} MB).", 413)
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        if getattr(reader, "is_encrypted", False):
            try:
                reader.decrypt("")  # blank-password PDFs are common exports
            except Exception:
                raise DocError("This PDF is password-protected.", 400)
        max_pages = int(getattr(s, "MIRA_DOC_MAX_PAGES", 100))
        if len(reader.pages) > max_pages:
            raise DocError(f"PDF has {len(reader.pages)} pages (max {max_pages}).", 413)
        pages = []
        for p in reader.pages:
            try:
                pages.append(p.extract_text() or "")
            except Exception:
                pages.append("")
    except DocError:
        raise
    except Exception:
        raise DocError("Could not read this PDF.", 400)
    if not any(t.strip() for t in pages):
        raise DocError(
            "No selectable text found — this looks like a scanned PDF. "
            "Image/OCR support is coming; for now please upload a text PDF.", 422)
    return pages


# ── chunking ───────────────────────────────────────────────────────────────

def chunk_pages(pages: list[str], chunk_chars: int = CHUNK_CHARS,
                overlap: int = CHUNK_OVERLAP) -> list[dict]:
    """Sentence-aware sliding window across the page stream. Each chunk keeps
    the page range it spans so answers can cite '(p. 3)'."""
    # flatten to (sentence, page) preserving order
    sents: list[tuple[str, int]] = []
    for pno, text in enumerate(pages, start=1):
        for s in _SENT_SPLIT.split(text or ""):
            s = s.strip()
            if s:
                sents.append((s, pno))
    chunks: list[dict] = []
    buf: list[tuple[str, int]] = []
    size = 0

    def flush():
        nonlocal buf, size
        if not buf:
            return
        text = " ".join(t for t, _ in buf).strip()
        if text:
            chunks.append({"text": text[: chunk_chars * 2],
                           "page_start": buf[0][1], "page_end": buf[-1][1]})
        # overlap: carry trailing sentences into the next chunk
        carry, csize = [], 0
        for t, p in reversed(buf):
            csize += len(t)
            carry.append((t, p))
            if csize >= overlap:
                break
        buf = list(reversed(carry))
        size = sum(len(t) for t, _ in buf)

    for s, p in sents:
        if size + len(s) > chunk_chars and buf:
            flush()
        buf.append((s, p))
        size += len(s)
    if buf:
        text = " ".join(t for t, _ in buf).strip()
        if text and (not chunks or text not in chunks[-1]["text"]):
            chunks.append({"text": text[: chunk_chars * 2],
                           "page_start": buf[0][1], "page_end": buf[-1][1]})
    return chunks


# ── ingest ─────────────────────────────────────────────────────────────────

def _embed_chunks(chunks: list[dict]) -> tuple[list[list[float]], str]:
    """ONE batched call; on failure return empty embeddings (keyword fallback
    at retrieval time) instead of raising — degraded beats dead."""
    embedder = build_embedder()
    try:
        vecs = embedder.embed_batch([c["text"] for c in chunks])
        if len(vecs) != len(chunks):
            raise ValueError("embedder returned wrong count")
        return vecs, embedder.name
    except Exception:
        log.exception("doc ingest: embedding failed — storing keyword-only chunks")
        return [[] for _ in chunks], f"{embedder.name}:failed"


def ingest_pdf(db: Session, *, user_id: int, plan: str, filename: str,
               data: bytes) -> MiraDocument:
    owner = str(user_id)
    content_hash = hashlib.sha256(data).hexdigest()
    # idempotent re-upload: same bytes -> same doc, no duplicate slot burned
    existing = db.execute(select(MiraDocument).where(
        MiraDocument.scope == "user", MiraDocument.owner_key == owner,
        MiraDocument.content_hash == content_hash)).scalar_one_or_none()
    if existing is not None:
        return existing

    limit = doc_limit_for_plan(plan)
    count = db.execute(select(func.count(MiraDocument.id)).where(
        MiraDocument.scope == "user", MiraDocument.owner_key == owner)).scalar_one()
    if count >= limit:
        raise DocError(
            f"Document limit reached for your plan ({limit}). "
            "Delete a document or upgrade to add more.", 403)

    pages = extract_pdf_pages(data)
    return _store(db, scope="user", owner_key=owner, lesson_id=None,
                  filename=filename, title=filename.rsplit(".", 1)[0][:255],
                  content_hash=content_hash, pages=pages)


def ingest_text(db: Session, *, scope: str, owner_key: str, lesson_id: str | None,
                title: str, text: str) -> MiraDocument:
    """Shared entry for course-lesson grounding (and any future plain-text
    source). A content-sync job calls this per lesson; chat-time retrieval is
    then identical to user docs."""
    content_hash = hashlib.sha256(text.encode()).hexdigest()
    existing = db.execute(select(MiraDocument).where(
        MiraDocument.scope == scope, MiraDocument.owner_key == owner_key,
        MiraDocument.content_hash == content_hash)).scalar_one_or_none()
    if existing is not None:
        return existing
    # An EDITED lesson arrives with the same (owner, lesson_id) but a new hash.
    # Replace, don't accumulate: stale lesson text must never be retrieved as
    # grounding after a content update.
    if scope == "course" and lesson_id:
        stale = db.execute(select(MiraDocument).where(
            MiraDocument.scope == scope, MiraDocument.owner_key == owner_key,
            MiraDocument.lesson_id == lesson_id)).scalars().all()
        for d in stale:
            db.delete(d)
        if stale:
            db.flush()
    return _store(db, scope=scope, owner_key=owner_key, lesson_id=lesson_id,
                  filename=f"{lesson_id or 'text'}.txt", title=title[:255],
                  content_hash=content_hash, pages=[text])


def _store(db: Session, *, scope: str, owner_key: str, lesson_id: str | None,
           filename: str, title: str, content_hash: str,
           pages: list[str]) -> MiraDocument:
    chunks = chunk_pages(pages)
    if not chunks:
        raise DocError("Document contained no usable text.", 422)
    vecs, embedder_name = _embed_chunks(chunks)

    doc = MiraDocument(scope=scope, owner_key=owner_key, lesson_id=lesson_id,
                       filename=filename[:255], title=title,
                       content_hash=content_hash, status="ready",
                       n_pages=len(pages), n_chunks=len(chunks),
                       embedder=embedder_name)
    db.add(doc)
    try:
        db.flush()
    except IntegrityError:
        # concurrent double-upload of the same bytes (issue #9 pattern):
        # the unique constraint wins; return the row that got there first.
        db.rollback()
        return db.execute(select(MiraDocument).where(
            MiraDocument.scope == scope, MiraDocument.owner_key == owner_key,
            MiraDocument.content_hash == content_hash)).scalar_one()
    for i, (c, v) in enumerate(zip(chunks, vecs)):
        db.add(MiraDocChunk(document_id=doc.id, idx=i, text=c["text"],
                            page_start=c["page_start"], page_end=c["page_end"],
                            embedding=v))
    db.commit()
    db.refresh(doc)
    return doc


# ── list / delete ──────────────────────────────────────────────────────────

def list_documents(db: Session, user_id: int) -> list[dict]:
    rows = db.execute(select(MiraDocument).where(
        MiraDocument.scope == "user",
        MiraDocument.owner_key == str(user_id)).order_by(
        MiraDocument.created_at.desc())).scalars().all()
    return [{"id": d.id, "filename": d.filename, "title": d.title,
             "n_pages": d.n_pages, "n_chunks": d.n_chunks, "status": d.status,
             "created_at": d.created_at.isoformat()} for d in rows]


def delete_document(db: Session, user_id: int, doc_id: int) -> None:
    doc = db.get(MiraDocument, doc_id)
    if doc is None or doc.scope != "user" or doc.owner_key != str(user_id):
        # not-found and not-yours are the same answer (no ownership oracle)
        raise DocError("Document not found.", 404)
    db.delete(doc)
    db.commit()


# ── retrieval ──────────────────────────────────────────────────────────────

def _keyword_score(q_tokens: set[str], text: str) -> float:
    if not q_tokens:
        return 0.0
    toks = set(re.findall(r"[a-z0-9]+", text.lower()))
    return len(q_tokens & toks) / max(len(q_tokens), 1)


def retrieve(db: Session, *, question: str, doc_id: int | None = None,
             user_id: int | None = None, scope: str = "user",
             owner_key: str | None = None, lesson_id: str | None = None,
             k: int = TOP_K) -> dict | None:
    """Top-k chunks for a question. For user docs pass doc_id+user_id
    (ownership enforced); for course grounding pass scope='course' +
    owner_key=course_id (+ optional lesson_id). Returns
    {doc, chunks:[{text,page_start,page_end,score}]} or None."""
    if doc_id is not None:
        doc = db.get(MiraDocument, doc_id)
        if doc is None:
            return None
        if doc.scope == "user" and (user_id is None or doc.owner_key != str(user_id)):
            return None  # never retrieve across users
        docs = [doc]
    else:
        q = select(MiraDocument).where(MiraDocument.scope == scope,
                                       MiraDocument.owner_key == (owner_key or ""))
        if lesson_id:
            q = q.where(MiraDocument.lesson_id == lesson_id)
        docs = db.execute(q).scalars().all()
        if not docs:
            return None

    chunk_rows = db.execute(select(MiraDocChunk).where(
        MiraDocChunk.document_id.in_([d.id for d in docs]))).scalars().all()
    if not chunk_rows:
        return None

    # query embedding — same degrade-don't-die contract as cheap_embed
    try:
        qvec = build_embedder().embed(question)
    except Exception:
        qvec = []
    q_tokens = set(re.findall(r"[a-z0-9]+", question.lower()))

    scored = []
    for ch in chunk_rows:
        emb = ch.embedding or []
        s = cosine(qvec, emb) if (qvec and emb) else _keyword_score(q_tokens, ch.text)
        scored.append((s, ch))
    scored.sort(key=lambda t: t[0], reverse=True)
    top = scored[:k]
    if not top or top[0][0] <= 0.0:
        return None
    primary = docs[0]
    return {
        "doc": {"id": primary.id, "title": primary.title or primary.filename,
                "filename": primary.filename, "n_pages": primary.n_pages},
        "chunks": [{"text": ch.text, "page_start": ch.page_start,
                    "page_end": ch.page_end, "score": round(s, 4)}
                   for s, ch in top],
    }


def grounding_block(retrieved: dict, *, source_label: str = "document",
                    max_chars: int = 9000) -> str:
    """Render retrieved chunks as the prompt grounding block, page-cited."""
    doc = retrieved["doc"]
    lines = [f'EXCERPTS FROM THE LEARNER\'S {source_label.upper()} '
             f'"{doc["title"]}" ({doc["n_pages"]} pages):']
    used = 0
    for c in retrieved["chunks"]:
        pages = (f'p. {c["page_start"]}' if c["page_start"] == c["page_end"]
                 else f'pp. {c["page_start"]}-{c["page_end"]}')
        piece = f'[{pages}] {c["text"]}'
        if used + len(piece) > max_chars:
            break
        lines.append(piece)
        used += len(piece)
    return "\n\n".join(lines)
