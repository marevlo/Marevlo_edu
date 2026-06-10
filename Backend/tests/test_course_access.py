"""Course-access enforcement (gates enrollment + auto-enroll)."""
import pytest

from app.core.access import resolve_course_product
from app.core.exceptions import Forbidden
from app.auth.services.auth_service import auth_service
from app.entitlements.services.entitlement_service import entitlement_service
from app.learning.services.learning_service import learning_service


@pytest.fixture
def enforce_on(monkeypatch):
    from app.core.config import get_settings
    s = get_settings()
    monkeypatch.setattr(s, "ENFORCE_COURSE_ACCESS", True)
    monkeypatch.setattr(s, "COURSE_PRODUCT_DEFAULT", "all_access")
    monkeypatch.setattr(s, "FREE_COURSE_IDS", "intro")
    monkeypatch.setattr(s, "COURSE_PRODUCT_OVERRIDES", "dsa-course:dsa")


def _user(db, email, role="student"):
    u = auth_service.signup(db, email=email, username=email.split("@")[0], password="Password1")
    if role != "student":
        u.role = role
        db.commit()
        db.refresh(u)
    return u


def test_resolve_course_product(enforce_on):
    assert resolve_course_product("recsys") == "all_access"
    assert resolve_course_product("recsys.m01.l03") == "all_access"   # root match
    assert resolve_course_product("intro") is None                     # free
    assert resolve_course_product("dsa-course") == "dsa"               # override


def test_free_user_blocked_from_paid_course(client, db_session, enforce_on):
    u = _user(db_session, "fu@example.com")
    with pytest.raises(Forbidden):
        learning_service.enroll(db_session, user_id=u.id, course_id="recsys")


def test_entitled_user_can_enroll(client, db_session, enforce_on):
    u = _user(db_session, "eu@example.com")
    entitlement_service.grant(db_session, user_id=u.id, product="all_access", source="paid")
    e = learning_service.enroll(db_session, user_id=u.id, course_id="recsys")
    assert e.course_id == "recsys"


def test_dsa_only_user_blocked_from_ds_course(client, db_session, enforce_on):
    # dsa entitlement does NOT unlock all_access courses
    u = _user(db_session, "dsa@example.com")
    entitlement_service.grant(db_session, user_id=u.id, product="dsa", source="paid")
    with pytest.raises(Forbidden):
        learning_service.enroll(db_session, user_id=u.id, course_id="recsys")


def test_staff_bypasses(client, db_session, enforce_on):
    u = _user(db_session, "staff@example.com", role="admin")
    e = learning_service.enroll(db_session, user_id=u.id, course_id="recsys")
    assert e.course_id == "recsys"


def test_free_course_open_to_all(client, db_session, enforce_on):
    u = _user(db_session, "anyone@example.com")
    e = learning_service.enroll(db_session, user_id=u.id, course_id="intro")
    assert e.course_id == "intro"


def test_auto_enroll_blocked_for_paid_lesson(client, db_session, enforce_on):
    u = _user(db_session, "auto@example.com")
    with pytest.raises(Forbidden):
        learning_service.upsert_progress(
            db_session, user_id=u.id, course_id="recsys",
            lesson_id="recsys.m01.l01", status="in_progress",
        )
