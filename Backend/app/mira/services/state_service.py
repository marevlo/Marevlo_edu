"""
MIRA user-state persistence and learning-event recording.

The engine's UserState (belief map, memory, style) is serialized to the
mira_user_state JSON blob, keyed by Marevlo user_id. Learning events (mastery
evidence) append to mira_learning_events and feed the belief update.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.mira.engine.cognitive import UserState
from app.mira.models.mira import (
    MiraLearningEvent,
    MiraUsageEvent,
    MiraUserState,
)


def load_state(db: Session, user_id: int, plan: str) -> UserState:
    row = db.get(MiraUserState, user_id)
    if row is None or not row.state:
        return UserState(str(user_id), tier=plan)
    try:
        st = UserState.from_dict(row.state)
        st.tier = plan  # tier always comes from the live entitlement, not the blob
        return st
    except Exception:
        return UserState(str(user_id), tier=plan)


def save_state(db: Session, user_id: int, state: UserState) -> None:
    row = db.get(MiraUserState, user_id)
    blob = state.to_dict()
    style = getattr(state, "preferred_style", None) or getattr(state, "style", None)
    if row is None:
        row = MiraUserState(user_id=user_id, state=blob,
                            preferred_style=style, turns=1)
        db.add(row)
    else:
        row.state = blob
        row.preferred_style = style
        row.turns = (row.turns or 0) + 1
    db.commit()


def log_usage(db: Session, user_id: int, **fields) -> None:
    db.add(MiraUsageEvent(user_id=user_id, **fields))
    db.commit()


def record_learning_event(db: Session, user_id: int, concept: str, event_type: str,
                          course_id: str | None = None, lesson_id: str | None = None,
                          detail: dict | None = None) -> None:
    db.add(MiraLearningEvent(
        user_id=user_id, concept=concept, event_type=event_type,
        course_id=course_id, lesson_id=lesson_id, detail=detail))
    db.commit()


def concept_mastery_evidence(db: Session, user_id: int, concept: str) -> dict:
    """Summarize evidence for a concept — used to nudge the belief estimate from
    real signals (correct/wrong answers, hints) rather than question depth alone."""
    from sqlalchemy import select, func
    rows = db.execute(
        select(MiraLearningEvent.event_type, func.count())
        .where(MiraLearningEvent.user_id == user_id, MiraLearningEvent.concept == concept)
        .group_by(MiraLearningEvent.event_type)
    ).all()
    counts = {et: int(n) for et, n in rows}
    correct = counts.get("answered_correct", 0)
    wrong = counts.get("answered_wrong", 0)
    hints = counts.get("hint_used", 0)
    total = correct + wrong
    accuracy = (correct / total) if total else None
    return {"correct": correct, "wrong": wrong, "hints": hints,
            "attempts": total, "accuracy": accuracy}
