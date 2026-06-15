"""
Billing catalog — the single source of truth the pricing page renders from and
the backend fulfils against, so page and code can't drift on price/contents.

fulfil() is the ONE seam money flows through. Callers: the PayU webhook
(payment success), and the admin override route (comps/support). It dispatches
by SKU kind:

    entitlement     -> EntitlementService.grant (upsert per user/product;
                       replay-safe by construction — re-granting the same
                       product is the same row)
    build_credits   -> quota_service.add_credit_topup (ledger row, unique
                       (ref, reason) — replay returns the original grant)
    question_topup  -> quota_service.add_question_topup (window-scoped row,
                       unique ref)

Every path is idempotent on the payment ref (PayU retries webhooks).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session


class BillingError(Exception):
    """Fulfilment-level error (unknown SKU, grant failure). Webhook logs it;
    admin route surfaces it as a 400."""


@dataclass(frozen=True)
class Sku:
    code: str
    label: str
    inr: int                      # display price in rupees (page parity tests)
    kind: str                     # entitlement | build_credits | question_topup
    product: str | None = None    # entitlement product code (kind=entitlement)
    duration_days: int | None = None  # None = perpetual (courses)
    amount: int = 0               # credits or questions (topup kinds)
    blurb: str = ""


CATALOG: dict[str, Sku] = {s.code: s for s in [
    # ── courses (perpetual; do NOT grant a MIRA plan) ─────────────────────
    Sku("course_dsa", "DSA Problems Access", 1999, "entitlement",
        product="dsa", duration_days=None,
        blurb="730 problems, 6-level ladder."),
    Sku("course_ds_dsa", "DS + DSA All Access", 2999, "entitlement",
        product="all_access", duration_days=None,
        blurb="Problems + Data Science courses."),

    # ── MIRA plans ────────────────────────────────────────────────────────
    Sku("mira_day", "MIRA Day Pass", 99, "entitlement",
        product="mira_day", duration_days=1,
        blurb="40 questions for 24 hours."),
    Sku("mira_plus", "MIRA Plus (monthly)", 799, "entitlement",
        product="mira_plus", duration_days=30,
        blurb="500 questions / month, 50 build credits."),
    Sku("mira_pro", "MIRA Pro (monthly)", 1499, "entitlement",
        product="mira_pro", duration_days=30,
        blurb="1,250 questions / month, 150 build credits."),
    Sku("mira_plus_year", "MIRA Plus (annual)", 7990, "entitlement",
        product="mira_plus_year", duration_days=365,
        blurb="Plus for a year — ~2 months free."),
    Sku("mira_pro_year", "MIRA Pro (annual)", 14990, "entitlement",
        product="mira_pro_year", duration_days=365,
        blurb="Pro for a year — ~2 months free."),

    # ── top-ups ───────────────────────────────────────────────────────────
    Sku("build_pack_700", "Build Pack — 700 credits", 4999, "build_credits",
        amount=700, blurb="700 build credits, never expire."),
    Sku("topup_credits_100", "+100 build credits", 699, "build_credits",
        amount=100, blurb="100 build credits, never expire."),
    Sku("topup_questions_250", "+250 questions", 399, "question_topup",
        amount=250, blurb="250 extra questions this period."),
]}


def fulfil(db: Session, *, sku_code: str, user_id: int, ref: str,
           source: str = "paid", granted_by: int | None = None) -> dict:
    """Grant what a payment bought. Idempotent per `ref` on every kind, so a
    retried PayU webhook (or a double admin click) can't double-grant."""
    sku = CATALOG.get(sku_code)
    if sku is None:
        raise BillingError(f"Unknown SKU '{sku_code}'")

    if sku.kind == "entitlement":
        from app.entitlements.services.entitlement_service import EntitlementService
        expires = (datetime.now(timezone.utc) + timedelta(days=sku.duration_days)
                   if sku.duration_days else None)
        try:
            ent = EntitlementService().grant(
                db, user_id=user_id, product=sku.product, source=source,
                granted_by=granted_by, expires_at=expires,
                reason=f"billing:{sku.code}:{ref}")
        except Exception as e:  # ValidationError etc. — surface as billing error
            raise BillingError(f"grant failed for {sku.code}: {e}") from e
        return {"sku": sku.code, "kind": sku.kind, "product": sku.product,
                "entitlement_id": ent.id,
                "expires_at": ent.expires_at.isoformat() if ent.expires_at else None,
                "ref": ref}

    from app.mira.services import quota_service as quota
    if sku.kind == "build_credits":
        r = quota.add_credit_topup(db, user_id, sku.amount, ref=ref)
        return {"sku": sku.code, "kind": sku.kind, "credits": sku.amount,
                "idempotent": bool(r.get("idempotent")),
                "balance_after": r.get("balance_after"), "ref": ref}
    if sku.kind == "question_topup":
        r = quota.add_question_topup(db, user_id, sku.amount, ref=ref)
        return {"sku": sku.code, "kind": sku.kind, "questions": sku.amount,
                "idempotent": bool(r.get("idempotent")), "ref": ref}

    raise BillingError(f"SKU '{sku.code}' has unhandled kind '{sku.kind}'")
