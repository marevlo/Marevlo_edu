"""
Entitlement model — the single source of truth for paid access.

Design:
  - One row per (user_id, product). `product` is a small vocabulary; today
    only "all_access" exists (unlocks DSA problems + submissions + courses).
    Splitting into "dsa" / "courses" later is additive — the gate already
    treats "all_access" as a superset.

  - `grant()` in the service upserts this row to status='active'. That single
    function is the integration seam for billing: today an admin calls it;
    when PayU lands, the payment-success webhook calls the same function.
    Nothing else in the codebase needs to know how access was paid for.

  - `source` records HOW access was granted (paid|comped|trial|free) for
    audit and revenue reconciliation. `granted_by` records WHO (admin user id,
    or NULL when a webhook grants it).

  - `expires_at` NULL = perpetual. A non-NULL value in the past means the
    entitlement is expired even if status is still 'active' — `is_active()`
    checks both, so a lazy expiry needs no cron. A nightly sweep can flip
    status to 'expired' for cleanliness but is not required for correctness.

  Cross-dialect: only portable column types + CheckConstraints so the same
  DDL runs on Postgres (prod) and SQLite (tests).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Products a user can be entitled to. Course products unlock Marevlo courses;
# MIRA products unlock the MIRA tutor (paid SEPARATELY from courses). "all_access"
# is a COURSE superset (all courses) — it does NOT include MIRA.
PRODUCTS = ("all_access", "dsa", "courses", "mira_plus", "mira_pro", "mira_day")
SOURCES = ("paid", "comped", "trial", "free")
STATUSES = ("active", "revoked", "expired")


class Entitlement(Base):
    __tablename__ = "entitlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    product: Mapped[str] = mapped_column(String(32), nullable=False)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default="active"
    )
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default="comped", server_default="comped"
    )

    # NULL when granted by an automated webhook; an admin user id otherwise.
    granted_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Free-text audit note: "PayU txn 9f3a...", "launch comp", "refund -> revoked".
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # NULL = perpetual access.
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "product", name="uq_entitlement_user_product"),
        Index("idx_entitlements_user_status", "user_id", "status"),
        Index("idx_entitlements_expires", "expires_at"),
        CheckConstraint(
            "product IN ('all_access','dsa','courses','mira_plus','mira_pro','mira_day')",
            name="ck_entitlements_product",
        ),
        CheckConstraint(
            "source IN ('paid','comped','trial','free')",
            name="ck_entitlements_source",
        ),
        CheckConstraint(
            "status IN ('active','revoked','expired')",
            name="ck_entitlements_status",
        ),
    )

    def is_active(self, *, now: Optional[datetime] = None) -> bool:
        """True iff this entitlement grants access right now (status + expiry)."""
        if self.status != "active":
            return False
        if self.expires_at is None:
            return True
        now = now or datetime.now(timezone.utc)
        # expires_at is tz-aware (DateTime(timezone=True)); guard naive rows.
        exp = self.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp > now
