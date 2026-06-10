"""Audit-log emission tests.

Verify that the SecurityEvent table is populated for the security-sensitive
actions: login (success + failure), logout, password reset request + completion,
admin actions, and blocks.
"""
from sqlalchemy import select

from app.common.security_event import (
    EVT_ADMIN_ACTION,
    EVT_BLOCK_USER,
    EVT_LOGIN_FAILURE,
    EVT_LOGIN_SUCCESS,
    EVT_LOGOUT,
    EVT_PW_RESET_COMPLETED,
    EVT_PW_RESET_REQUESTED,
    SecurityEvent,
)
# Import the module so we always pick up the test-monkeypatched SessionLocal.
from app.core import database as _db


def _SL():
    return _db.SessionLocal()


def _signup(client, *, username="alice", email="alice@example.com", password="Password1"):
    return client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": password},
    )


def _login(client, *, email="alice@example.com", password="Password1"):
    return client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )


def _events_of(event_type: str) -> list:
    with _SL() as db:
        return list(
            db.execute(select(SecurityEvent).where(SecurityEvent.event_type == event_type))
            .scalars()
            .all()
        )


def test_login_success_writes_event(client):
    _signup(client)
    r = _login(client)
    assert r.status_code == 200

    events = _events_of(EVT_LOGIN_SUCCESS)
    assert len(events) == 1
    assert events[0].user_id is not None
    assert events[0].meta is not None
    assert events[0].meta.get("method") == "password"


def test_login_failure_writes_event_with_no_user(client):
    """Wrong-password attempt for unknown email — user_id must be NULL."""
    r = _login(client, email="ghost@example.com", password="anything")
    assert r.status_code == 401

    events = _events_of(EVT_LOGIN_FAILURE)
    assert len(events) == 1
    assert events[0].user_id is None
    assert events[0].meta.get("email") == "ghost@example.com"


def test_login_failure_for_wrong_password_records_user_id(client):
    r = _signup(client)
    user_id = r.json()["id"]

    bad = _login(client, password="WrongPass1")
    assert bad.status_code == 401

    events = _events_of(EVT_LOGIN_FAILURE)
    assert len(events) == 1
    assert events[0].user_id == user_id


def test_logout_writes_event(client):
    _signup(client)
    tok = _login(client).json()["access_token"]
    r = client.post("/auth/logout", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200

    events = _events_of(EVT_LOGOUT)
    assert len(events) == 1
    assert events[0].user_id is not None


def test_password_reset_request_audited_for_unknown_email(client):
    """The endpoint returns 200 silently to avoid leaking, but the audit
    table records the attempt for security review."""
    r = client.post("/auth/password/forgot", json={"email": "ghost@example.com"})
    assert r.status_code == 200

    events = _events_of(EVT_PW_RESET_REQUESTED)
    assert len(events) == 1
    assert events[0].user_id is None
    assert events[0].meta.get("user_found") is False


def test_password_reset_full_flow_writes_two_events(client):
    from datetime import datetime, timedelta, timezone
    from app.auth.models.user import EmailOTP, User
    from app.core.security import hash_otp

    _signup(client)
    client.post("/auth/password/forgot", json={"email": "alice@example.com"})

    with _SL() as db:
        user = db.query(User).first()
        db.query(EmailOTP).filter_by(user_id=user.id).delete()
        otp = "112233"
        db.add(EmailOTP(
            user_id=user.id,
            code_hash=hash_otp(otp),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        ))
        db.commit()

    r = client.post(
        "/auth/password/reset",
        json={"email": "alice@example.com", "otp": otp, "new_password": "NewPassword2"},
    )
    assert r.status_code == 200

    assert len(_events_of(EVT_PW_RESET_REQUESTED)) == 1
    completions = _events_of(EVT_PW_RESET_COMPLETED)
    assert len(completions) == 1


def test_block_user_writes_audit_event(client):
    """Block emits EVT_BLOCK_USER with target id in meta."""
    from app.auth.models.user import User

    _signup(client, username="alice", email="alice@example.com")
    _signup(client, username="bob", email="bob@example.com")
    tok_a = _login(client, email="alice@example.com").json()["access_token"]

    with _SL() as db:
        bob_id = db.query(User).filter_by(username="bob").first().id

    r = client.post(
        f"/users/{bob_id}/block", headers={"Authorization": f"Bearer {tok_a}"}
    )
    assert r.status_code == 200

    events = _events_of(EVT_BLOCK_USER)
    assert len(events) == 1
    assert events[0].meta.get("target_user_id") == bob_id


def test_admin_delete_writes_audit_event(client):
    """Admin soft-delete of a post writes EVT_ADMIN_ACTION."""
    from app.auth.models.user import User

    # Create a regular user, a target post, then promote a separate user to admin.
    _signup(client, username="alice", email="alice@example.com")
    _signup(client, username="adminuser", email="admin@example.com")
    tok_a = _login(client, email="alice@example.com").json()["access_token"]
    r = client.post(
        "/feed/posts",
        json={"content": "to be moderated", "type": "post"},
        headers={"Authorization": f"Bearer {tok_a}"},
    )
    post_id = r.json()["id"]

    with _SL() as db:
        admin = db.query(User).filter_by(username="adminuser").first()
        admin.is_admin = True
        db.commit()

    tok_admin = _login(client, email="admin@example.com").json()["access_token"]
    r = client.delete(
        f"/admin/posts/{post_id}", headers={"Authorization": f"Bearer {tok_admin}"}
    )
    assert r.status_code == 200

    events = _events_of(EVT_ADMIN_ACTION)
    assert len(events) == 1
    assert events[0].meta.get("action") == "delete_post"
    assert events[0].meta.get("post_id") == post_id
