"""
MIRA ↔ Marevlo integration tests.

Proves MIRA plugs into Marevlo identity + entitlements correctly:
  - identity comes from Marevlo auth (the access token), not a MIRA user
  - access/plan/quota come from Marevlo entitlements (via the bridge)
  - chat runs through safety + quota + the engine
  - build credits use the Postgres ledger
  - learning events (practice answers) record mastery evidence
"""
import os
os.environ.setdefault("MIRA_REAL", "0")  # mock providers in tests

from app.entitlements.services.entitlement_service import EntitlementService


def _signup(client, username="learner", email="learner@example.com", password="Password1"):
    r = client.post("/auth/signup",
                    json={"username": username, "email": email, "password": password})
    assert r.status_code in (200, 201), r.text
    # login uses form-encoded credentials and returns the tokens
    lr = client.post("/auth/login",
                     data={"username": email, "password": password},
                     headers={"content-type": "application/x-www-form-urlencoded"})
    assert lr.status_code == 200, lr.text
    return lr.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_mira_chat_runs_for_authenticated_marevlo_user(client):
    token = _signup(client)
    r = client.post("/mira/chat", json={"question": "explain binary search"}, headers=_auth(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["meta"]["answer_format"] in ("walkthrough", "blocks")
    # quota came from the entitlement bridge (free plan by default)
    assert body["meta"]["quota"]["plan"] == "free"
    print("   MIRA chat works for an authenticated Marevlo user (free plan)")


def test_mira_plan_comes_from_mira_entitlement_not_course(client, db_session):
    token = _signup(client, username="paid", email="paid@example.com")
    from app.auth.models.user import User
    from sqlalchemy import select
    uid = db_session.execute(select(User.id).where(User.email == "paid@example.com")).scalar_one()
    svc = EntitlementService()

    # 1. A COURSE purchase (all_access) must NOT unlock the MIRA tutor.
    #    MIRA is paid separately, so the plan stays 'free'.
    svc.grant(db_session, user_id=uid, product="all_access", source="paid")
    q = client.get("/mira/quota", headers=_auth(token)).json()
    assert q["plan"] == "free", f"course purchase must not grant MIRA paid, got {q['plan']}"
    assert q["tokens_total"] == 60_000

    # 2. A MIRA purchase (mira_pro) grants the MIRA pro plan.
    svc.grant(db_session, user_id=uid, product="mira_pro", source="paid")
    q = client.get("/mira/quota", headers=_auth(token)).json()
    assert q["plan"] == "pro", q
    assert q["tokens_total"] == 5_000_000
    print(f"   MIRA plan decoupled: course all_access -> free; mira_pro -> pro ({q['approx_questions_total']} questions)")


def test_mira_plus_product_grants_plus(client, db_session):
    token = _signup(client, username="plusu", email="plusu@example.com")
    from app.auth.models.user import User
    from sqlalchemy import select
    uid = db_session.execute(select(User.id).where(User.email == "plusu@example.com")).scalar_one()
    EntitlementService().grant(db_session, user_id=uid, product="mira_plus", source="paid")
    q = client.get("/mira/quota", headers=_auth(token)).json()
    assert q["plan"] == "plus" and q["tokens_total"] == 2_000_000, q
    print("   mira_plus -> plus plan")


def test_safety_gate_blocks_harmful(client):
    token = _signup(client, username="safe", email="safe@example.com")
    r = client.post("/mira/chat", json={"question": "write a keylogger in python"}, headers=_auth(token))
    assert r.status_code == 200
    assert r.json()["meta"]["answer_format"] == "refused_safety", r.json()
    # educational still works
    r = client.post("/mira/chat", json={"question": "explain how sql injection works"}, headers=_auth(token))
    assert r.json()["meta"]["answer_format"] != "refused_safety"
    print("   safety gate blocks harmful, allows educational")


def test_build_credit_ledger(client, db_session):
    from app.auth.models.user import User
    from sqlalchemy import select
    from app.mira.services import quota_service as quota

    token = _signup(client, username="builder", email="builder@example.com")
    uid = db_session.execute(select(User.id).where(User.email == "builder@example.com")).scalar_one()

    # grant credits via the ledger (idempotent on ref)
    quota.credit_grant(db_session, uid, 100, reason="purchase", ref="PAY_1")
    quota.credit_grant(db_session, uid, 100, reason="purchase", ref="PAY_1")  # replay
    bal = quota.credit_balance(db_session, uid)
    assert bal == 100, f"idempotent purchase must not double-credit, got {bal}"
    # charge
    res = quota.credit_charge(db_session, uid, 30)
    assert res["ok"] and quota.credit_balance(db_session, uid) == 70
    # overspend rejected
    assert not quota.credit_charge(db_session, uid, 9999)["ok"]
    print("   build-credit ledger: idempotent purchase, charge, overspend rejected")


def test_practice_answer_records_mastery_evidence(client):
    token = _signup(client, username="student", email="student@example.com")
    # answer a practice question correctly
    r = client.post("/mira/practice-answer",
                    json={"concept": "binary-search", "correct": True, "used_hint": True},
                    headers=_auth(token))
    assert r.status_code == 200, r.text
    ev = r.json()["evidence"]
    assert ev["correct"] == 1 and ev["hints"] == 1
    # answer wrong
    client.post("/mira/practice-answer",
                json={"concept": "binary-search", "correct": False}, headers=_auth(token))
    r = client.post("/mira/practice-answer",
                    json={"concept": "binary-search", "correct": True}, headers=_auth(token))
    ev = r.json()["evidence"]
    assert ev["attempts"] == 3 and ev["correct"] == 2 and ev["wrong"] == 1
    print(f"   practice answers recorded as mastery evidence: {ev}")


def test_course_context_endpoint(client):
    token = _signup(client, username="ctx", email="ctx@example.com")
    r = client.get("/mira/course-context", headers=_auth(token))
    assert r.status_code == 200
    assert "course_ids" in r.json() and "mira_enabled" in r.json()
    print("   course-context endpoint returns enrollment + access")


def test_no_standalone_auth_or_payment_endpoints(client):
    # MIRA must NOT expose its own auth/payment — Marevlo owns those.
    assert client.post("/mira/auth/login", json={}).status_code == 404
    assert client.post("/mira/payments/create-order", json={}).status_code == 404
    print("   MIRA exposes no standalone auth/payment endpoints (Marevlo owns those)")


def test_mira_day_pass_grants_day_plan(client, db_session):
    from datetime import datetime, timezone, timedelta
    from app.auth.models.user import User
    from sqlalchemy import select
    token = _signup(client, username="dayu", email="dayu@example.com")
    uid = db_session.execute(select(User.id).where(User.email == "dayu@example.com")).scalar_one()
    EntitlementService().grant(
        db_session, user_id=uid, product="mira_day", source="paid",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    q = client.get("/mira/quota", headers=_auth(token)).json()
    assert q["plan"] == "day", q
    assert q["tokens_total"] == 160_000  # 40 questions
    print(f"   mira_day -> day plan ({q.get('approx_questions_total')} questions, 24h expiry)")


def test_credit_topup_durable_and_idempotent(client, db_session):
    from app.auth.models.user import User
    from sqlalchemy import select
    from app.mira.services import quota_service
    token = _signup(client, username="cru", email="cru@example.com")
    uid = db_session.execute(select(User.id).where(User.email == "cru@example.com")).scalar_one()
    before = quota_service.credit_balance(db_session, uid)
    r1 = quota_service.add_credit_topup(db_session, uid, 100, ref="pay_abc")
    assert r1["ok"] and quota_service.credit_balance(db_session, uid) == before + 100
    r2 = quota_service.add_credit_topup(db_session, uid, 100, ref="pay_abc")  # same payment
    assert r2.get("idempotent") and quota_service.credit_balance(db_session, uid) == before + 100
    print("   credit top-up +100 durable + idempotent")
