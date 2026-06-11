"""ToS / Privacy Policy consent at signup."""
from sqlalchemy import select

from app.auth.models.user import User


def _payload(**kw):
    base = {"username": "tosuser", "email": "tos@example.com", "password": "Password1"}
    base.update(kw)
    return base


def test_flag_off_signup_without_acceptance_ok(client, db_session):
    """Test env defaults REQUIRE_TOS_ACCEPT=false — no consent recorded."""
    r = client.post("/auth/signup", json=_payload())
    assert r.status_code == 201, r.text
    u = db_session.execute(select(User).where(User.email == "tos@example.com")).scalar_one()
    assert u.tos_accepted_at is None
    assert u.tos_version is None


def test_flag_on_signup_without_acceptance_rejected(client, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "REQUIRE_TOS_ACCEPT", True)
    r = client.post("/auth/signup", json=_payload())
    assert r.status_code == 400, r.text
    assert "terms of service" in str(r.json()).lower()


def test_flag_on_signup_with_acceptance_records_consent(client, db_session, monkeypatch):
    from app.core.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "REQUIRE_TOS_ACCEPT", True)
    r = client.post("/auth/signup", json=_payload(tos_accepted=True))
    assert r.status_code == 201, r.text

    u = db_session.execute(select(User).where(User.email == "tos@example.com")).scalar_one()
    assert u.tos_accepted_at is not None
    assert u.tos_version == s.TOS_VERSION


def test_flag_off_acceptance_still_recorded_when_given(client, db_session):
    r = client.post("/auth/signup", json=_payload(tos_accepted=True))
    assert r.status_code == 201, r.text
    u = db_session.execute(select(User).where(User.email == "tos@example.com")).scalar_one()
    assert u.tos_accepted_at is not None
    assert u.tos_version is not None
