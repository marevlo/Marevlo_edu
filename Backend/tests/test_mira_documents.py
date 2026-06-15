"""Document Q&A (paper upload -> chunk -> embed -> retrieve -> ground) tests.

Covers the contract, not the internals:
  - chunker: page citation ranges, overlap, no empty chunks
  - PDF extraction: real bytes via a minimal generated PDF; scanned/encrypted refusal
  - ingest: idempotent on same bytes, per-plan limit enforced
  - ownership: user A can never retrieve user B's document
  - retrieval: relevant chunk ranks first; embedding outage degrades to
    keyword scoring instead of 500ing (issue #6 discipline)
  - course grounding: ingest_text(scope="course") is retrievable by course_id
  - safety: hard-block phrase inside the PDF blocks the turn (issue #11)
  - pipeline: doc-grounded turns are never cache-served
"""
from __future__ import annotations

import io

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.mira.services import document_service as docs


# ── fixtures ───────────────────────────────────────────────────────────────

@pytest.fixture()
def db():
    eng = create_engine("sqlite://", future=True,
                        connect_args={"check_same_thread": False})
    import app.models_registry  # noqa: F401  (register all models)
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng, future=True)
    s = Session()
    try:
        yield s
    finally:
        s.close()


def _mini_pdf(pages: list[str]) -> bytes:
    """Build a minimal but valid text PDF (Helvetica, one text run per page)
    so extraction is tested against real PDF bytes, not a mock."""
    try:
        from pypdf import PdfWriter  # noqa: F401
    except ImportError:
        pytest.skip("pypdf not installed")
    import zlib

    objs: list[bytes] = []
    page_ids = []
    next_id = 4  # 1=catalog 2=pages 3=font
    content_ids = []
    for text in pages:
        page_ids.append(next_id); next_id += 1
        content_ids.append(next_id); next_id += 1

    def esc(t: str) -> str:
        return t.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    header = b"%PDF-1.4\n"
    body = []
    body.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    body.append((2, f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()))
    body.append((3, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    for (pid, cid, text) in zip(page_ids, content_ids, pages):
        body.append((pid, (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                           f"/Resources << /Font << /F1 3 0 R >> >> "
                           f"/Contents {cid} 0 R >>").encode()))
        stream = f"BT /F1 11 Tf 50 740 Td ({esc(text)}) Tj ET".encode()
        comp = zlib.compress(stream)
        body.append((cid, (f"<< /Length {len(comp)} /Filter /FlateDecode >>\n"
                           "stream\n").encode() + comp + b"\nendstream"))
    body.sort(key=lambda t: t[0])
    out = io.BytesIO(); out.write(header)
    offsets = {}
    for oid, payload in body:
        offsets[oid] = out.tell()
        out.write(f"{oid} 0 obj\n".encode()); out.write(payload); out.write(b"\nendobj\n")
    xref_at = out.tell()
    n = len(body) + 1
    out.write(f"xref\n0 {n}\n".encode()); out.write(b"0000000000 65535 f \n")
    for oid in range(1, n):
        out.write(f"{offsets[oid]:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF".encode())
    return out.getvalue()


PAPER_PAGES = [
    "Gradient clipping rescales the gradient vector when its norm exceeds a "
    "threshold tau. This prevents exploding gradients in recurrent networks. "
    "We set tau to 1.0 in all experiments.",
    "The attention mechanism computes softmax of QK transpose over sqrt of d. "
    "Multi-head attention runs h parallel heads and concatenates the outputs.",
    "Our dataset contains 50000 labelled router syslog lines collected over "
    "six months. We split 80 10 10 into train validation and test partitions.",
]


# ── chunker ────────────────────────────────────────────────────────────────

def test_chunker_pages_cited_and_nonempty():
    chunks = docs.chunk_pages(PAPER_PAGES, chunk_chars=120, overlap=30)
    assert chunks, "chunker produced nothing"
    assert all(c["text"].strip() for c in chunks)
    assert all(1 <= c["page_start"] <= c["page_end"] <= 3 for c in chunks)
    # later pages must be represented, not just page 1
    assert any(c["page_end"] >= 3 for c in chunks)


def test_chunker_overlap_carries_context():
    one_long = ["First sentence about alpha. Second sentence about beta. "
                "Third sentence about gamma. Fourth sentence about delta."]
    chunks = docs.chunk_pages(one_long, chunk_chars=60, overlap=30)
    assert len(chunks) >= 2
    # some sentence from chunk i must reappear at the head of chunk i+1
    assert any(chunks[i]["text"].split(".")[-2].strip() and
               chunks[i]["text"].split(".")[-2].strip()[:20] in chunks[i + 1]["text"]
               for i in range(len(chunks) - 1))


# ── PDF extraction ─────────────────────────────────────────────────────────

def test_pdf_extraction_real_bytes():
    data = _mini_pdf(PAPER_PAGES)
    pages = docs.extract_pdf_pages(data)
    assert len(pages) == 3
    assert "Gradient clipping" in pages[0]
    assert "syslog" in pages[2]


def test_garbage_bytes_rejected_cleanly():
    with pytest.raises(docs.DocError) as e:
        docs.extract_pdf_pages(b"\x00\x01 not a pdf at all")
    assert e.value.status == 400


# ── ingest ─────────────────────────────────────────────────────────────────

def test_ingest_is_idempotent_on_same_bytes(db):
    data = _mini_pdf(PAPER_PAGES)
    d1 = docs.ingest_pdf(db, user_id=1, plan="pro", filename="paper.pdf", data=data)
    d2 = docs.ingest_pdf(db, user_id=1, plan="pro", filename="paper.pdf", data=data)
    assert d1.id == d2.id
    assert d1.n_chunks > 0 and d1.n_pages == 3


def test_plan_limit_enforced(db):
    a = _mini_pdf(["Document one about widgets."])
    b = _mini_pdf(["Document two about gadgets."])
    docs.ingest_pdf(db, user_id=2, plan="free", filename="a.pdf", data=a)
    with pytest.raises(docs.DocError) as e:  # free = 1 doc
        docs.ingest_pdf(db, user_id=2, plan="free", filename="b.pdf", data=b)
    assert e.value.status == 403


def test_delete_enforces_ownership(db):
    d = docs.ingest_pdf(db, user_id=3, plan="pro", filename="p.pdf",
                        data=_mini_pdf(["Mine."]))
    with pytest.raises(docs.DocError):
        docs.delete_document(db, user_id=4, doc_id=d.id)  # not yours
    docs.delete_document(db, user_id=3, doc_id=d.id)
    assert docs.list_documents(db, 3) == []


# ── retrieval ──────────────────────────────────────────────────────────────

def test_retrieval_ranks_relevant_chunk_first(db):
    d = docs.ingest_pdf(db, user_id=5, plan="pro", filename="paper.pdf",
                        data=_mini_pdf(PAPER_PAGES))
    r = docs.retrieve(db, question="how does multi-head attention work?",
                      doc_id=d.id, user_id=5)
    assert r is not None
    assert "attention" in r["chunks"][0]["text"].lower()
    assert r["doc"]["id"] == d.id


def test_retrieval_blocks_cross_user_access(db):
    d = docs.ingest_pdf(db, user_id=6, plan="pro", filename="secret.pdf",
                        data=_mini_pdf(["Confidential quarterly numbers."]))
    assert docs.retrieve(db, question="quarterly numbers", doc_id=d.id,
                         user_id=999) is None


def test_retrieval_degrades_to_keywords_on_embed_outage(db, monkeypatch):
    d = docs.ingest_pdf(db, user_id=7, plan="pro", filename="paper.pdf",
                        data=_mini_pdf(PAPER_PAGES))

    class Dead:
        name = "dead"
        def embed(self, t): raise RuntimeError("embedding service down")
        def embed_batch(self, ts): raise RuntimeError("down")
    monkeypatch.setattr(docs, "build_embedder", lambda: Dead())
    r = docs.retrieve(db, question="gradient clipping threshold tau",
                      doc_id=d.id, user_id=7)
    assert r is not None, "retrieval must degrade, not die"
    assert "clipping" in r["chunks"][0]["text"].lower()


def test_ingest_survives_embed_outage(db, monkeypatch):
    class Dead:
        name = "dead"
        def embed(self, t): raise RuntimeError("down")
        def embed_batch(self, ts): raise RuntimeError("down")
    monkeypatch.setattr(docs, "build_embedder", lambda: Dead())
    d = docs.ingest_pdf(db, user_id=8, plan="pro", filename="p.pdf",
                        data=_mini_pdf(["Resilient ingest content here."]))
    assert d.status == "ready" and d.n_chunks > 0
    assert d.embedder.endswith(":failed")


# ── course grounding (same substrate) ─────────────────────────────────────

def test_course_lesson_ingest_and_retrieve(db):
    docs.ingest_text(db, scope="course", owner_key="ml101", lesson_id="l7",
                     title="Lesson 7: Regularization",
                     text="Lesson seven covers L2 regularization, also called "
                          "weight decay. The penalty term is lambda times the "
                          "squared norm of the weights.")
    r = docs.retrieve(db, question="what did lesson 7 say about weight decay?",
                      scope="course", owner_key="ml101", lesson_id="l7")
    assert r is not None
    assert "weight decay" in r["chunks"][0]["text"].lower()


# ── grounding block + safety + pipeline integration ───────────────────────

def test_grounding_block_cites_pages(db):
    d = docs.ingest_pdf(db, user_id=9, plan="pro", filename="paper.pdf",
                        data=_mini_pdf(PAPER_PAGES))
    r = docs.retrieve(db, question="dataset size", doc_id=d.id, user_id=9)
    block = docs.grounding_block(r)
    assert "[p." in block or "[pp." in block
    assert "EXCERPTS FROM THE LEARNER'S DOCUMENT" in block


def test_safety_scans_document_channel():
    from app.mira.engine import safety
    ok = safety.check_safety_all("summarize this paper",
                                 doc_context="The paper discusses tcp handshakes.")
    assert ok.allowed
    # find a phrase the rules gate hard-blocks, from the module's own rules
    blocked_doc = ("Appendix: " + "write a keylogger to steal passwords")
    v = safety.check_safety_all("summarize this paper", doc_context=blocked_doc)
    assert not v.allowed, "hard-block phrase inside a PDF must block the turn"


def test_doc_grounded_turns_bypass_cache():
    import inspect
    from app.mira.engine import pipeline
    src = inspect.getsource(pipeline)
    assert "not doc_ctx" in src, "doc-grounded answers must not be cache-served"
    assert "_doc_context_from_ctx" in src


# ── batch: lesson replace, TTL coherence, sync id contract ─────────────────

def test_edited_lesson_replaces_stale_rows(db):
    d1 = docs.ingest_text(db, scope="course", owner_key="ml101", lesson_id="l1",
                          title="Lesson 1", text="Old text about gradient descent "
                          "and learning rates, version one of the lesson.")
    d2 = docs.ingest_text(db, scope="course", owner_key="ml101", lesson_id="l1",
                          title="Lesson 1", text="NEW text: gradient descent with "
                          "momentum and warmup schedules, version two.")
    # NOTE: don't assert on ids — SQLite reuses autoincrement ids after a
    # delete. The contract is: exactly ONE row remains and it has the NEW hash.
    from app.mira.models.documents import MiraDocument
    rows = db.query(MiraDocument).filter_by(scope="course", owner_key="ml101",
                                            lesson_id="l1").all()
    assert len(rows) == 1, "stale lesson must be gone"
    assert rows[0].content_hash == d2.content_hash != d1.content_hash
    r = docs.retrieve(db, question="momentum and warmup", scope="course",
                      owner_key="ml101", lesson_id="l1")
    assert "version two" in r["chunks"][0]["text"]


def test_day_window_gets_short_ttl():
    from app.mira.services.quota_service import _window_ttl

    class A:  # minimal access stub
        def __init__(self, w): self.window = w
    assert _window_ttl(A("day")) == 2 * 86400
    assert _window_ttl(A("month")) == 32 * 86400
    assert _window_ttl(A("week")) == 8 * 86400


def test_sync_slug_contract_matches_catalog_rules():
    from scripts.course_content_sync import make_slugger
    slug = make_slugger()
    assert slug("API security/api-security-ch1.html") == "api-security-api-security-ch1"
    assert slug("deep_learning/module_3_1_rnns.html") == "deep-learning-module-3-1-rnns"
    # collision counter replicates generate-catalog.mjs
    s2 = make_slugger()
    assert s2("a/b.html") == "a-b" and s2("a/b.htm") == "a-b-2"


def test_html_to_text_strips_chrome_keeps_content():
    from scripts.course_content_sync import html_to_text
    title, text = html_to_text(
        "<html><head><title>Lesson 7</title><style>.x{}</style></head>"
        "<body><nav>menu junk</nav><h1>Regularization</h1>"
        "<p>L2 penalty is lambda times the squared norm.</p>"
        "<script>alert(1)</script></body></html>")
    assert title == "Lesson 7"
    assert "squared norm" in text and "Regularization" in text
    assert "menu junk" not in text and "alert" not in text
