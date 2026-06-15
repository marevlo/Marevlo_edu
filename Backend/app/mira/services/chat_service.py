"""
MIRA chat orchestrator (Marevlo-native).

Flow per turn:
  1. resolve Marevlo entitlement -> MiraAccess (plan, quota, credits, courses)
  2. gate: mira_enabled? else refuse
  3. token quota check (entitlement-period window)
  4. SAFETY gate (before any model call) — refund quota + refuse if blocked
  5. pre-classify intent; if BUILD, RESERVE a build credit before the model
  6. run the engine (course-aware context)
  7. reconcile quota by actual tokens (provider failure => ~0 charge)
  8. persist cognitive state + durable usage audit
  9. return blocks + meta

MIRA reads identity from Marevlo (user_id) and paid access from Marevlo
entitlements. It owns tutoring, safety, quota/credits, and learning memory.
"""
from __future__ import annotations

import os
import time
import uuid

from sqlalchemy.orm import Session

from app.mira.engine.cognitive import UserState
from app.mira.engine.intent import Intent, classify as classify_intent
from app.mira.engine.pipeline import ChatPipeline, TurnContext
from app.mira.engine.providers import build_registry
from app.mira.engine.router import Router
from app.mira.engine import safety as safety_mod
from app.mira.services import quota_service as quota
from app.mira.services import state_service as state_svc
from app.mira.services.entitlement_bridge import MiraAccess, resolve_access

# Build one engine per process. Real providers when keys + MIRA_REAL=1; else mock.
_USE_MOCK = os.environ.get("MIRA_REAL", "0") != "1"
_registry = build_registry(use_mock=_USE_MOCK)
_pipeline = ChatPipeline(router=Router(providers=_registry))

import logging as _logging
_logging.getLogger("mira.engine").warning(
    "MIRA engine mode: %s (providers: %s)",
    "MOCK — canned answers, dev/test only" if _USE_MOCK else "REAL",
    ", ".join(sorted(_registry.keys())))

EST_TOKENS = 3000


def _course_context(db: Session, user_id: int, course_id: str | None,
                    lesson_id: str | None) -> dict:
    """Best-effort course context so MIRA answers in-lesson, not like generic
    chat. Pulls completed/weak lessons from Marevlo learning progress."""
    ctx = {"course_id": course_id, "lesson_id": lesson_id,
           "completed_lessons": [], "current_concept": None}
    if not course_id:
        return ctx
    try:
        from sqlalchemy import select
        from app.learning.models.learning import LessonProgress
        rows = db.execute(
            select(LessonProgress.lesson_id, LessonProgress.status)
            .where(LessonProgress.user_id == user_id,
                   LessonProgress.course_id == course_id)
        ).all()
        ctx["completed_lessons"] = [lid for lid, st in rows if st == "completed"]
    except Exception:
        pass
    return ctx


