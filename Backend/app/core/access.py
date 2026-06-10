"""
Access gating dependencies.

`require_entitlement(product)` returns a FastAPI dependency that 403s unless
the authenticated user holds an active entitlement for `product` (or is an
admin/staff, who always pass). Wire it onto any route that should be
paid-only:

    from app.core.access import require_entitlement

    @router.get("/problems")
    def list_problems(user: User = Depends(require_entitlement("dsa")), ...):
        ...

Free vs paid is decided here and ONLY here — routes don't hand-roll checks.
"""
from __future__ import annotations

from typing import Callable, Optional

from fastapi import Depends
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import Forbidden
from app.entitlements.services.entitlement_service import entitlement_service


def _user_is_staff(user: User) -> bool:
    # Admins/staff bypass paid gates. Supports both the legacy is_admin bool
    # and the new role column (see auth.models.user.User.role).
    if getattr(user, "is_admin", False):
        return True
    return getattr(user, "role", "student") in ("admin", "staff")


def require_entitlement(product: str = "all_access") -> Callable[..., User]:
    """Factory → a dependency that enforces a paid entitlement for `product`."""

    def _dep(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> User:
        if _user_is_staff(user):
            return user
        if entitlement_service.has_active(db, user_id=user.id, product=product):
            return user
        raise Forbidden(
            f"This content requires an active subscription ({product}). "
            "Upgrade to unlock."
        )

    return _dep


def resolve_course_product(course_id: str) -> Optional[str]:
    """Return the entitlement product a course requires, or None if it's free.

    There is no per-course product column — course_id is a free-form slug
    (e.g. "recsys" or "recsys.m01.l03") — so the mapping is config-driven:
      - FREE_COURSE_IDS: slugs needing no entitlement
      - COURSE_PRODUCT_OVERRIDES: "slug:product" exceptions (e.g. a DSA course -> dsa)
      - COURSE_PRODUCT_DEFAULT: product for everything else (default all_access)
    Matches either the full slug or its root segment ("recsys.m01.l03" -> "recsys").
    """
    s = get_settings()
    cid = (course_id or "").strip()
    root = cid.split(".")[0]
    free = {x.strip() for x in s.FREE_COURSE_IDS.split(",") if x.strip()}
    if cid in free or root in free:
        return None
    for pair in s.COURSE_PRODUCT_OVERRIDES.split(","):
        if ":" in pair:
            slug, prod = (p.strip() for p in pair.split(":", 1))
            if slug and (cid == slug or root == slug):
                return prod or None
    return s.COURSE_PRODUCT_DEFAULT or None


def enforce_course_access(db: Session, *, user_id: int, course_id: str) -> None:
    """Raise Forbidden unless the user may access `course_id`.

    No-op when ENFORCE_COURSE_ACCESS is off, when the course is free, or when the
    user is staff. Otherwise requires an active entitlement for the course's
    product (all_access is a superset, so the DS+DSA plan unlocks everything).
    """
    s = get_settings()
    if not s.ENFORCE_COURSE_ACCESS:
        return
    product = resolve_course_product(course_id)
    if product is None:
        return
    user = db.get(User, user_id)
    if user is not None and _user_is_staff(user):
        return
    if entitlement_service.has_active(db, user_id=user_id, product=product):
        return
    raise Forbidden(
        f"This course requires an active subscription ({product}). Upgrade to unlock."
    )
