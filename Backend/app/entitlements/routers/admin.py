"""Admin entitlement management — grant/revoke paid access.

These two endpoints ARE the manual billing console until PayU is wired.
When PayU lands, its payment-success / refund webhooks call
entitlement_service.grant / .revoke directly (granted_by=None), and these
admin routes remain for comps and support overrides.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_db, require_admin
from app.entitlements.schemas.entitlement import (
    EntitlementOut,
    GrantRequest,
    RevokeRequest,
)
from app.entitlements.services.entitlement_service import entitlement_service

router = APIRouter(prefix="/admin/entitlements", tags=["admin", "entitlements"])


@router.post("/grant", response_model=EntitlementOut)
def grant(
    body: GrantRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ent = entitlement_service.grant(
        db,
        user_id=body.user_id,
        product=body.product,
        source=body.source,
        granted_by=admin.id,
        expires_at=body.expires_at,
        reason=body.reason,
    )
    return EntitlementOut.model_validate(ent)


@router.post("/revoke", response_model=EntitlementOut)
def revoke(
    body: RevokeRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ent = entitlement_service.revoke(
        db, user_id=body.user_id, product=body.product, reason=body.reason
    )
    return EntitlementOut.model_validate(ent)
