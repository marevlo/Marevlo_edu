"""End-to-end auth flow tests."""
import pytest


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


def test_signup_then_login(client):
    r = signup(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["username"] == "alice"
    assert body["email"] == "alice@example.com"
    assert body["is_active"] is True

    r = login(client)
    assert r.status_code == 200, r.text
    tokens = r.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["token_type"] == "bearer"


def test_signup_duplicate_email_rejected(client):
    signup(client)
    r = signup(client, username="bob")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_already_registered"


def test_signup_duplicate_username_rejected(client):
    signup(client)
    r = signup(client, email="bob@example.com")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "username_taken"


def test_login_wrong_password_returns_401(client):
    signup(client)
    r = login(client, password="WrongPassword1")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"


def test_login_unknown_email_returns_401(client):
    r = login(client, email="ghost@example.com")
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_returns_user_with_access_token(client):
    signup(client)
    tokens = login(client).json()
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.status_code == 200
    assert r.json()["email"] == "alice@example.com"


def test_refresh_rotates_token_and_revokes_old(client):
    signup(client)
    tokens = login(client).json()
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    new_tokens = r.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    # Old refresh should now be revoked.
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_logout_revokes_all_refresh_tokens(client):
    signup(client)
    tokens = login(client).json()
    r = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert r.status_code == 200

    # Refresh after logout must fail.
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_password_reset_full_flow(client, db_session, fake_redis, monkeypatch, capsys):
    """Signup → request reset → grab OTP from logs → reset → login with new pw."""
    signup(client)

    # Request reset
    r = client.post("/auth/password/forgot", json={"email": "alice@example.com"})
    assert r.status_code == 200

    # Grab the OTP from the EmailOTP table directly (in dev mode the email
    # service prints the code; we don't want to depend on stdout capture).
    from app.auth.models.user import EmailOTP, User
    from app.core.security import generate_otp, hash_otp

    # Re-issue with a known OTP for the test (the real one was just generated
    # but we can't verify it without the plaintext). We simulate by inserting
    # our own OTP entry.
    from app.core.database import SessionLocal
    from datetime import datetime, timedelta, timezone

    with SessionLocal() as db:
        user = db.query(User).first()
        # Burn any existing OTPs and insert a known one.
        db.query(EmailOTP).filter_by(user_id=user.id).delete()
        otp_value = "654321"
        db.add(EmailOTP(
            user_id=user.id,
            code_hash=hash_otp(otp_value),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        ))
        db.commit()

    # Reset with the OTP
    r = client.post(
        "/auth/password/reset",
        json={
            "email": "alice@example.com",
            "otp": otp_value,
            "new_password": "NewPassword2",
        },
    )
    assert r.status_code == 200, r.text

    # Old password should no longer work
    r = login(client, password="Password1")
    assert r.status_code == 401

    # New password should work
    r = login(client, password="NewPassword2")
    assert r.status_code == 200


def test_password_reset_with_wrong_otp_rejected(client, db_session):
    signup(client)
    r = client.post("/auth/password/forgot", json={"email": "alice@example.com"})
    assert r.status_code == 200

    r = client.post(
        "/auth/password/reset",
        json={"email": "alice@example.com", "otp": "999999", "new_password": "NewPassword2"},
    )
    assert r.status_code == 401


def test_signup_weak_password_rejected(client):
    r = client.post(
        "/auth/signup",
        json={"username": "weakpw", "email": "weak@example.com", "password": "alllower1"},
    )
    assert r.status_code == 422  # pydantic validation error


def test_password_forgot_rate_limited_per_email(client, fake_redis):
    """5 OTP requests per email per hour, regardless of IP."""
    signup(client)
    # First 5 succeed (silent).
    for _ in range(5):
        r = client.post("/auth/password/forgot", json={"email": "alice@example.com"})
        assert r.status_code == 200

    # 6th must be rate-limited.
    r = client.post("/auth/password/forgot", json={"email": "alice@example.com"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"

    # Different email is still allowed (per-email key, not global).
    r = client.post("/auth/password/forgot", json={"email": "bob@example.com"})
    assert r.status_code == 200


def test_password_reset_attempt_rate_limited_per_email(client, fake_redis):
    """10 wrong-OTP attempts per email per hour."""
    signup(client)
    # 10 wrong attempts succeed (return 401, not rate-limited yet).
    for _ in range(10):
        r = client.post(
            "/auth/password/reset",
            json={"email": "alice@example.com", "otp": "000000", "new_password": "NewPass1"},
        )
        assert r.status_code == 401

    # 11th attempt is rate-limited.
    r = client.post(
        "/auth/password/reset",
        json={"email": "alice@example.com", "otp": "000000", "new_password": "NewPass1"},
    )
    assert r.status_code == 429
