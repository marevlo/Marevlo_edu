"""MIRA-1 phase 0 — turn logging, signals, labeling, export privacy."""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.mira.models.turn_logs import MiraTurnLog, MiraTurnSignal
from app.mira.services import turn_logger as tl


@pytest.fixture()
def db():
    eng = create_engine("sqlite://", future=True,
                        connect_args={"check_same_thread": False})
    import app.models_registry  # noqa: F401
    Base.metadata.create_all(eng)
    s = sessionmaker(bind=eng, future=True)()
    try:
        yield s
    finally:
        s.close()


def _log(db, turn_id="t1", **kw):
    base = dict(turn_id=turn_id, user_id=1, question="what is a heap?",
                history=[], page_context=None, doc_context=None,
                course_id=None, lesson_id=None, level="learning",
                style="analogy", intent="LEARN", concept="heaps",
                lane="minimax", served_from="model", parse_ok=True,
                in_tokens=2500, out_tokens=1500, cost_inr=0.21,
                latency_ms=4200, blocks=[{"type": "walkthrough"}])
    base.update(kw)
    tl.log_turn(db, **base)


def test_turn_is_captured_as_training_pair(db):
    _log(db)
    row = db.execute(select(MiraTurnLog)).scalar_one()
    assert row.question == "what is a heap?" and row.lane == "minimax"
    assert row.blocks == [{"type": "walkthrough"}]
    assert row.quality_label is None  # fresh, unlabeled


def test_logging_failure_never_raises(db, monkeypatch):
    monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("db down")))
    _log(db)  # must not raise — the answer already went to the user


def test_signal_vocabulary_is_closed(db):
    _log(db)
    assert tl.record_signal(db, turn_id="t1", user_id=1,
                            kind="checkpoint_pass")["ok"]
    bad = tl.record_signal(db, turn_id="t1", user_id=1, kind="liked_it_a_lot")
    assert not bad["ok"]


def test_labeling_rules(db):
    _log(db, turn_id="taught")
    tl.record_signal(db, turn_id="taught", user_id=1, kind="checkpoint_pass")
    _log(db, turn_id="failed")
    tl.record_signal(db, turn_id="failed", user_id=1, kind="thumbs_down")
    _log(db, turn_id="recovered")
    tl.record_signal(db, turn_id="recovered", user_id=1, kind="checkpoint_fail")
    tl.record_signal(db, turn_id="recovered", user_id=1, kind="checkpoint_pass")
    _log(db, turn_id="silent")
    _log(db, turn_id="broken", served_from="prose_fallback", parse_ok=False)

    r = tl.label_unlabeled(db)
    assert r["labeled"] == 5
    labels = {t.turn_id: t.quality_label
              for t in db.execute(select(MiraTurnLog)).scalars()}
    assert labels["taught"] == "taught"
    assert labels["failed"] == "failed"
    assert labels["recovered"] == "taught", "fail then pass = repair worked"
    assert labels["silent"] == "neutral"
    assert labels["broken"] == "failed", "parse fallback is never training data"


def test_labeler_is_idempotent(db):
    _log(db)
    tl.label_unlabeled(db)
    r2 = tl.label_unlabeled(db)
    assert r2["labeled"] == 0 and not r2["remaining"]


# ── item #3: checkpoint validation + BKT wiring ────────────────────────────

def test_checkpoint_validator_passes_wellformed_and_drops_broken():
    from app.mira.engine.contracts import walkthrough_to_blocks
    good = {"steps": [{"title": "A"}, {"title": "B"}, {"title": "C"}],
            "checkpoint": {"after_step": 2, "question": "Which is the insight?",
                           "options": ["right", "wrong1", "wrong2"], "correct": 0,
                           "repair_hint": "new angle", "repair_prompt": "re-teach it"}}
    blk = walkthrough_to_blocks(good)[0]
    assert blk["checkpoint"]["after_step"] == 2
    assert blk["checkpoint"]["options"] == ["right", "wrong1", "wrong2"]

    for broken in (
        {"question": "q", "options": ["a", "b"], "correct": 0},          # 2 options
        {"question": "q", "options": ["a", "b", "c"], "correct": 5},     # bad index
        {"question": "", "options": ["a", "b", "c"], "correct": 0},      # empty q
        "not a dict",
    ):
        blk = walkthrough_to_blocks({"steps": good["steps"],
                                     "checkpoint": broken})[0]
        assert "checkpoint" not in blk, f"broken checkpoint must be dropped: {broken}"


def test_checkpoint_after_step_clamped_inside_walkthrough():
    from app.mira.engine.contracts import walkthrough_to_blocks
    blk = walkthrough_to_blocks({
        "steps": [{"title": "A"}, {"title": "B"}, {"title": "C"}],
        "checkpoint": {"after_step": 99, "question": "q?",
                       "options": ["a", "b", "c"], "correct": 1}})[0]
    assert blk["checkpoint"]["after_step"] == 2  # never after the final step


def test_checkpoint_signal_records_mastery_evidence(db):
    _log(db, turn_id="cp1", concept="heaps", user_id=7)
    tl.record_signal(db, turn_id="cp1", user_id=7, kind="checkpoint_pass")
    tl.apply_checkpoint_to_mastery(db, turn_id="cp1", user_id=7, passed=True)
    tl.record_signal(db, turn_id="cp1", user_id=7, kind="checkpoint_fail")
    tl.apply_checkpoint_to_mastery(db, turn_id="cp1", user_id=7, passed=False)
    from app.mira.services.state_service import concept_mastery_evidence
    ev = concept_mastery_evidence(db, 7, "heaps")
    assert ev["correct"] == 1 and ev["wrong"] == 1 and ev["attempts"] == 2


def test_step_revisit_is_valid_and_neutral(db):
    _log(db, turn_id="rv1")
    assert tl.record_signal(db, turn_id="rv1", user_id=1,
                            kind="step_revisit", detail="2")["ok"]
    tl.label_unlabeled(db)
    from sqlalchemy import select as _sel
    row = db.execute(_sel(MiraTurnLog).where(
        MiraTurnLog.turn_id == "rv1")).scalar_one()
    assert row.quality_label == "neutral"


def test_mock_provider_emits_checkpointed_walkthrough():
    from app.mira.engine.providers import MockProvider
    import json as _json
    c = MockProvider().complete('respond as {"format":"walkthrough", ...}',
                                "explain heaps")
    data = _json.loads(c.text)
    assert data["format"] == "walkthrough"
    cp = data["checkpoint"]
    assert len(cp["options"]) == 3 and cp["correct"] == 0
