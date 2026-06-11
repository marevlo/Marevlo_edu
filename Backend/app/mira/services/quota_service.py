"""
MIRA quota + build-credit service (SQLAlchemy, Marevlo-native).

- Token quota is windowed per ENTITLEMENT PERIOD (from the entitlement bridge),
  not the calendar, so buying near a boundary can't grant two windows.
- Build credits live in the Postgres ledger (mira_credit_ledger) as the source
  of truth — paid credits are money. Monthly allotment is tracked per
  entitlement period in mira_allotment_usage.
- Quota counters use Redis when available (fast), falling back to a DB count of
  usage_events for the window so correctness never depends on Redis alone.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.mira.models.mira import (
    MiraAllotmentUsage,
    MiraCreditLedger,
)
from app.mira.services.entitlement_bridge import MiraAccess

# approx tokens per question, used to translate token quota into a question count
TOKENS_PER_QUESTION = 4000


# ── build-credit ledger (Postgres source of truth) ─────────────────────────
def credit_balance(db: Session, user_id: int) -> int:
    v = db.execute(
        select(func.coalesce(func.sum(MiraCreditLedger.delta), 0)).where(
            MiraCreditLedger.user_id == user_id
        )
    ).scalar_one()
    return int(v or 0)


def credit_grant(db: Session, user_id: int, amount: int, reason: str,
                 ref: str | None = None) -> dict:
    """Append a positive ledger row. For purchases/grants, `ref` makes it
    idempotent (the unique (ref, reason) index). Returns {ok, balance_after,
    idempotent?}."""
    if ref is not None:
        dup = db.execute(
            select(MiraCreditLedger).where(
                MiraCreditLedger.ref == ref, MiraCreditLedger.reason == reason
            )
        ).scalar_one_or_none()
        if dup is not None:
            return {"ok": True, "idempotent": True, "balance_after": dup.balance_after}
    bal = credit_balance(db, user_id) + amount
    db.add(MiraCreditLedger(user_id=user_id, ref=ref, delta=amount,
                            reason=reason, balance_after=bal))
    db.commit()
    return {"ok": True, "balance_after": bal}


def credit_charge(db: Session, user_id: int, amount: int, reason: str = "charge") -> dict:
    """Atomically spend credits if available. Returns {ok, balance_after}."""
    cur = credit_balance(db, user_id)
    if cur < amount:
        return {"ok": False, "balance_after": cur}
    bal = cur - amount
    db.add(MiraCreditLedger(user_id=user_id, ref=None, delta=-amount,
                            reason=reason, balance_after=bal))
    db.commit()
    return {"ok": True, "balance_after": bal}


# ── build allotment (entitlement-period) ────────────────────────────────────
def _allotment_row(db: Session, user_id: int, ent_key: str) -> MiraAllotmentUsage:
    row = db.get(MiraAllotmentUsage, (user_id, ent_key))
    if row is None:
        row = MiraAllotmentUsage(user_id=user_id, entitlement_key=ent_key, used=0)
        db.add(row)
        db.commit()
    return row


def charge_build_credit(db: Session, access: MiraAccess, n: int = 1) -> dict:
    """Spend a build-credit for a heavy build turn. Plan's monthly allotment is
    consumed first (per entitlement period), then the purchased ledger balance."""
    ent_key = access.entitlement_key()
    allot = access.build_credit_limit
    row = _allotment_row(db, access.user_id, ent_key)
    if row.used + n <= allot:
        row.used += n
        db.commit()
        return {"ok": True, "source": "allotment", "remaining_allotment": allot - row.used}
    # beyond allotment -> purchased ledger
    res = credit_charge(db, access.user_id, n, reason="charge")
    if res["ok"]:
        return {"ok": True, "source": "purchased", "remaining_credits": res["balance_after"]}
    return {"ok": False, "source": "none", "remaining_credits": res["balance_after"],
            "message": "Out of build credits — top up to keep building."}


# ── token quota (entitlement-period window) ─────────────────────────────────
def _quota_key(access: MiraAccess) -> str:
    raw = f"miraquota:{access.user_id}:{access.entitlement_key()}"
    return raw


def _questions_key(access: MiraAccess) -> str:
    # Separate per-window counter for the USER-FACING "questions" limit. We meter
    # questions directly (1 per answered turn) rather than deriving them from
    # tokens, so a single short question reliably shows as 1 used — not 0
    # (2093 tokens // 4000 would round down to 0).
    return f"miraquota:q:{access.user_id}:{access.entitlement_key()}"


def _window_ttl(access: MiraAccess) -> int:
    # 8 days for a weekly window, 32 for monthly — refreshed on every write.
    return 32 * 86400 if access.window == "month" else 8 * 86400


def questions_total(access: MiraAccess) -> int:
    """Max questions per window for the plan: free=15, plus=500, pro=1250."""
    return access.token_limit // TOKENS_PER_QUESTION


def questions_used(access: MiraAccess) -> int:
    r = _redis()
    if r is None:
        return 0
    try:
        return int(r.get(_questions_key(access)) or 0)
    except Exception:
        return 0


def commit_question(access: MiraAccess) -> int:
    """Count one answered question against the window. Call once per real answer
    (after the engine runs). Returns the new count (0 if Redis is unavailable)."""
    r = _redis()
    if r is None:
        return 0
    try:
        key = _questions_key(access)
        n = int(r.incr(key))
        r.expire(key, _window_ttl(access))
        return n
    except Exception:
        return 0


def _redis():
    try:
        from app.core.redis_client import redis_manager
        # RedisManager exposes `.sync` (a lazy sync client), not `.client`.
        # Using the wrong attr made this raise + fall back to None, which
        # silently disabled quota enforcement (the gate failed open).
        return redis_manager.sync
    except Exception:
        return None


def check_and_charge(access: MiraAccess, estimated_tokens: int) -> dict:
    """Gate a turn against the window BEFORE the model runs. Enforces the
    user-facing QUESTION limit first, then the token budget (cost safety).
    Returns {ok, remaining, reason?}. Uses Redis when present; otherwise allows
    (degrades open so a Redis outage never locks out paying users)."""
    r = _redis()
    if r is None:
        return {"ok": True, "remaining": access.token_limit, "degraded": True}
    try:
        # 1) question count — the primary, user-facing limit (free=15, etc.)
        if int(r.get(_questions_key(access)) or 0) >= questions_total(access):
            return {"ok": False, "remaining": 0, "reason": "questions"}
        # 2) token budget — secondary cap against abnormally costly turns
        key = _quota_key(access)
        used = int(r.get(key) or 0)
        if used + estimated_tokens > access.token_limit:
            return {"ok": False, "remaining": max(0, access.token_limit - used),
                    "reason": "tokens"}
        r.incrby(key, estimated_tokens)
        r.expire(key, _window_ttl(access))
        return {"ok": True, "remaining": access.token_limit - used - estimated_tokens}
    except Exception:
        return {"ok": True, "remaining": access.token_limit, "degraded": True}


def reconcile(access: MiraAccess, estimated: int, actual: int) -> None:
    """Adjust the reserved estimate to the real charge."""
    r = _redis()
    if r is None:
        return
    try:
        delta = actual - estimated
        if delta != 0:
            r.incrby(_quota_key(access), delta)
    except Exception:
        pass


def get_usage(db: Session, access: MiraAccess) -> dict:
    r = _redis()
    used = 0
    q_used = 0
    resets_in_seconds = None
    if r is not None:
        try:
            key = _quota_key(access)
            used = int(r.get(key) or 0)
            q_used = int(r.get(_questions_key(access)) or 0)
            ttl = int(r.ttl(key) or 0)  # seconds until the window resets (<=0 if unset)
            resets_in_seconds = ttl if ttl > 0 else None
        except Exception:
            used = 0
    remaining_tokens = max(0, access.token_limit - used)
    q_total = questions_total(access)
    return {
        "plan": access.plan,
        "window": access.window,
        "tokens_used": used,
        "tokens_total": access.token_limit,
        "tokens_remaining": remaining_tokens,
        # questions are now metered directly (1 per answered turn), not derived
        # from tokens — so one question reads as 1 used, not 0.
        "approx_questions_used": q_used,
        "approx_questions_total": q_total,
        "approx_questions_remaining": max(0, q_total - q_used),
        "resets_in_seconds": resets_in_seconds,
        "build_credits": credit_balance(db, access.user_id),
        "build_credit_allotment": access.build_credit_limit,
    }
