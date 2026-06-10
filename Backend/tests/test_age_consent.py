"""Age / DPDP minor-handling at signup."""
from datetime import date


def _payload(**kw):
    base = {"username": "kid", "email": "kid@example.com", "password": "Password1"}
    base.update(kw)
    return base


def _minor_dob():
    return f"{date.today().year - 12}-01-01"  # ~12 years old


def test_adult_signup_ok(client):
    r = client.post("/auth/signup", json=_payload(date_of_birth="2000-01-01"))
    assert r.status_code == 201, r.text


def test_minor_without_guardian_rejected(client):
    r = client.post("/auth/signup", json=_payload(
        username="kid1", email="kid1@example.com", date_of_birth=_minor_dob()))
    assert r.status_code == 400, r.text
    assert "guardian" in str(r.json()).lower()


def test_minor_with_guardian_consent_ok(client, db_session):
    r = client.post("/auth/signup", json=_payload(
        username="kid2", email="kid2@example.com", date_of_birth=_minor_dob(),
        guardian_email="parent@example.com", guardian_consent=True))
    assert r.status_code == 201, r.text
    from app.auth.models.user import User
    from sqlalchemy import select
    u = db_session.execute(select(User).where(User.email == "kid2@example.com")).scalar_one()
    assert u.guardian_email == "parent@example.com"
    assert u.guardian_consent_at is not None


def test_minor_blocked_in_block_mode(client, monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "MINORS_MODE", "block")
    r = client.post("/auth/signup", json=_payload(
        username="kid3", email="kid3@example.com", date_of_birth=_minor_dob()))
    assert r.status_code == 403, r.text
