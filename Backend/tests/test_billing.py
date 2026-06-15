"""
Billing tests — pricing page ↔ catalog parity, idempotent fulfilment, and PayU
webhook verification (Tier 0 reconciliation).
"""
from __future__ import annotations

import hashlib

import pytest


def _mk_user(db_session, email, username):
    from app.auth.models.user import User
    u = User(username=username, email=email, password_hash="x", is_active=True)
    db_session.add(u)
    db_session.commit()
    return u


# ── catalog ↔ pricing-page parity (the numbers that must match the page) ──
def test_catalog_prices_match_pricing_page():
    from app.billing.catalog import CATALOG
    expected = {
        "course_dsa": 1999, "course_ds_dsa": 2999,
        "mira_day": 99, "mira_plus": 799, "mira_pro": 1499,
        "mira_plus_year": 7990, "mira_pro_year": 14990,
        "build_pack_700": 4999, "topup_credits_100": 699,
        "topup_questions_250": 399,
    }
    for code, inr in expected.items():
        assert code in CATALOG, f"missing SKU {code}"
        assert CATALOG[code].inr == inr, f"{code}: {CATALOG[code].inr} != {inr}"


def test_catalog_amounts_match_page():
    from app.billing.catalog import CATALOG
    assert CATALOG["build_pack_700"].amount == 700
    assert CATALOG["topup_credits_100"].amount == 100
    assert CATALOG["topup_questions_250"].amount == 250
    assert CATALOG["mira_day"].duration_days == 1
    assert CATALOG["mira_plus"].duration_days == 30
    assert CATALOG["mira_plus_year"].duration_days == 365


def test_every_sku_resolves_to_a_handled_kind():
    from app.billing.catalog import CATALOG
    assert all(s.kind in ("entitlement", "build_credits", "question_topup")
               for s in CATALOG.values())


# ── fulfilment: money → access, idempotent ──
def test_fulfil_day_pass_grants_day_plan(db_session):
    from app.billing.catalog import fulfil
    from app.mira.services.entitlement_bridge import resolve_access
    u = _mk_user(db_session, "day@x.io", "dayu")
    fulfil(db_session, sku_code="mira_day", user_id=u.id, ref="payu:txn_day_1")
    access = resolve_access(db_session, u.id)
    assert access.plan == "day"
    assert access.token_limit // 4000 == 40  # 40 questions


def test_fulfil_build_pack_is_idempotent(db_session):
    from app.billing.catalog import fulfil
    from app.mira.services import quota_service as q
    u = _mk_user(db_session, "bp@x.io", "bpu")
    fulfil(db_session, sku_code="build_pack_700", user_id=u.id, ref="payu:txn_bp")
    fulfil(db_session, sku_code="build_pack_700", user_id=u.id, ref="payu:txn_bp")  # retry
    assert q.credit_balance(db_session, u.id) == 700  # not 1400


def test_fulfil_plus_grants_plus_plan(db_session):
    from app.billing.catalog import fulfil
    from app.mira.services.entitlement_bridge import resolve_access
    u = _mk_user(db_session, "plus@x.io", "plusu")
    fulfil(db_session, sku_code="mira_plus", user_id=u.id, ref="payu:txn_plus")
    access = resolve_access(db_session, u.id)
    assert access.plan == "plus"
    assert access.build_credit_limit == 50


def test_fulfil_course_dsa_grants_course_not_mira(db_session):
    from app.billing.catalog import fulfil
    from app.mira.services.entitlement_bridge import resolve_access
    u = _mk_user(db_session, "dsa@x.io", "dsau")
    fulfil(db_session, sku_code="course_dsa", user_id=u.id, ref="payu:txn_dsa")
    access = resolve_access(db_session, u.id)
    # buying a course must NOT grant a MIRA plan (paid separately)
    assert access.plan == "free"
    assert "dsa" in access.course_products


def test_fulfil_unknown_sku_raises(db_session):
    from app.billing.catalog import fulfil, BillingError
    u = _mk_user(db_session, "unk@x.io", "unku")
    with pytest.raises(BillingError):
        fulfil(db_session, sku_code="nonexistent_sku", user_id=u.id, ref="r")


# ── catalog endpoint reachable (router registered) ──
def test_catalog_endpoint_is_registered(client):
    r = client.get("/billing/catalog")
    assert r.status_code == 200
    body = r.json()
    assert body["currency"] == "INR"
    codes = {s["code"] for s in body["skus"]}
    assert "mira_day" in codes and "build_pack_700" in codes


# ── PayU webhook security ──
def _payu_hash(salt, params):
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


def test_payu_webhook_rejects_forged_hash(client, monkeypatch):
    from app.core.config import get_settings
    get_settings().PAYU_MERCHANT_SALT = "test_salt"
    try:
        r = client.post("/billing/payu/webhook", data={
            "status": "success", "udf1": "mira_day", "udf2": "1",
            "txnid": "t1", "hash": "deadbeef", "key": "k", "amount": "99",
            "productinfo": "MIRA Day-pass", "firstname": "x", "email": "x@x.io",
        })
        assert r.status_code == 400  # hash mismatch
    finally:
        get_settings().PAYU_MERCHANT_SALT = ""


def test_payu_webhook_refuses_when_salt_unset(client):
    from app.core.config import get_settings
    get_settings().PAYU_MERCHANT_SALT = ""
    r = client.post("/billing/payu/webhook", data={"status": "success"})
    assert r.status_code == 503  # not configured → won't grant


def test_payu_webhook_fulfils_on_valid_hash(client, db_session):
    from app.core.config import get_settings
    u = _mk_user(db_session, "payu@x.io", "payuu")
    get_settings().PAYU_MERCHANT_SALT = "test_salt"
    try:
        params = {
            "status": "success", "key": "mkey", "amount": "99",
            "productinfo": "MIRA Day-pass", "firstname": "P", "email": "p@x.io",
            "udf1": "mira_day", "udf2": str(u.id), "txnid": "txn_valid_1",
        }
        params["hash"] = _payu_hash("test_salt", params)
        r = client.post("/billing/payu/webhook", data=params)
        assert r.status_code == 200, r.text
        assert r.json()["fulfilled"] is True
    finally:
        get_settings().PAYU_MERCHANT_SALT = ""


def test_payu_webhook_ignores_non_success(client):
    from app.core.config import get_settings
    get_settings().PAYU_MERCHANT_SALT = "test_salt"
    try:
        params = {"status": "failure", "key": "k", "amount": "99",
                  "productinfo": "x", "firstname": "x", "email": "x@x.io",
                  "udf1": "mira_day", "udf2": "1", "txnid": "t2"}
        params["hash"] = _payu_hash("test_salt", params)
        r = client.post("/billing/payu/webhook", data=params)
        assert r.status_code == 200
        assert r.json()["fulfilled"] is False
    finally:
        get_settings().PAYU_MERCHANT_SALT = ""
