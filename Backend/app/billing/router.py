"""
Billing endpoints.

- GET  /billing/catalog            public price list (drives the pricing page)
- POST /billing/admin/fulfil       admin-only manual fulfilment (comps/support)

The PayU payment-success webhook (when wired) imports app.billing.catalog.fulfil
directly with source="paid" and the txn id as ref — it does NOT go through an
HTTP route. This router exposes the catalog for the page and an admin override.
"""
from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.config import get_settings
from app.core.dependencies import get_db, require_admin
from app.billing.catalog import CATALOG, BillingError, fulfil

router = APIRouter(prefix="/billing", tags=["billing"])
log = logging.getLogger("billing")


@router.get("/catalog")
def get_catalog():
    """Public SKU list so the pricing page renders from the SAME source the
    backend fulfils against — page and code can't drift on price/contents."""
    return {
        "currency": "INR",
        "gst_percent": 18,
        "skus": [
            {"code": s.code, "label": s.label, "inr": s.inr, "kind": s.kind,
             "product": s.product, "duration_days": s.duration_days,
             "amount": s.amount}
            for s in CATALOG.values()
        ],
    }


class FulfilRequest(BaseModel):
    user_id: int
    sku_code: str = Field(min_length=1)
    ref: str | None = None
    source: str = "comped"


@router.post("/admin/fulfil")
def admin_fulfil(body: FulfilRequest, admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)):
    try:
        return fulfil(db, sku_code=body.sku_code, user_id=body.user_id,
                      ref=body.ref or f"admin:{admin.id}", source=body.source)
    except BillingError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _payu_response_hash(salt: str, params: dict) -> str:
    """PayU success-response hash (reverse of the request hash):
    sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|key)
    We compute it server-side and compare to the posted `hash` so a forged
    callback can't grant access. Constant-time compare."""
    key = params.get("key", "")
    amount = params.get("amount", "")
    productinfo = params.get("productinfo", "")
    firstname = params.get("firstname", "")
    email = params.get("email", "")
    udf = [params.get(f"udf{i}", "") for i in range(1, 6)]
    status = params.get("status", "")
    seq = [salt, status, "", "", "", "", "", udf[4], udf[3], udf[2], udf[1],
           udf[0], email, firstname, productinfo, amount, key]
    return hashlib.sha512("|".join(seq).encode()).hexdigest()


@router.post("/payu/webhook")
async def payu_webhook(request: Request, db: Session = Depends(get_db)):
    """PayU payment-success callback. Verifies the response hash against our
    merchant salt, then fulfils the SKU idempotently (PayU may retry; the txn
    id as `ref` makes the grant replay-safe). The SKU code is carried in
    `udf1`; `udf2` carries the Marevlo user id.

    Security: refuses to fulfil if the salt is unset (can't verify) or the hash
    doesn't match. Only status='success' fulfils. Never trusts the body alone.
    """
    settings = get_settings()
    salt = settings.PAYU_MERCHANT_SALT
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}

    if not salt:
        log.error("PayU webhook hit but PAYU_MERCHANT_SALT is unset — refusing")
        raise HTTPException(status_code=503, detail="billing not configured")

    posted = params.get("hash", "")
    expected = _payu_response_hash(salt, params)
    # constant-time comparison
    if not posted or not hashlib.sha512(posted.encode()).hexdigest() == \
            hashlib.sha512(expected.encode()).hexdigest():
        log.warning("PayU webhook hash mismatch — possible forgery, ignoring")
        raise HTTPException(status_code=400, detail="hash verification failed")

    if params.get("status") != "success":
        return {"ok": True, "fulfilled": False, "reason": params.get("status")}

    sku_code = params.get("udf1", "")
    try:
        user_id = int(params.get("udf2", "0"))
    except ValueError:
        user_id = 0
    txn = params.get("txnid") or params.get("mihpayid") or ""
    if not sku_code or not user_id or not txn:
        log.error("PayU webhook missing sku/user/txn: %s", {k: params.get(k)
                  for k in ("udf1", "udf2", "txnid")})
        raise HTTPException(status_code=400, detail="missing sku/user/txn")

    try:
        receipt = fulfil(db, sku_code=sku_code, user_id=user_id,
                         ref=f"payu:{txn}", source="paid")
    except BillingError as e:
        log.error("PayU webhook fulfil failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
    log.info("PayU fulfilled sku=%s user=%s txn=%s", sku_code, user_id, txn)
    return {"ok": True, "fulfilled": True, "receipt": receipt}
