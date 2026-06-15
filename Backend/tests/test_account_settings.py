"""Account settings: change password + delete account."""
from sqlalchemy import select

from app.auth.models.user import User, UserSession
from app.core import database as _db


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


def _auth(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _get_user(email="alice@example.com"):
    with _db.SessionLocal() as db:
        return db.execute(select(User).where(User.email == email)).scalar_one()


# ── Change password ─────────────────────────────────────────────────────
def test_change_password_success_and_revokes_refresh(client):
    signup(client)
    tokens = login(client).json()

    r = client.post(
        "/auth/password/change",
        json={"current_password": "Password1", "new_password": "NewPassword2"},
        headers=_auth(tokens),
    )
    assert r.status_code == 200, r.text

    # Old refresh token must be revoked.
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401

    # Old password no longer works; new one does.
    assert login(client, password="Password1").status_code == 401
    assert login(client, password="NewPassword2").status_code == 200


def test_change_password_wrong_current_rejected(client):
    signup(client)
    tokens = login(client).json()

    r = client.post(
        "/auth/password/change",
        json={"current_password": "WrongPassword1", "new_password": "NewPassword2"},
        headers=_auth(tokens),
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"
    # Original password untouched.
    assert login(client).status_code == 200


def test_change_password_weak_new_rejected(client):
    signup(client)
    tokens = login(client).json()

    r = client.post(
        "/auth/password/change",
        json={"current_password": "Password1", "new_password": "alllower1"},
        headers=_auth(tokens),
    )
    assert r.status_code == 422  # pydantic validation error


def test_change_password_google_only_account_rejected(client):
    signup(client)
    tokens = login(client).json()
    # Simulate a Google-only account: no password hash.
    with _db.SessionLocal() as db:
        u = db.execute(select(User).where(User.email == "alice@example.com")).scalar_one()
        u.password_hash = None
        db.commit()

    r = client.post(
        "/auth/password/change",
        json={"current_password": "Password1", "new_password": "NewPassword2"},
        headers=_auth(tokens),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "validation_error"
    assert "google" in r.json()["error"]["message"].lower()


def test_change_password_requires_auth(client):
    r = client.post(
        "/auth/password/change",
        json={"current_password": "Password1", "new_password": "NewPassword2"},
    )
    assert r.status_code == 401


# ── Delete account ──────────────────────────────────────────────────────
def test_delete_account_success(client):
    signup(client)
    tokens = login(client).json()
    user_id = _get_user().id

    r = client.post(
        "/auth/account/delete",
        json={"password": "Password1", "confirm": "DELETE"},
        headers=_auth(tokens),
    )
    assert r.status_code == 200, r.text

    # Existing access token is dead (account no longer usable).
    r = client.get("/auth/me", headers=_auth(tokens))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "account_inactive"

    # Refresh token revoked.
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401

    # Login with the original credentials fails.
    assert login(client).status_code == 401

    # Row is anonymized, not hard-deleted.
    with _db.SessionLocal() as db:
        u = db.get(User, user_id)
        assert u is not None
        assert u.deleted_at is not None
        assert u.is_active is False
        assert u.email == f"deleted_user_{user_id}@deleted.invalid"
        assert u.username == f"deleted_user_{user_id}"
        assert u.password_hash is None
        assert u.google_uid is None
        assert u.guardian_email is None
        assert u.date_of_birth is None
        # Open sessions are closed.
        open_sessions = db.execute(
            select(UserSession)
            .where(UserSession.user_id == user_id)
            .where(UserSession.logout_time.is_(None))
        ).scalars().all()
        assert open_sessions == []


def test_delete_account_wrong_confirm_rejected(client):
    signup(client)
    tokens = login(client).json()

    r = client.post(
        "/auth/account/delete",
        json={"password": "Password1", "confirm": "delete"},
        headers=_auth(tokens),
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "validation_error"
    # Account untouched.
    assert client.get("/auth/me", headers=_auth(tokens)).status_code == 200


def test_delete_account_wrong_password_rejected(client):
    signup(client)
    tokens = login(client).json()

    r = client.post(
        "/auth/account/delete",
        json={"password": "WrongPassword1", "confirm": "DELETE"},
        headers=_auth(tokens),
    )
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_credentials"
    assert client.get("/auth/me", headers=_auth(tokens)).status_code == 200


def test_delete_account_missing_password_rejected(client):
    """Password accounts must supply the password."""
    signup(client)
    tokens = login(client).json()

    r = client.post(
        "/auth/account/delete",
        json={"confirm": "DELETE"},
        headers=_auth(tokens),
    )
    assert r.status_code == 401
