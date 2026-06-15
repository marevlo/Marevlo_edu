"""
MIRA internal feature API.

These are Marevlo feature endpoints, not a standalone SaaS. Auth comes from
Marevlo middleware (get_current_user); access from Marevlo entitlements (via the
bridge). There are NO auth or payment endpoints here — Marevlo owns those.
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiting import limiter
from app.mira.services import chat_service
from app.mira.services import quota_service as quota
from app.mira.services import state_service as state_svc
from app.mira.services.entitlement_bridge import resolve_access

router = APIRouter(prefix="/mira", tags=["mira"])

# /mira/chat is the most expensive endpoint in the app (issue #2): every call
# can fan out to paid model providers. Limit is env-configurable
# (MIRA_CHAT_RATE_LIMIT, slowapi syntax, default "20/minute") and keys on the
# real client IP behind the ALB (see rate_limiting._real_ip_key). The 429 is
# rendered by the app-level RateLimitExceeded handler in main.py.
_MIRA_CHAT_LIMIT = get_settings().MIRA_CHAT_RATE_LIMIT


class HistoryMsg(BaseModel):
    role: str = Field(description="user | mira")
    content: str = Field(max_length=4000)


class ChatReq(BaseModel):
    # Issue #15: DEBUG is a paste-heavy intent (stack traces, code). The old
    # 2000-char cap 422'd the main debugging use case. 20k chars ≈ ~5k tokens
    # of input — well inside the prompt budget; page_context stays separately
    # bounded. Oversize requests get the app's unified validation payload.
    question: str = Field(min_length=1, max_length=20000)
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
    # ground this turn in one of the user's uploaded documents (paper Q&A).
    # Ownership is enforced server-side at retrieval; a foreign id grounds nothing.
    document_id: int | None = None


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


class SignalReq(BaseModel):
    turn_id: str = Field(min_length=1, max_length=64)
    kind: str = Field(min_length=1, max_length=32)
    detail: str | None = Field(default=None, max_length=255)


@router.post("/signal")
def mira_signal(body: SignalReq, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Quality-signal ingestion (checkpoint results, depth taps, thumbs...).
    Feeds the nightly labeler that builds the MIRA-1 training corpus."""
    from app.mira.services import turn_logger
    res = turn_logger.record_signal(db, turn_id=body.turn_id, user_id=user.id,
                                    kind=body.kind, detail=body.detail)
    if res.get("ok") and body.kind in ("checkpoint_pass", "checkpoint_fail"):
        turn_logger.apply_checkpoint_to_mastery(
            db, turn_id=body.turn_id, user_id=user.id,
            passed=body.kind == "checkpoint_pass")
    return res


@router.post("/chat")
@limiter.limit(_MIRA_CHAT_LIMIT)
def mira_chat(request: Request, body: ChatReq, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    history = [m.model_dump() for m in (body.history or [])][-8:]
    return chat_service.chat(db, user_id=user.id, question=body.question,
                             course_id=body.course_id, lesson_id=body.lesson_id,
                             problem_id=body.problem_id, page_context=body.page_context,
                             history=history, document_id=body.document_id)


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
