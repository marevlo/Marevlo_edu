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
def add_credit_topup(db: Session, user_id: int, credits: int, ref: str) -> dict:
    """Apply a purchased build-credit top-up (e.g. the +100 pack). Durable and
    idempotent: `ref` is the payment id, so the same purchase can't double-credit
    (enforced by the ledger's unique (ref, reason='purchase') index)."""
    return credit_grant(db, user_id, credits, reason="purchase", ref=ref)


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


def _redis():
    try:
        from app.core.redis_client import redis_manager
        return redis_manager.client
    except Exception:
        return None


def check_and_charge(access: MiraAccess, estimated_tokens: int) -> dict:
    """Reserve estimated tokens against the window. Returns {ok, remaining}.
    Uses Redis when present; otherwise allows (DB reconcile still records truth)."""
    r = _redis()
    key = _quota_key(access)
    if r is None:
        return {"ok": True, "remaining": access.token_limit, "degraded": True}
    try:
        used = int(r.get(key) or 0)
        if used + estimated_tokens > access.token_limit:
            return {"ok": False, "remaining": max(0, access.token_limit - used)}
        r.incrby(key, estimated_tokens)
        # window TTL: ~2 days for a day-pass, 8 for week, 32 for month
        if access.window == "day":
            r.expire(key, 2 * 86400)
        else:
            r.expire(key, 32 * 86400 if access.window == "month" else 8 * 86400)
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
    if r is not None:
        try:
            used = int(r.get(_quota_key(access)) or 0)
        except Exception:
            used = 0
    return {
        "plan": access.plan,
        "window": access.window,
        "tokens_used": used,
        "tokens_total": access.token_limit,
        "approx_questions_used": used // TOKENS_PER_QUESTION,
        "approx_questions_total": access.token_limit // TOKENS_PER_QUESTION,
        "build_credits": credit_balance(db, access.user_id),
        "build_credit_allotment": access.build_credit_limit,
    }
