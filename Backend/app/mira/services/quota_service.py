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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.mira.models.mira import (
    MiraAllotmentUsage,
    MiraCreditLedger,
)
from app.mira.services.entitlement_bridge import MiraAccess

# approx tokens per question, used to translate token quota into a question count
TOKENS_PER_QUESTION = 4000


def _supports_row_lock(db: Session) -> bool:
    """SQLite ignores SELECT ... FOR UPDATE (and SQLAlchemy emits a warning).
    Only request row locks on a backend that honors them (Postgres in prod)."""
    try:
        return db.bind.dialect.name not in ("sqlite",)
    except Exception:
        return False


# ── build-credit ledger (Postgres source of truth) ─────────────────────────
def credit_balance(db: Session, user_id: int, lock: bool = False) -> int:
    """Current balance = SUM(delta). When `lock` is set (and the backend
    supports it), row-lock this user's ledger rows so a concurrent
    charge/grant in another transaction serializes behind us — closing the
    read-balance-then-insert double-spend race (issue #9)."""
    if lock and _supports_row_lock(db):
        # lock the user's existing ledger rows, then sum within the same txn
        db.execute(
            select(MiraCreditLedger.id)
            .where(MiraCreditLedger.user_id == user_id)
            .with_for_update()
        ).all()
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
    idempotent?}.

    Issue #9: idempotency is enforced by the DB unique constraint, not just the
    pre-check — two concurrent replays of the same payment race past the SELECT
    but the second INSERT hits uq_mira_credit_ref_reason; we catch that and
    return the existing row instead of double-crediting."""
    if ref is not None:
        dup = db.execute(
            select(MiraCreditLedger).where(
                MiraCreditLedger.ref == ref, MiraCreditLedger.reason == reason
            )
        ).scalar_one_or_none()
        if dup is not None:
            return {"ok": True, "idempotent": True, "balance_after": dup.balance_after}
    bal = credit_balance(db, user_id, lock=True) + amount
    db.add(MiraCreditLedger(user_id=user_id, ref=ref, delta=amount,
                            reason=reason, balance_after=bal))
    try:
        db.commit()
    except IntegrityError:
        # concurrent duplicate (ref, reason) — the other txn won; return its row.
        db.rollback()
        if ref is not None:
            dup = db.execute(
                select(MiraCreditLedger).where(
                    MiraCreditLedger.ref == ref, MiraCreditLedger.reason == reason
                )
            ).scalar_one_or_none()
            if dup is not None:
                return {"ok": True, "idempotent": True, "balance_after": dup.balance_after}
        raise
    return {"ok": True, "balance_after": bal}


def add_credit_topup(db: Session, user_id: int, amount: int, ref: str) -> dict:
    """Build-credit purchase (build_pack_700 / topup_credits_100). Durable
    ledger row, idempotent per payment ref — a PayU retry returns the original
    grant instead of double-crediting."""
    return credit_grant(db, user_id, amount, reason="purchase", ref=ref)


def add_question_topup(db: Session, user_id: int, questions: int, ref: str) -> dict:
    """"+N questions" purchase — extends the buyer's CURRENT quota window by
    questions * TOKENS_PER_QUESTION. Idempotent per payment ref (unique
    constraint, issue #9 discipline: DB enforces, not just the pre-check)."""
    from sqlalchemy.exc import IntegrityError as _IE
    from app.mira.models.topups import MiraQuestionTopup
    from app.mira.services.entitlement_bridge import resolve_access as _resolve
    dup = db.execute(select(MiraQuestionTopup).where(
        MiraQuestionTopup.ref == ref)).scalar_one_or_none()
    if dup is not None:
        return {"ok": True, "idempotent": True, "questions": dup.questions}
    access = _resolve(db, user_id)
    db.add(MiraQuestionTopup(user_id=user_id, window_key=access.entitlement_key(),
                             questions=questions,
                             tokens=questions * TOKENS_PER_QUESTION, ref=ref))
    try:
        db.commit()
    except _IE:
        db.rollback()
        dup = db.execute(select(MiraQuestionTopup).where(
            MiraQuestionTopup.ref == ref)).scalar_one_or_none()
        if dup is not None:
            return {"ok": True, "idempotent": True, "questions": dup.questions}
        raise
    return {"ok": True, "questions": questions}


def credit_charge(db: Session, user_id: int, amount: int, reason: str = "charge") -> dict:
    """Atomically spend credits if available. Returns {ok, balance_after}.

    Issue #9: balance is read under a row lock so two concurrent BUILD turns
    can't both pass the affordability check and drive the balance negative."""
    cur = credit_balance(db, user_id, lock=True)
    if cur < amount:
        db.rollback()  # release the lock; nothing written
        return {"ok": False, "balance_after": cur}
    bal = cur - amount
    db.add(MiraCreditLedger(user_id=user_id, ref=None, delta=-amount,
                            reason=reason, balance_after=bal))
    db.commit()
    return {"ok": True, "balance_after": bal}


# ── build allotment (entitlement-period) ────────────────────────────────────
def _allotment_row(db: Session, user_id: int, ent_key: str) -> MiraAllotmentUsage:
    """Get-or-create the per-period allotment row. Issue #9: two concurrent
    first-requests both saw no row and both INSERTed → composite-PK
    IntegrityError → 500. Now we catch that race and re-read the winner's row."""
    row = db.get(MiraAllotmentUsage, (user_id, ent_key))
    if row is None:
        row = MiraAllotmentUsage(user_id=user_id, entitlement_key=ent_key, used=0)
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            row = db.get(MiraAllotmentUsage, (user_id, ent_key))
    return row


def charge_build_credit(db: Session, access: MiraAccess, n: int = 1) -> dict:
    """Spend a build-credit for a heavy build turn. Plan's monthly allotment is
    consumed first (per entitlement period), then the purchased ledger balance.

    Issue #9: the allotment increment is done under a row lock + bounded UPDATE
    so two concurrent turns can't both consume the same last allotment slot."""
    ent_key = access.entitlement_key()
    allot = access.build_credit_limit
    row = _allotment_row(db, access.user_id, ent_key)
    if row is not None and _supports_row_lock(db):
        # re-fetch under lock so the check-then-increment is atomic
        row = db.execute(
            select(MiraAllotmentUsage)
            .where(MiraAllotmentUsage.user_id == access.user_id,
                   MiraAllotmentUsage.entitlement_key == ent_key)
            .with_for_update()
        ).scalar_one_or_none() or row
    if row is not None and row.used + n <= allot:
        row.used += n
        db.commit()
        return {"ok": True, "source": "allotment", "remaining_allotment": allot - row.used}
    # beyond allotment -> purchased ledger (row-locked inside credit_charge)
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
    """Redis TTL per window type — refreshed on every write. Must comfortably
    exceed the window so counters never vanish mid-window, and should not
    linger absurdly after it (TTL-audit follow-up to issue #13/#16):
      month -> 32d, week -> 8d, day (₹99 pass) -> 2d (entitlement dies at 24h;
      previously day fell into the 8d else-branch — harmless but incoherent)."""
    return {"month": 32 * 86400, "week": 8 * 86400, "day": 2 * 86400}.get(
        access.window, 8 * 86400)


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
    (degrades open so a Redis outage never locks out paying users).

    Issue #9: the question-check + token-check + reserve are done in ONE atomic
    Lua script so concurrent turns can't both read an under-limit value and both
    pass (the old get-then-incrby race let users blow past the limit).
    Issue #16: the reservation also sets/refreshes the window TTL, so a worker
    crash mid-turn can't leave tokens reserved forever — they expire with the
    window. (A short-lived over-reservation is bounded by the window, and
    reconcile() trues it up on the normal path.)"""
    r = _redis()
    if r is None:
        return {"ok": True, "remaining": access.token_limit, "degraded": True}
    try:
        n = r.eval(
            _CHECK_AND_CHARGE_LUA, 2,
            _questions_key(access), _quota_key(access),
            questions_total(access), access.token_limit,
            estimated_tokens, _window_ttl(access),
        )
        # script returns: {ok(1/0), reason_code, remaining_tokens}
        ok = int(n[0]) == 1
        if ok:
            return {"ok": True, "remaining": int(n[2])}
        reason = "questions" if int(n[1]) == 1 else "tokens"
        return {"ok": False, "remaining": max(0, int(n[2])), "reason": reason}
    except Exception:
        return {"ok": True, "remaining": access.token_limit, "degraded": True}


# Atomic gate: check question count, check token budget, reserve tokens, refresh
# the window TTL — all in one round trip so concurrent turns serialize.
#   KEYS[1]=questions_key  KEYS[2]=tokens_key
#   ARGV[1]=q_total ARGV[2]=token_limit ARGV[3]=est_tokens ARGV[4]=ttl_seconds
# returns {ok, reason(1=questions,2=tokens,0=none), remaining_tokens}
_CHECK_AND_CHARGE_LUA = """
local q_used = tonumber(redis.call('GET', KEYS[1]) or '0')
local q_total = tonumber(ARGV[1])
if q_used >= q_total then
  local used = tonumber(redis.call('GET', KEYS[2]) or '0')
  return {0, 1, math.max(0, tonumber(ARGV[2]) - used)}
end
local used = tonumber(redis.call('GET', KEYS[2]) or '0')
local est = tonumber(ARGV[3])
local limit = tonumber(ARGV[2])
if used + est > limit then
  return {0, 2, math.max(0, limit - used)}
end
redis.call('INCRBY', KEYS[2], est)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
return {1, 0, limit - used - est}
"""


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
