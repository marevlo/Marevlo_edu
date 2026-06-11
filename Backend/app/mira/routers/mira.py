"""
MIRA internal feature API.

These are Marevlo feature endpoints, not a standalone SaaS. Auth comes from
Marevlo middleware (get_current_user); access from Marevlo entitlements (via the
bridge). There are NO auth or payment endpoints here — Marevlo owns those.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.mira.services import chat_service
from app.mira.services import quota_service as quota
from app.mira.services import state_service as state_svc
from app.mira.services.entitlement_bridge import resolve_access

router = APIRouter(prefix="/mira", tags=["mira"])


class HistoryMsg(BaseModel):
    role: str = Field(description="user | mira")
    content: str = Field(max_length=4000)


class ChatReq(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    course_id: str | None = None
    lesson_id: str | None = None
    # the problem the user is currently on (from /problems/:topic/:id or /ide/:id)
    problem_id: str | None = None
    # live page context — e.g. the IDE problem statement + the user's current
    # code + last run output — so MIRA can debug THEIR code, not a generic one.
    page_context: str | None = Field(default=None, max_length=8000)
    # recent turns of the CURRENT chat thread, oldest->newest, for follow-up
    # context ("provide me code", "explain step by step"). Bounded server-side.
    history: list[HistoryMsg] | None = Field(default=None)


class FeedbackReq(BaseModel):
    request_id: str | None = None
    concept: str | None = None
    rating: str = Field(description="helpful|not_helpful|too_basic|too_advanced|wrong|need_example|need_code|need_visual")


class PracticeAnswerReq(BaseModel):
    concept: str
    correct: bool
    course_id: str | None = None
    lesson_id: str | None = None
    used_hint: bool = False


@router.post("/chat")
def mira_chat(body: ChatReq, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    history = [m.model_dump() for m in (body.history or [])][-8:]
    return chat_service.chat(db, user_id=user.id, question=body.question,
                             course_id=body.course_id, lesson_id=body.lesson_id,
                             problem_id=body.problem_id, page_context=body.page_context,
                             history=history)


@router.get("/profile")
def mira_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return chat_service.profile(db, user_id=user.id)


@router.get("/quota")
def mira_quota(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    access = resolve_access(db, user.id)
    return quota.get_usage(db, access)


@router.get("/course-context")
def mira_course_context(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """What MIRA knows about the user's course position — drives course-aware
    tutoring and 'next lesson' style recommendations."""
    access = resolve_access(db, user.id)
    return {"plan": access.plan, "course_ids": access.course_ids,
            "mira_enabled": access.mira_enabled}


@router.post("/feedback")
def mira_feedback(body: FeedbackReq, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """Answer feedback -> learning signal. Maps ratings to learning events that
    nudge style selection + mastery."""
    rating_to_event = {
        "too_basic": "asked_advanced", "too_advanced": "asked_simpler",
        "wrong": "answered_wrong",
    }
    if body.concept and body.rating in rating_to_event:
        state_svc.record_learning_event(
            db, user.id, concept=body.concept, event_type=rating_to_event[body.rating],
            detail={"rating": body.rating, "request_id": body.request_id})
    return {"ok": True}


@router.post("/practice-answer")
def mira_practice_answer(body: PracticeAnswerReq, user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    """Records real mastery evidence: did the student answer correctly, did they
    use a hint. This is what makes mastery evidence-based, not depth-based."""
    state_svc.record_learning_event(
        db, user.id, concept=body.concept,
        event_type="answered_correct" if body.correct else "answered_wrong",
        course_id=body.course_id, lesson_id=body.lesson_id,
        detail={"used_hint": body.used_hint})
    if body.used_hint:
        state_svc.record_learning_event(
            db, user.id, concept=body.concept, event_type="hint_used",
            course_id=body.course_id, lesson_id=body.lesson_id)
    evidence = state_svc.concept_mastery_evidence(db, user.id, body.concept)
    return {"ok": True, "evidence": evidence}
