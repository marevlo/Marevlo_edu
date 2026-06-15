"""Turn logger — phase 0 of the MIRA-1 own-model program.

Design rules:
  * Logging NEVER breaks a turn. Every public function swallows its own
    exceptions and reports via logger; a chat answer must not fail because
    analytics hiccuped.
  * The log row is a self-contained training pair: input context + output
    blocks + routing facts. No joins needed at export time.
  * Signals are append-only events from the UI (checkpoint result, depth
    taps, explain-differently, thumbs, follow-up, repair, escalation).
  * label_turn() folds signals into one quality_label:
        failed : checkpoint_fail w/o later pass, thumbs_down, escalated,
                 or parse fallback
        taught : checkpoint_pass or thumbs_up or follow_up_pick,
                 with no failure evidence
        neutral: everything else (read, no signal either way)
    Conservative on purpose — "taught" is the fine-tune corpus, and a noisy
    positive label poisons the future model more than a missed one.
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.mira.models.turn_logs import SIGNAL_KINDS, MiraTurnLog, MiraTurnSignal

log = logging.getLogger("mira.turnlog")

_TRUNC = {"question": 20000, "page_context": 20000, "doc_context": 10000}

_FAIL_KINDS = {"checkpoint_fail", "thumbs_down", "escalated"}
_TAUGHT_KINDS = {"checkpoint_pass", "thumbs_up", "follow_up_pick"}


def log_turn(db: Session, *, turn_id: str, user_id: int, question: str,
             history: list | None, page_context: str | None,
             doc_context: str | None, course_id: str | None,
             lesson_id: str | None, level: str | None, style: str | None,
             intent: str | None, concept: str | None, lane: str | None,
             served_from: str | None, parse_ok: bool, in_tokens: int,
             out_tokens: int, cost_inr: float, latency_ms: int,
             blocks: list | None, prompt_version: str = "v2") -> None:
    """Capture one turn. Failure-isolated; commits its own row."""
    try:
        row = MiraTurnLog(
            turn_id=turn_id, user_id=user_id,
            question=(question or "")[: _TRUNC["question"]],
            history=list(history or [])[-12:],
            page_context=(page_context or None) and page_context[: _TRUNC["page_context"]],
            doc_context=(doc_context or None) and doc_context[: _TRUNC["doc_context"]],
            course_id=course_id, lesson_id=lesson_id,
            level=level, style=style, prompt_version=prompt_version,
            intent=intent, concept=concept, lane=lane, served_from=served_from,
            parse_ok=1 if parse_ok else 0,
            in_tokens=int(in_tokens or 0), out_tokens=int(out_tokens or 0),
            cost_inr=float(cost_inr or 0.0), latency_ms=int(latency_ms or 0),
            blocks=list(blocks or []),
        )
        db.add(row)
        db.commit()
    except Exception:
        log.exception("turn logging failed (turn answered fine; pair lost)")
        try:
            db.rollback()
        except Exception:
            pass


def record_signal(db: Session, *, turn_id: str, user_id: int, kind: str,
                  detail: str | None = None) -> dict:
    """Append a quality signal from the UI. Unknown kinds are rejected so the
    labeler's vocabulary stays closed."""
    if kind not in SIGNAL_KINDS:
        return {"ok": False, "error": f"unknown signal kind '{kind}'"}
    try:
        db.add(MiraTurnSignal(turn_id=turn_id, user_id=user_id, kind=kind,
                              detail=(detail or None) and str(detail)[:255]))
        db.commit()
        return {"ok": True}
    except Exception:
        log.exception("signal recording failed")
        try:
            db.rollback()
        except Exception:
            pass
        return {"ok": False, "error": "storage_failed"}


def window_cost(db: Session, user_id: int, since) -> float:
    """Model spend (INR) for a user since `since` — the margin ledger's read
    side. One indexed SUM; called once per turn."""
    from sqlalchemy import func
    try:
        v = db.execute(select(func.coalesce(func.sum(MiraTurnLog.cost_inr), 0.0))
                       .where(MiraTurnLog.user_id == user_id,
                              MiraTurnLog.created_at >= since)).scalar_one()
        return float(v or 0.0)
    except Exception:
        log.exception("window_cost read failed — treating as 0 (guard stays open)")
        return 0.0


def apply_checkpoint_to_mastery(db: Session, *, turn_id: str, user_id: int,
                                passed: bool) -> None:
    """Checkpoint results are direct mastery evidence: fold them into the SAME
    learning-event stream the BKT belief estimate reads
    (state_service.concept_mastery_evidence), so a mid-answer check moves the
    learner's level exactly like a practice answer does. Failure-isolated."""
    try:
        from app.mira.services import state_service
        row = db.execute(select(MiraTurnLog).where(
            MiraTurnLog.turn_id == turn_id,
            MiraTurnLog.user_id == user_id)).scalar_one_or_none()
        if row is None or not row.concept:
            return
        state_service.record_learning_event(
            db, user_id, row.concept,
            "answered_correct" if passed else "answered_wrong",
            course_id=row.course_id, lesson_id=row.lesson_id,
            detail={"source": "checkpoint", "turn_id": turn_id})
    except Exception:
        log.exception("checkpoint->mastery wiring failed (signal still stored)")
        try:
            db.rollback()
        except Exception:
            pass


def label_turn(turn: MiraTurnLog, signals: list[MiraTurnSignal]) -> str:
    """Fold a turn's signals into taught / neutral / failed."""
    kinds = [s.kind for s in sorted(signals, key=lambda s: s.created_at)]
    if not turn.parse_ok or turn.served_from == "prose_fallback":
        return "failed"
    if "checkpoint_fail" in kinds and "checkpoint_pass" not in kinds[
            kinds.index("checkpoint_fail"):]:
        return "failed"  # failed and never recovered within this turn
    if any(k in _FAIL_KINDS - {"checkpoint_fail"} for k in kinds):
        return "failed"
    if any(k in _TAUGHT_KINDS for k in kinds):
        return "taught"
    return "neutral"


def label_unlabeled(db: Session, batch: int = 2000) -> dict:
    """Nightly job body: label fresh turns. Idempotent; call until 0 remain."""
    turns = db.execute(select(MiraTurnLog).where(
        MiraTurnLog.quality_label.is_(None)).limit(batch)).scalars().all()
    if not turns:
        return {"labeled": 0, "remaining": 0}
    sig_rows = db.execute(select(MiraTurnSignal).where(
        MiraTurnSignal.turn_id.in_([t.turn_id for t in turns]))).scalars().all()
    by_turn: dict[str, list] = {}
    for s in sig_rows:
        by_turn.setdefault(s.turn_id, []).append(s)
    counts = {"taught": 0, "neutral": 0, "failed": 0}
    now = datetime.utcnow()
    for t in turns:
        t.quality_label = label_turn(t, by_turn.get(t.turn_id, []))
        t.labeled_at = now
        counts[t.quality_label] += 1
    db.commit()
    remaining = db.execute(select(MiraTurnLog.id).where(
        MiraTurnLog.quality_label.is_(None)).limit(1)).first()
    return {"labeled": len(turns), "remaining": 1 if remaining else 0, **counts}
