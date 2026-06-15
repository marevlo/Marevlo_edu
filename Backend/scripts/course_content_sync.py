"""Course lesson content-sync — turns "MIRA knows course concepts" into
"MIRA answers from Lesson 7".

Walks the SAME static lesson HTML the frontend serves
(frontend/public/cources/**.html), extracts text, and ingests each lesson into
the shared retrieval store via document_service.ingest_text(scope="course").
Chat-time retrieval is already wired (chat_service falls back to course-scope
retrieval whenever course_id is present and no uploaded doc is pinned).

ID CONTRACT (must match what the widget sends): ids replicate
frontend/scripts/generate-catalog.mjs exactly —
    lesson_id  = slugId(path relative to cources/)   e.g.
                 "API security/api-security-ch1.html" -> "api-security-api-security-ch1"
    owner_key  = slugId(top-level directory name)     e.g. "api-security"
Same lowercase/strip/dash rules, same numeric-aware sort order, same collision
counter — so the ids here are byte-identical to COURSE_HTML_MAP keys.

USAGE (from Backend/, against the target DB):
    python -m scripts.course_content_sync --content-root ../frontend/public --dry-run
    DATABASE_URL=postgresql://... python -m scripts.course_content_sync \
        --content-root ../frontend/public [--course deep-learning] [--prune]

Idempotent: unchanged lessons are hash-deduped (no re-embed cost); edited
lessons replace their stale rows; --prune removes lessons deleted from content.
Run it from CI on content changes, or manually after a course drop.
"""
from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


# ── HTML -> text (stdlib; lesson pages are static authored HTML) ──────────

_SKIP_TAGS = {"script", "style", "noscript", "svg", "head", "nav", "footer"}
_BLOCK_TAGS = {"p", "div", "section", "article", "li", "tr", "br", "h1", "h2",
               "h3", "h4", "h5", "h6", "pre", "blockquote", "td", "th"}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title and not self.title:
            self.title = data.strip()
        if self._skip_depth == 0 and data.strip():
            self.parts.append(data)


def html_to_text(html: str) -> tuple[str, str]:
    """Returns (title, text). Whitespace-normalized, code blocks preserved
    inline (they're teaching content — the model should ground on them too)."""
    ex = _TextExtractor()
    try:
        ex.feed(html)
    except Exception:
        pass
    text = "".join(ex.parts)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    return ex.title, text


# ── id rules: byte-identical replication of generate-catalog.mjs ──────────

def make_slugger():
    used: set[str] = set()

    def slug_id(rel_path: str) -> str:
        base = re.sub(r"\.[a-z0-9]+$", "", rel_path.lower())
        base = re.sub(r"[^a-z0-9]+", "-", base).strip("-") or "item"
        sid, n = base, 2
        while sid in used:
            sid = f"{base}-{n}"; n += 1
        used.add(sid)
        return sid

    return slug_id


def _catalog_sort_key(name: str):
    # localeCompare(..., {numeric: true, sensitivity:'base'}) equivalent:
    # case-insensitive with numeric runs compared as numbers.
    return [int(t) if t.isdigit() else t for t in
            re.split(r"(\d+)", name.casefold())]


def walk_lessons(content_root: Path) -> list[dict]:
    """Yield {course_id, lesson_id, title, text, path} for every lesson HTML,
    in the catalog's traversal order so collision suffixes match exactly."""
    cources = content_root / "cources"
    if not cources.is_dir():
        raise SystemExit(f"content root has no cources/ dir: {content_root}")
    slug = make_slugger()
    out: list[dict] = []

    def walk(absdir: Path, rel_from_cources: str, course_id: str | None):
        # directory gets an id too (consumes a slug slot, exactly like the
        # generator's buildDir) — needed to keep collision counters aligned.
        dir_id = slug(rel_from_cources or absdir.name)
        cid = course_id or dir_id  # top-level dir = the course root
        entries = sorted([e for e in absdir.iterdir() if e.name != ".DS_Store"],
                         key=lambda e: _catalog_sort_key(e.name))
        for e in entries:
            rel = f"{rel_from_cources}/{e.name}" if rel_from_cources else e.name
            if e.is_dir():
                walk(e, rel, cid)
            elif re.search(r"\.html?$", e.name, re.I):
                lesson_id = slug(rel)
                title, text = html_to_text(e.read_text(errors="replace"))
                out.append({"course_id": cid, "lesson_id": lesson_id,
                            "title": title or e.stem, "text": text,
                            "path": str(e)})
    for top in sorted([d for d in cources.iterdir() if d.is_dir()],
                      key=lambda e: _catalog_sort_key(e.name)):
        walk(top, top.name, None)
    return out


