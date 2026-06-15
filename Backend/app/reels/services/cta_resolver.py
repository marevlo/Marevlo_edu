"""CTA resolver — the heart of Marevlo Reels.

Pure function of (viewer context, reel anchors, source surface). The
behavioral spec was validated in the interactive prototype; the persona
matrix below must stay in sync with it.

Persona derivation:
  anon        — no authenticated user
  new_user    — authed, no submission rows for the anchored problem
  attempted   — authed, submissions exist, none accepted
  solved      — authed, has an accepted submission
  enrolled    — reserved hook: wire to course enrollment when that model
                lands (see build_viewer_context TODO)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.reels.models.reel import Reel, ReelAnchor


@dataclass
class ViewerContext:
    persona: str  # anon | new_user | attempted | solved | enrolled
    user_id: Optional[int]
    source: str  # problem_page | topic_page | floater | public | search
    enrolled_course_label: Optional[str] = None
    # entitlements (metered paywall — see services/entitlements.py)
    is_paid: bool = False
    problem_unlocked: bool = False
    free_unlocks_remaining: int = 0


@dataclass
class ResolvedCTA:
    label: str
    action: str  # open_problem_guest | signup | open_problem | reattempt | back_to_ide | variant | course | topic_problems | mira
    target_type: Optional[str]  # problem | topic | course | None
    target_id: Optional[str]
    why: str


def _problem_anchor(reel: Reel) -> Optional[ReelAnchor]:
    return next((a for a in reel.anchors if a.anchor_type == "problem"), None)


def _topic_anchor(reel: Reel) -> Optional[ReelAnchor]:
    return next((a for a in reel.anchors if a.anchor_type == "topic"), None)


def resolve_cta(ctx: ViewerContext, reel: Reel) -> ResolvedCTA:
    pa = _problem_anchor(reel)
    ta = _topic_anchor(reel)

    if ctx.persona == "anon":
        if pa:
            return ResolvedCTA(
                label="Try this problem — free, no signup",
                action="open_problem_guest", target_type="problem", target_id=pa.anchor_id,
                why="anonymous viewer + problem anchor → lowest-friction conversion",
            )
        return ResolvedCTA(
            label="Start learning on Marevlo", action="signup",
            target_type=None, target_id=None,
            why="anonymous viewer + topic-level reel → general conversion",
        )

    if pa:
        # ── metered paywall: only free users on never-touched problems ──
        # attempted/solved users are grandfathered; paid users never gated.
        if (not ctx.is_paid and ctx.persona == "new_user"
                and not ctx.problem_unlocked):
            if ctx.free_unlocks_remaining > 0:
                n = ctx.free_unlocks_remaining
                return ResolvedCTA(
                    label=f"Practice: {pa.label} — free unlock ({n} left)",
                    action="practice_free", target_type="problem", target_id=pa.anchor_id,
                    why=f"free user, {n} of their free reel unlocks remaining → open it free, build the habit",
                )
            return ResolvedCTA(
                label=f"Unlock with Pro: {pa.label}",
                action="unlock_paywall", target_type="problem", target_id=pa.anchor_id,
                why="free reel unlocks used up → the reel created the desire, Pro opens the door",
            )

        if ctx.persona == "attempted":
            return ResolvedCTA(
                label=f"Re-attempt: {pa.label}", action="reattempt",
                target_type="problem", target_id=pa.anchor_id,
                why="viewer attempted & failed this problem → re-attempt beats restart",
            )
        if ctx.persona == "solved":
            return ResolvedCTA(
                label="Try a harder variant", action="variant",
                target_type="problem", target_id=pa.anchor_id,
                why="viewer already solved this → escalate, don't repeat",
            )
        if ctx.persona == "enrolled" and ctx.enrolled_course_label:
            return ResolvedCTA(
                label=f"Continue: {ctx.enrolled_course_label}", action="course",
                target_type="course", target_id=None,
                why="enrolled viewer → resume course flow over one-off practice",
            )
        if ctx.source == "problem_page":
            return ResolvedCTA(
                label="Continue solving", action="back_to_ide",
                target_type="problem", target_id=pa.anchor_id,
                why="came from the problem page mid-attempt → return to the editor",
            )
        return ResolvedCTA(
            label=f"Practice: {pa.label}", action="open_problem",
            target_type="problem", target_id=pa.anchor_id,
            why="logged in, never attempted + problem anchor → direct practice",
        )

    # No problem anchor — topic/concept-level reel
    if ctx.persona == "enrolled" and ctx.enrolled_course_label:
        return ResolvedCTA(
            label=f"Continue course: {ctx.enrolled_course_label}", action="course",
            target_type="course", target_id=None,
            why="enrolled viewer + topic reel in current module → continue, don't fork",
        )
    if ctx.persona in ("attempted", "solved") and ta:
        from app.reels.services.taxonomy import PRACTICE_TOPIC_SLUGS
        if ta.anchor_id in PRACTICE_TOPIC_SLUGS:
            return ResolvedCTA(
                label="Practice similar problems", action="topic_problems",
                target_type="topic", target_id=ta.anchor_id,
                why="active in this DSA topic + concept reel → route to topic problem set",
            )
        # AI/DS topics have no problem bank — never redirect; continue in MIRA
    return ResolvedCTA(
        label="Ask MIRA about this", action="mira",
        target_type=None, target_id=None,
        why="concept-level reel, no problem anchor → MIRA continues the explanation",
    )


def build_viewer_context(
    db: Session, user, source: str, reel: Reel
) -> ViewerContext:
    """Derive the persona from real platform state.

    Uses ProblemSubmission (status == "accepted" per
    app/submissions/services/submission_service.py).

    TODO(dev): when course enrollment exists as a model, set persona
    "enrolled" + enrolled_course_label here; resolver already supports it.
    """
    from app.reels.services.entitlements import get_entitlement

    if user is None:
        return ViewerContext(persona="anon", user_id=None, source=source)

    pa = _problem_anchor(reel)
    persona = "new_user"
    if pa is not None:
        try:
            from app.submissions.models.submission import ProblemSubmission

            pid = int(pa.anchor_id)
            rows = (
                db.query(ProblemSubmission.status)
                .filter(
                    ProblemSubmission.user_id == user.id,
                    ProblemSubmission.problem_id == pid,
                )
                .limit(200)
                .all()
            )
            if rows:
                persona = (
                    "solved"
                    if any((s or "").lower() == "accepted" for (s,) in rows)
                    else "attempted"
                )
        except Exception:  # noqa: BLE001 — never let persona derivation break playback
            persona = "new_user"

    pid_int = None
    if pa is not None:
        try:
            pid_int = int(pa.anchor_id)
        except (TypeError, ValueError):
            pid_int = None
    ent = get_entitlement(db, user, pid_int)
    return ViewerContext(persona=persona, user_id=user.id, source=source,
                         is_paid=ent.is_paid,
                         problem_unlocked=ent.problem_unlocked,
                         free_unlocks_remaining=ent.unlocks_remaining)
