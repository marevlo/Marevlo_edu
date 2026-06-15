"""Email-verification flow: request, confirm, purpose isolation, login gate."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.auth.models.user import EmailOTP, User
from app.core import database as _db
from app.core.security import hash_otp


def signup(client, *, username="alice", email="alice@example.com", password="Password1"):
    return client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": password},
    )


def login(client, *, email="alice@example.com", password="Password1"):
    return client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"content-type": "application/x-www-form-urlencoded"},
    )


def _insert_otp(
    *,
    email="alice@example.com",
    otp="654321",
    purpose="email_verify",
    expired=False,
):
    """Replace all of the user's OTPs with one known-plaintext entry."""
    with _db.SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one()
        db.query(EmailOTP).filter_by(user_id=user.id).delete()
        delta = timedelta(minutes=-1) if expired else timedelta(minutes=10)
        db.add(EmailOTP(
            user_id=user.id,
            code_hash=hash_otp(otp),
            purpose=purpose,
            expires_at=datetime.now(timezone.utc) + delta,
        ))
        db.commit()


def _get_user(email="alice@example.com"):
    with _db.SessionLocal() as db:
        return db.execute(select(User).where(User.email == email)).scalar_one()


def test_signup_then_verify_flow(client):
    r = signup(client)
    assert r.status_code == 201, r.text
    assert r.json()["email_verified_at"] is None

    r = client.post("/auth/email/verify/request", json={"email": "alice@example.com"})
    assert r.status_code == 200
    assert r.json()["message"] == "If the email exists, a verification code has been sent."

    _insert_otp(otp="654321")
    r = client.post(
        "/auth/email/verify/confirm",
        json={"email": "alice@example.com", "otp": "654321"},
    )
    assert r.status_code == 200, r.text
    assert _get_user().email_verified_at is not None

    # /auth/me reflects it.
    tokens = login(client).json()
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.json()["email_verified_at"] is not None


def test_wrong_otp_rejected(client):
    signup(client)
    _insert_otp(otp="654321")
    r = client.post(
        "/auth/email/verify/confirm",
        json={"email": "alice@example.com", "otp": "999999"},
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"
    assert _get_user().email_verified_at is None


def test_expired_otp_rejected(client):
    signup(client)
    _insert_otp(otp="654321", expired=True)
    r = client.post(
        "/auth/email/verify/confirm",
        json={"email": "alice@example.com", "otp": "654321"},
    )
    assert r.status_code == 401
    assert _get_user().email_verified_at is None


def test_password_reset_otp_cannot_verify_email(client):
    """Purpose isolation: a password_reset OTP must NOT verify the email."""
    signup(client)
    _insert_otp(otp="654321", purpose="password_reset")
    r = client.post(
        "/auth/email/verify/confirm",
        json={"email": "alice@example.com", "otp": "654321"},
    )
    assert r.status_code == 401
    assert _get_user().email_verified_at is None


def test_verify_otp_cannot_reset_password(client):
    """Purpose isolation: an email_verify OTP must NOT reset the password."""
    signup(client)
    _insert_otp(otp="654321", purpose="email_verify")
    r = client.post(
        "/auth/password/reset",
        json={
            "email": "alice@example.com",
            "otp": "654321",
            "new_password": "NewPassword2",
        },
    )
    assert r.status_code == 401
    # Old password still works.
    assert login(client).status_code == 200


def test_request_unknown_email_is_silent(client):
    r = client.post("/auth/email/verify/request", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    assert r.json()["message"] == "If the email exists, a verification code has been sent."


def test_request_when_already_verified_is_silent(client):
    signup(client)
    _insert_otp(otp="654321")
    r = client.post(
        "/auth/email/verify/confirm",
        json={"email": "alice@example.com", "otp": "654321"},
    )
    assert r.status_code == 200

    # Re-request: same 200 message, but no new OTP is issued.
    r = client.post("/auth/email/verify/request", json={"email": "alice@example.com"})
    assert r.status_code == 200
    with _db.SessionLocal() as db:
        user = db.execute(select(User).where(User.email == "alice@example.com")).scalar_one()
        unused = db.query(EmailOTP).filter(
            EmailOTP.user_id == user.id,
            EmailOTP.purpose == "email_verify",
            EmailOTP.used_at.is_(None),
        ).count()
        assert unused == 0


def test_login_blocked_until_verified_when_flag_on(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "REQUIRE_EMAIL_VERIFICATION", True)
    signup(client)

    r = login(client)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "email_not_verified"

    _insert_otp(otp="654321")
    r = client.post(
        "/auth/email/verify/confirm",
        json={"email": "alice@example.com", "otp": "654321"},
    )
    assert r.status_code == 200

    assert login(client).status_code == 200


def test_google_user_auto_verified(db_session):
    """Google verifies email ownership — accounts it creates are pre-verified."""
    from app.auth.services.auth_service import auth_service

    u = auth_service._create_google_user(
        db_session, email="goog@example.com", google_uid="uid-123"
    )
    assert u.email_verified_at is not None
    assert u.tos_accepted_at is not None
    assert u.tos_version is not None
    assert u.password_hash is None