# ── sync ───────────────────────────────────────────────────────────────────

MIN_TEXT_CHARS = 200  # skip stub/placeholder pages — they'd pollute retrieval


def run(args) -> int:
    lessons = walk_lessons(Path(args.content_root).resolve())
    if args.course:
        lessons = [l for l in lessons if l["course_id"] == args.course]
    skipped = [l for l in lessons if len(l["text"]) < MIN_TEXT_CHARS]
    lessons = [l for l in lessons if len(l["text"]) >= MIN_TEXT_CHARS]
    print(f"{len(lessons)} lessons to sync "
          f"({len(skipped)} skipped as stubs <{MIN_TEXT_CHARS} chars) "
          f"across {len({l['course_id'] for l in lessons})} courses")

    if args.dry_run:
        from collections import Counter
        for cid, n in sorted(Counter(l["course_id"] for l in lessons).items()):
            print(f"  {cid}: {n} lessons")
        for l in lessons[:5]:
            print(f"  e.g. {l['course_id']} / {l['lesson_id']} "
                  f"({len(l['text'])} chars) '{l['title'][:60]}'")
        return 0

    from app.core.database import SessionLocal
    import app.models_registry  # noqa: F401
    from app.mira.services import document_service as docs
    from app.mira.models.documents import MiraDocument
    from sqlalchemy import select

    db = SessionLocal()
    new = same = replaced = failed = 0
    seen_by_course: dict[str, set[str]] = {}
    try:
        for i, l in enumerate(lessons, 1):
            seen_by_course.setdefault(l["course_id"], set()).add(l["lesson_id"])
            try:
                before = db.execute(select(MiraDocument.id, MiraDocument.content_hash)
                                    .where(MiraDocument.scope == "course",
                                           MiraDocument.owner_key == l["course_id"],
                                           MiraDocument.lesson_id == l["lesson_id"])
                                    ).first()
                doc = docs.ingest_text(db, scope="course", owner_key=l["course_id"],
                                       lesson_id=l["lesson_id"], title=l["title"],
                                       text=l["text"])
                if before is None:
                    new += 1
                elif before.id == doc.id:
                    same += 1
                else:
                    replaced += 1
                if i % 50 == 0:
                    print(f"  ...{i}/{len(lessons)}")
            except Exception as e:
                failed += 1
                print(f"  FAILED {l['course_id']}/{l['lesson_id']}: {e}")
                db.rollback()

        pruned = 0
        if args.prune:
            for cid, seen in seen_by_course.items():
                rows = db.execute(select(MiraDocument).where(
                    MiraDocument.scope == "course",
                    MiraDocument.owner_key == cid)).scalars().all()
                for d in rows:
                    if d.lesson_id not in seen:
                        db.delete(d); pruned += 1
            db.commit()
        print(f"\nsync done: {new} new, {same} unchanged, {replaced} replaced, "
              f"{failed} failed" + (f", {pruned} pruned" if args.prune else ""))
        return 1 if failed else 0
    finally:
        db.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--content-root", default="../frontend/public",
                    help="dir containing cources/ (default ../frontend/public)")
    ap.add_argument("--course", default="", help="sync one course id only")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--prune", action="store_true",
                    help="delete course docs whose lesson no longer exists in content")
    return run(ap.parse_args())


if __name__ == "__main__":
    sys.exit(main())
