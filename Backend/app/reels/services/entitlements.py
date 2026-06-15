"""Entitlements — the metered free-unlock paywall for reel-anchored problems.

Mechanic (Sid's design):
  Free users get N free problem unlocks via reels (default 2 — e.g. they
  watch the Two Sum reel, tap "Practice", it opens free; same for 3Sum;
  the third anchored problem shows a lock and an upgrade CTA).

Rules:
  - Paid/admin users are never gated.
  - A problem the user already attempted or solved is never gated
    (grandfathered — we never take access away).
  - Unlocks are idempotent per (user, problem): re-watching a reel for an
    already-unlocked problem costs nothing.
  - Anonymous users are not metered here; they hit the signup wall first
    and get their N free unlocks after registering.

Config:
  REELS_FREE_PROBLEM_UNLOCKS  (env, default "2")
  REELS_UNLOCK_WINDOW_DAYS    (env, default "0" = lifetime quota;
                               set e.g. "7" for a weekly-resetting meter)
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.exceptions import Forbidden, NotFound
from app.reels.models.reel import Reel, ReelProblemUnlock

FREE_UNLOCK_LIMIT = int(os.getenv("REELS_FREE_PROBLEM_UNLOCKS", "2"))
UNLOCK_WINDOW_DAYS = int(os.getenv("REELS_UNLOCK_WINDOW_DAYS", "0"))


def is_paid_user(user) -> bool:
    """Paid-tier check.

    TODO(dev): when the payments/subscription model lands, replace the
    attribute sniffing below with a real subscription lookup. Until then,
    admins and any user flagged premium are treated as paid; everyone
    else is on the free meter.
    """
    if user is None:
        return False
    if getattr(user, "is_admin", False):
        return True
    if getattr(user, "is_premium", False) or getattr(user, "is_paid", False):
        return True
    if getattr(user, "role", "") in ("admin", "premium", "pro"):
        return True
    return False


@dataclass
class Entitlement:
    is_paid: bool
    problem_unlocked: bool          # this specific problem is open for this user
    unlocks_used: int
    unlocks_remaining: int


def _window_start():
    if UNLOCK_WINDOW_DAYS <= 0:
        return None
    return datetime.now(timezone.utc) - timedelta(days=UNLOCK_WINDOW_DAYS)


def get_entitlement(db: Session, user, problem_id: int | None) -> Entitlement:
    if is_paid_user(user):
        return Entitlement(True, True, 0, FREE_UNLOCK_LIMIT)
    if user is None:
        # anon: not metered; resolver routes them to signup/guest flows
        return Entitlement(False, False, 0, FREE_UNLOCK_LIMIT)

    q = db.query(func.count(ReelProblemUnlock.id)).filter(
        ReelProblemUnlock.user_id == user.id)
    ws = _window_start()
    if ws is not None:
        q = q.filter(ReelProblemUnlock.created_at >= ws)
    used = q.scalar() or 0

    unlocked = False
    if problem_id is not None:
        unlocked = db.query(ReelProblemUnlock.id).filter(
            ReelProblemUnlock.user_id == user.id,
            ReelProblemUnlock.problem_id == problem_id,
        ).first() is not None

    return Entitlement(False, unlocked, used, max(0, FREE_UNLOCK_LIMIT - used))


def consume_unlock(db: Session, *, user, reel: Reel) -> dict:
    """Spend one free unlock on the reel's anchored problem.

    Idempotent: already-unlocked problems and paid users return success
    without consuming quota.
    """
    pa = next((a for a in reel.anchors if a.anchor_type == "problem"), None)
    if pa is None:
        raise NotFound("This reel has no anchored problem")
    problem_id = int(pa.anchor_id)

    ent = get_entitlement(db, user, problem_id)
    if ent.is_paid or ent.problem_unlocked:
        return {"unlocked": True, "problemId": problem_id,
                "remaining": ent.unlocks_remaining, "consumed": False}
    if ent.unlocks_remaining <= 0:
        raise Forbidden("Free reel unlocks used — upgrade to keep practicing")

    db.add(ReelProblemUnlock(user_id=user.id, problem_id=problem_id, reel_id=reel.id))
    db.commit()
    return {"unlocked": True, "problemId": problem_id,
            "remaining": ent.unlocks_remaining - 1, "consumed": True}