def chat(db: Session, user_id: int, question: str,
         course_id: str | None = None, lesson_id: str | None = None,
         problem_id: str | None = None, page_context: str | None = None,
         history: list[dict] | None = None,
         document_id: int | None = None) -> dict:
    t0 = time.time()
    access: MiraAccess = resolve_access(db, user_id)

    # 2. access gate
    if not access.mira_enabled:
        return {"ok": False, "error": "mira_not_enabled",
                "blocks": [{"type": "callout", "variant": "warning",
                            "title": "MIRA isn't available on your plan",
                            "content": "Upgrade your Marevlo plan to use the AI tutor."}],
                "meta": {"answer_format": "redirect"}}

    # 3. token quota
    q = quota.check_and_charge(access, EST_TOKENS)
    if not q["ok"]:
        return {"ok": False, "error": "quota_exceeded",
                "blocks": [{"type": "callout", "variant": "warning",
                            "title": "You've used your questions for now",
                            "content": "Your quota resets at the end of your billing period."}],
                "meta": {"answer_format": "redirect",
                         "quota": quota.get_usage(db, access)}}

    # 4→FIRST. SAFETY gate — issue #11: this must run BEFORE intent
    # classification, because classify_intent's LLM fallback would otherwise
    # send unsafe text to a provider before any verdict exists. It also scans
    # the client-supplied history and page_context, which are pasted into the
    # model prompt and were previously an unchecked bypass channel.
    # Document grounding (paper Q&A / course grounding share this path):
    # retrieve BEFORE the safety gate so the doc excerpts are scanned as a
    # prompt channel like history/page_context (issue #11 discipline).
    doc_context = ""
    doc_meta = None
    if document_id is not None:
        try:
            from app.mira.services import document_service as _docs
            _r = _docs.retrieve(db, question=question, doc_id=document_id,
                                user_id=user_id)
            if _r:
                doc_context = _docs.grounding_block(_r)
                doc_meta = _r["doc"]
        except Exception:
            # retrieval is an enhancement — its failure must never kill the turn
            doc_context, doc_meta = "", None
    # Course grounding rides the SAME retrieval substrate: if the learner is
    # inside a course (and didn't pin an uploaded doc), pull the most relevant
    # ingested lesson text. No-op until lessons are ingested via
    # document_service.ingest_text(scope="course", ...).
    if not doc_context and course_id:
        try:
            from app.mira.services import document_service as _docs
            _r = _docs.retrieve(db, question=question, scope="course",
                                owner_key=course_id, lesson_id=lesson_id)
            if _r is None and lesson_id:
                _r = _docs.retrieve(db, question=question, scope="course",
                                    owner_key=course_id)
            if _r:
                doc_context = _docs.grounding_block(_r, source_label="course lesson")
                doc_meta = _r["doc"]
        except Exception:
            pass
    verdict = safety_mod.check_safety_all(question, history=history,
                                          page_context=page_context,
                                          doc_context=doc_context or None)
    clf_provider = _registry.get("qwen") or _registry.get("mock")
    if verdict.allowed and verdict.needs_llm_review and clf_provider is not None:
        verdict = safety_mod.llm_safety_check(question, clf_provider)
    if not verdict.allowed:
        quota.reconcile(access, EST_TOKENS, 0)  # refund
        return {"ok": True, "blocks": safety_mod.safety_block_blocks(verdict.reason),
                "meta": {"intent": "REFUSED", "answer_format": "refused_safety",
                         "served_from": "safety_gate", "quota": quota.get_usage(db, access)}}

    # 5. pre-classify (cheap) for build-credit gating — AFTER safety cleared.
    cls = classify_intent(question, provider=clf_provider)

    # BUILD-credit reservation BEFORE the model call (cost protection)
    build_reserved = False
    if cls.intent == Intent.BUILD and cls.in_core_domain:
        credit = quota.charge_build_credit(db, access, n=1)
        if not credit["ok"]:
            quota.reconcile(access, EST_TOKENS, 0)
            return {"ok": False, "error": "build_credits_exhausted",
                    "blocks": [{"type": "callout", "variant": "warning",
                                "title": "Out of build credits",
                                "content": ("Building an app draws build credits. You're out — "
                                            "top up, or ask a learning/coding question which uses "
                                            "your normal quota.")}],
                    "meta": {"intent": "BUILD", "answer_format": "redirect",
                             "build_credits": credit.get("remaining_credits", 0)}}
        build_reserved = True

    # 6. run the engine, course-aware
    state = state_svc.load_state(db, user_id, access.plan)
    course_ctx = _course_context(db, user_id, course_id, lesson_id)
    ctx = TurnContext(monthly_turn_budget=access.token_limit // quota.TOKENS_PER_QUESTION)
    # Issue #10: hand the already-computed classification to the pipeline so it
    # doesn't classify a second time (saves a provider call and prevents the
    # credit-gate vs answer-shape disagreement).
    ctx.precomputed_cls = cls
    # ── Router v2 inputs ──────────────────────────────────────────────────
    # Escalate-on-evidence: a fail signal in the last 10 minutes (checkpoint
    # miss, "explain differently", thumbs-down) means the cheap lane just
    # demonstrably failed this learner — the next turn earns the premium
    # retry, bypassing the taper (but never the margin floor).
    try:
        from datetime import datetime, timedelta
        from sqlalchemy import select as _sel
        from app.mira.models.turn_logs import MiraTurnSignal as _Sig
        recent_fail = db.execute(_sel(_Sig.id).where(
            _Sig.user_id == user_id,
            _Sig.kind.in_(("checkpoint_fail", "explain_differently",
                           "thumbs_down")),
            _Sig.created_at >= datetime.utcnow() - timedelta(minutes=10),
        ).limit(1)).first()
        ctx.escalate = recent_fail is not None
    except Exception:
        ctx.escalate = False
    # Margin ledger: this window's model spend vs this plan's revenue. Past
    # the cap (MIRA_MARGIN_CAP, default 60% of revenue) every turn rides
    # MiniMax — an absolute floor under the taper, so no single user's month
    # can go margin-negative.
    try:
        import os as _os
        from app.mira.services.turn_logger import window_cost as _wcost
        _rev = {"plus": 799.0, "pro": 1499.0, "day": 99.0}.get(access.plan, 0.0)
        if _rev > 0:
            _cap = float(_os.environ.get("MIRA_MARGIN_CAP", "0.6"))
            _since = access.period_start
            if _since is None:
                from datetime import datetime as _dt
                _since = _dt.utcnow().replace(day=1, hour=0, minute=0,
                                              second=0, microsecond=0)
            ctx.margin_blocked = _wcost(db, user_id, _since) >= _cap * _rev
        else:
            ctx.margin_blocked = False
    except Exception:
        ctx.margin_blocked = False
    # Issue #14: populate turns_used_this_period so the GPT cost-taper actually
    # engages (it was always 0 → every hard turn went to GPT regardless of a
    # heavy user's volume). Sourced from the live per-window question counter.
    try:
        ctx.turns_used_this_period = quota.questions_used(access)
    except Exception:
        ctx.turns_used_this_period = 0
    # attach course context if the engine TurnContext supports it
    for k, v in course_ctx.items():
        try:
            setattr(ctx, k, v)
        except Exception:
            pass
    # attach the (thread-accurate) conversation history so the engine can resolve
    # follow-ups like "provide me code" / "explain step by step" in context.
    if history:
        try:
            ctx.history = history
        except Exception:
            pass
    # attach the current page / problem context so MIRA can help solve THIS
    # problem (its statement + the user's live code + last error).
    try:
        ctx.problem_id = problem_id
        ctx.page_context = page_context
    except Exception:
        pass
    # attach retrieved document grounding so the pipeline answers FROM the
    # learner's material, with page citations, instead of from thin air.
    if doc_context:
        try:
            ctx.doc_context = doc_context
            ctx.doc_meta = doc_meta
        except Exception:
            pass
    # Inject a course-specific KnowledgeBase built from the course's concept
    # lattice (mira_concept_lattices). This is what makes runtime concept
    # matching use real Marevlo course concepts instead of the built-in 16.
    if course_id:
        try:
            from app.mira.engine.knowledge import get_course_kb
            ctx.course_kb = get_course_kb(db, course_id)
        except Exception:
            pass
    try:
        result = _pipeline.handle(state, question, ctx)
    except Exception:
        quota.reconcile(access, EST_TOKENS, 0)
        if build_reserved:
            quota.credit_grant(db, user_id, 1, reason="refund")
        raise

    # Issue #7: refund the reserved build credit whenever the turn did NOT
    # produce a real answer — provider failure (queued), a broken parse
    # (prose_fallback), or a redirect (a BUILD classified pre-pipeline that the
    # pipeline then refused/redirected must not silently burn a paid credit).
    if build_reserved and (result.served_from in ("queued", "prose_fallback")
                           or result.answer_format == "redirect"):
        quota.credit_grant(db, user_id, 1, reason="refund")
        build_reserved = False

    # 7. reconcile quota fairly
    real_tokens = (result.in_tokens or 0) + (result.out_tokens or 0)
    if result.answer_format == "redirect":
        charged = 0  # issue #7: a refusal/redirect is not an answer — never charge
    elif result.served_from == "cache":
        charged = 200
    elif result.served_from == "golden":
        charged = 200
    elif result.served_from in ("queued", "prose_fallback", "none"):
        charged = 0
    else:
        charged = real_tokens if real_tokens > 0 else 0
    quota.reconcile(access, EST_TOKENS, charged)

    # 8. persist state + durable audit
    state_svc.save_state(db, user_id, state)
    request_id = uuid.uuid4().hex[:16]
    state_svc.log_usage(
        db, user_id, request_id=request_id, course_id=course_id, lesson_id=lesson_id,
        concept=result.concept, intent=result.intent, answer_format=result.answer_format,
        provider=result.provider, served_from=result.served_from,
        estimated_tokens=EST_TOKENS, actual_tokens=real_tokens, charged_tokens=charged,
        build_credit_delta=(1 if build_reserved else 0), cost_inr=float(result.cost_inr),
        latency_ms=int((time.time() - t0) * 1000))

    # 9. count this answered turn against the user-facing question limit. Skip
    # pure redirects (out-of-scope / "I can't help with that") — those didn't
    # actually answer the user's question, so they shouldn't burn a slot.
    if result.answer_format != "redirect":
        quota.commit_question(access)

    if getattr(ctx, "escalate", False) and str(result.provider or "").startswith("gpt"):
        from app.mira.services import turn_logger as _tl_esc
        _tl_esc.record_signal(db, turn_id=request_id, user_id=user_id,
                              kind="escalated", detail=result.provider)
    # MIRA-1 phase 0: capture the (context, answer) pair + routing facts.
    # Never blocks or breaks the turn (logger is failure-isolated).
    from app.mira.services import turn_logger as _tlog
    _tlog.log_turn(
        db, turn_id=request_id, user_id=user_id, question=question,
        history=history, page_context=page_context,
        doc_context=doc_context or None, course_id=course_id,
        lesson_id=lesson_id, level=getattr(state, "level", None) and str(state.level),
        style=getattr(state, "style", None) and str(state.style),
        intent=result.intent, concept=result.concept, lane=result.provider,
        served_from=result.served_from,
        parse_ok=result.served_from != "prose_fallback",
        in_tokens=getattr(result, "in_tokens", 0),
        out_tokens=getattr(result, "out_tokens", 0),
        cost_inr=result.cost_inr or 0.0, latency_ms=result.latency_ms or 0,
        blocks=result.blocks)
    return {"ok": True, "blocks": result.blocks,
            "meta": {"request_id": request_id, "intent": result.intent,
                     "answer_format": result.answer_format, "concept": result.concept,
                     "depth": result.depth, "served_from": result.served_from,
                     "domain": result.domain, "topic": result.topic,
                     "subtopic": result.subtopic,
                     "course_id": course_id, "lesson_id": lesson_id,
                     "quota": quota.get_usage(db, access)}}


def profile(db: Session, user_id: int) -> dict:
    access = resolve_access(db, user_id)
    state = state_svc.load_state(db, user_id, access.plan)
    return {"access": access.to_dict(),
            "state": state.to_dict(),
            "quota": quota.get_usage(db, access)}
