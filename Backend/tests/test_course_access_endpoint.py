"""GET /learning/courses/{course_id}/access — the frontend paywall check."""
import pytest
from sqlalchemy import select

from app.auth.models.user import User
from app.entitlements.services.entitlement_service import entitlement_service


@pytest.fixture
def enforce_on(monkeypatch):
    from app.core.config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "ENFORCE_COURSE_ACCESS", True)
    monkeypatch.setattr(s, "COURSE_PRODUCT_DEFAULT", "all_access")
    monkeypatch.setattr(s, "FREE_COURSE_IDS", "intro")
    monkeypatch.setattr(s, "COURSE_PRODUCT_OVERRIDES", "dsa-course:dsa")


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    return client.post(
        "/auth/login", data={"username": email, "password": "Password1"}
    ).json()["access_token"]


def _get(client, token, course_id):
    return client.get(
        f"/learning/courses/{course_id}/access",
        headers={"Authorization": f"Bearer {token}"},
    )


def test_requires_auth(client):
    assert client.get("/learning/courses/recsys/access").status_code == 401


def test_free_course_open_to_all(client, enforce_on):
    token = _signup_and_login(client)
    r = _get(client, token, "intro")
    assert r.status_code == 200
    assert r.json() == {
        "course_id": "intro",
        "required_product": None,
        "is_free": True,
        "has_access": True,
    }


def test_paid_course_without_entitlement(client, enforce_on):
    token = _signup_and_login(client)
    r = _get(client, token, "recsys")
    assert r.status_code == 200
    assert r.json() == {
        "course_id": "recsys",
        "required_product": "all_access",
        "is_free": False,
        "has_access": False,
    }


def test_paid_course_with_entitlement(client, db_session, enforce_on):
    token = _signup_and_login(client)
    u = db_session.execute(select(User).where(User.email == "alice@example.com")).scalar_one()
    entitlement_service.grant(db_session, user_id=u.id, product="all_access", source="paid")

    r = _get(client, token, "recsys")
    assert r.json()["has_access"] is True


def test_override_product_isolated(client, db_session, enforce_on):
    """A dsa entitlement unlocks the dsa-course override but not the default."""
    token = _signup_and_login(client)
    u = db_session.execute(select(User).where(User.email == "alice@example.com")).scalar_one()
    entitlement_service.grant(db_session, user_id=u.id, product="dsa", source="paid")

    r = _get(client, token, "dsa-course")
    assert r.json() == {
        "course_id": "dsa-course",
        "required_product": "dsa",
        "is_free": False,
        "has_access": True,
    }
    # dsa does NOT unlock all_access courses.
    assert _get(client, token, "recsys").json()["has_access"] is False


def test_dotted_course_id_resolves_root(client, enforce_on):
    token = _signup_and_login(client)
    r = _get(client, token, "recsys.m01.l03")
    assert r.json()["required_product"] == "all_access"
    assert r.json()["has_access"] is False


def test_staff_bypasses(client, db_session, enforce_on):
    token = _signup_and_login(client)
    u = db_session.execute(select(User).where(User.email == "alice@example.com")).scalar_one()
    u.role = "admin"
    db_session.commit()

    r = _get(client, token, "recsys")
    assert r.json()["has_access"] is True


def test_enforcement_off_unlocks_everything(client):
    """Test env default: ENFORCE_COURSE_ACCESS=false → always has_access."""
    token = _signup_and_login(client)
    r = _get(client, token, "recsys")
    assert r.status_code == 200
    body = r.json()
    assert body["has_access"] is True
    assert body["is_free"] is False  # still flagged paid, just not enforced
