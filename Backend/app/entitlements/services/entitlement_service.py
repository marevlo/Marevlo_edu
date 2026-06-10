"""
Entitlement service — business logic for paid-access grants.

`grant()` is the one function billing will call. Today: an admin endpoint.
Tomorrow: a PayU payment-success webhook. The rest of the app only ever
asks `has_active(...)`, so the payment processor stays fully decoupled.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, ValidationError
from app.entitlements.models.entitlement import (
    PRODUCTS,
    SOURCES,
    Entitlement,
)


class EntitlementService:
    # ── reads ───────────────────────────────────────────────────────────
    def has_active(self, db: Session, *, user_id: int, product: str) -> bool:
        """Does the user hold an active, unexpired entitlement for `product`?

        'all_access' is a COURSE superset: holding it satisfies any *course*
        product check. It does NOT satisfy MIRA products — MIRA is paid
        separately, so a course purchase must not unlock the MIRA tutor.
        """
        products = {product}
        if not product.startswith("mira_"):
            products.add("all_access")
        rows = db.execute(
            select(Entitlement).where(
                Entitlement.user_id == user_id,
                Entitlement.status == "active",
                Entitlement.product.in_(products),
            )
        ).scalars().all()
        return any(r.is_active() for r in rows)

    def list_for_user(self, db: Session, *, user_id: int) -> list[Entitlement]:
        return db.execute(
            select(Entitlement)
            .where(Entitlement.user_id == user_id)
            .order_by(Entitlement.created_at.desc())
        ).scalars().all()

    # ── writes ──────────────────────────────────────────────────────────
    def grant(
        self,
        db: Session,
        *,
        user_id: int,
        product: str = "all_access",
        source: str = "comped",
        granted_by: Optional[int] = None,
        expires_at: Optional[datetime] = None,
        reason: Optional[str] = None,
    ) -> Entitlement:
        """Upsert an active entitlement. Idempotent per (user_id, product).

        This is the seam a PayU webhook calls on payment success:
            entitlement_service.grant(
                db, user_id=uid, product="all_access",
                source="paid", reason=f"PayU txn {txn_id}",
                expires_at=period_end,
            )
        """
        if product not in PRODUCTS:
            raise ValidationError(f"Unknown product '{product}'")
        if source not in SOURCES:
            raise ValidationError(f"Unknown source '{source}'")
        if expires_at is not None and expires_at <= datetime.now(timezone.utc):
            raise ValidationError("expires_at must be in the future")

        existing = db.execute(
            select(Entitlement).where(
                Entitlement.user_id == user_id,
                Entitlement.product == product,
            )
        ).scalar_one_or_none()

        if existing is None:
            ent = Entitlement(
                user_id=user_id,
                product=product,
                status="active",
                source=source,
                granted_by=granted_by,
                expires_at=expires_at,
                reason=reason,
            )
            db.add(ent)
        else:
            existing.status = "active"
            existing.source = source
            existing.granted_by = granted_by
            existing.expires_at = expires_at
            existing.reason = reason
            ent = existing

        db.commit()
        db.refresh(ent)
        return ent

    def revoke(
        self,
        db: Session,
        *,
        user_id: int,
        product: str = "all_access",
        reason: Optional[str] = None,
    ) -> Entitlement:
        """Flip an entitlement to revoked. Used for refunds/chargebacks."""
        ent = db.execute(
            select(Entitlement).where(
                Entitlement.user_id == user_id,
                Entitlement.product == product,
            )
        ).scalar_one_or_none()
        if ent is None:
            raise NotFound("No entitlement to revoke")
        ent.status = "revoked"
        if reason:
            ent.reason = reason
        db.commit()
        db.refresh(ent)
        return ent


entitlement_service = EntitlementService()
