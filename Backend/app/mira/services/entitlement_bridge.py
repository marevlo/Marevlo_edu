"""
MIRA ↔ Marevlo entitlement bridge.

MIRA does NOT decide payment truth. Marevlo's EntitlementService is the source
of truth for paid access; this module translates a Marevlo user's entitlement
state into the MIRA access contract (can they use MIRA, what plan, what quota,
what build-credit allotment, which courses).

The reviewer's required data contract:
    {
      "user_id", "plan", "mira_enabled", "course_ids",
      "entitlement_id", "period_start", "period_end",
      "token_limit", "build_credit_limit"
    }

This keeps MIRA decoupled: when PayU lands in Marevlo, the payment-success
webhook calls EntitlementService.grant(...) and MIRA automatically sees the new
plan on the next request — no MIRA payment code involved.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.entitlements.models.entitlement import Entitlement
from app.entitlements.services.entitlement_service import EntitlementService

_entitlements = EntitlementService()


# MIRA plan → quota. The MIRA plan is granted by a MIRA-specific entitlement
# (mira_pro / mira_plus), paid SEPARATELY from courses. No MIRA entitlement = free.
PLAN_QUOTA = {
    "free":  {"token_limit": 60_000,    "build_credit_limit": 0,   "window": "week"},
    "day":   {"token_limit": 160_000,   "build_credit_limit": 0,   "window": "day"},
    "plus":  {"token_limit": 2_000_000, "build_credit_limit": 50,  "window": "month"},
    "pro":   {"token_limit": 5_000_000, "build_credit_limit": 150, "window": "month"},
}

# Entitlement products that grant a MIRA plan (paid separately from courses).
MIRA_PLAN_PRODUCTS = {"mira_pro": "pro", "mira_plus": "plus", "mira_day": "day"}
# Course products — they unlock Marevlo courses and feed course context to MIRA,
# but do NOT grant a MIRA plan.
COURSE_PRODUCTS = {"all_access", "dsa", "courses"}


@dataclass
class MiraAccess:
    user_id: int
    plan: str
    mira_enabled: bool
    token_limit: int
    build_credit_limit: int
    window: str
    entitlement_id: Optional[int] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    course_ids: list[str] = field(default_factory=list)
    course_products: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "plan": self.plan,
            "mira_enabled": self.mira_enabled,
            "token_limit": self.token_limit,
            "build_credit_limit": self.build_credit_limit,
            "entitlement_id": self.entitlement_id,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "course_ids": self.course_ids,
            "course_products": self.course_products,
        }

    def entitlement_key(self) -> str:
        """Anchor for entitlement-period quota windows. Uses the entitlement id
        + period_end so each paid period is a distinct quota window; falls back
        to a calendar marker for free users."""
        if self.entitlement_id and self.period_end:
            return f"ent{self.entitlement_id}:{self.period_end}"
        if self.entitlement_id:
            return f"ent{self.entitlement_id}"
        # free users: monthly calendar window
        return f"free:{datetime.utcnow().strftime('%Y%m')}"


def resolve_access(db: Session, user_id: int) -> MiraAccess:
    """Translate Marevlo entitlement state into the MIRA access contract.

    MIRA is paid SEPARATELY from courses. The MIRA plan therefore comes from
    the user's MIRA entitlement (mira_pro / mira_plus), NOT from course
    products. Course products (all_access / dsa / courses) only control course
    access and feed course context — buying a course does not unlock the MIRA
    tutor, and buying MIRA does not unlock courses.

      - active mira_pro   -> plan 'pro'
      - active mira_plus  -> plan 'plus'
      - no MIRA product   -> plan 'free' (everyone gets the free tier)
    """
    # active entitlements for this user
    rows = db.execute(
        select(Entitlement).where(
            Entitlement.user_id == user_id,
            Entitlement.status == "active",
        )
    ).scalars().all()
    active = [r for r in rows if r.is_active()]

    # MIRA plan from MIRA products ONLY (pro outranks plus). Quota windows anchor
    # to the MIRA purchase period, so they reset with the MIRA subscription.
    plan = "free"
    ent_id = None
    period_start = None
    period_end = None
    mira_ent = None
    if any(r.product == "mira_pro" for r in active):
        mira_ent = next(r for r in active if r.product == "mira_pro")
        plan = "pro"
    elif any(r.product == "mira_plus" for r in active):
        mira_ent = next(r for r in active if r.product == "mira_plus")
        plan = "plus"
    elif any(r.product == "mira_day" for r in active):
        # Day-pass: 40 questions; the entitlement's 24h expiry (expires_at) ends it.
        mira_ent = next(r for r in active if r.product == "mira_day")
        plan = "day"
    if mira_ent is not None:
        ent_id = mira_ent.id
        period_start = mira_ent.created_at.isoformat() if mira_ent.created_at else None
        period_end = mira_ent.expires_at.isoformat() if mira_ent.expires_at else None

    quota = PLAN_QUOTA[plan]
    # MIRA is enabled for everyone (free tier included, with a small quota). If
    # you want MIRA paid-only, gate this on plan != "free".
    mira_enabled = True

    # Course products the user holds — for course-access enforcement and
    # context, NOT for the MIRA plan. (all_access is a course superset.)
    course_products = sorted({r.product for r in active if r.product in COURSE_PRODUCTS})
    course_ids = _enrolled_course_ids(db, user_id)

    return MiraAccess(
        user_id=user_id, plan=plan, mira_enabled=mira_enabled,
        token_limit=quota["token_limit"], build_credit_limit=quota["build_credit_limit"],
        window=quota["window"], entitlement_id=ent_id,
        period_start=period_start, period_end=period_end,
        course_ids=course_ids, course_products=course_products,
    )


def _enrolled_course_ids(db: Session, user_id: int) -> list[str]:
    """Courses the user is actively enrolled in (best-effort; empty if the
    learning module isn't present)."""
    try:
        from app.learning.models.learning import CourseEnrollment
        rows = db.execute(
            select(CourseEnrollment.course_id).where(
                CourseEnrollment.user_id == user_id,
                CourseEnrollment.status == "active",
            )
        ).scalars().all()
        return list(rows)
    except Exception:
        return []
