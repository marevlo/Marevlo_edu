"""User-facing entitlement endpoint: what have *I* unlocked?"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.entitlements.schemas.entitlement import EntitlementOut, MyAccessOut
from app.entitlements.services.entitlement_service import entitlement_service

router = APIRouter(prefix="/me", tags=["entitlements"])


@router.get("/access", response_model=MyAccessOut)
def my_access(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The frontend calls this on load to decide which UI to unlock.

    Staff/admins always read as fully unlocked.
    """
    is_staff = getattr(user, "is_admin", False) or getattr(user, "role", "student") in ("admin", "staff")
    if is_staff:
        return MyAccessOut(
            dsa=True, courses=True, all_access=True,
            entitlements=[EntitlementOut.model_validate(e) for e in entitlement_service.list_for_user(db, user_id=user.id)],
        )
    return MyAccessOut(
        dsa=entitlement_service.has_active(db, user_id=user.id, product="dsa"),
        courses=entitlement_service.has_active(db, user_id=user.id, product="courses"),
        all_access=entitlement_service.has_active(db, user_id=user.id, product="all_access"),
        entitlements=[
            EntitlementOut.model_validate(e)
            for e in entitlement_service.list_for_user(db, user_id=user.id)
        ],
    )
