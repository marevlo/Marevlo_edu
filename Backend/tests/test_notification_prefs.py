"""Notification preferences: endpoint CRUD + delivery gating."""
from sqlalchemy import select

from app.auth.services.auth_service import auth_service
from app.notifications.models.notification import (
    NOTIF_ADMIN_ANNOUNCEMENT,
    NOTIF_CERTIFICATE_READY,
    NOTIF_POST_LIKE,
    Notification,
)
from app.notifications.models.preference import UserNotificationPrefs
from app.notifications.services.notification_service import notification_service


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    return client.post(
        "/auth/login", data={"username": email, "password": "Password1"}
    ).json()["access_token"]


# ── Endpoints ───────────────────────────────────────────────────────────
def test_get_preferences_defaults(client):
    token = _signup_and_login(client)
    r = client.get(
        "/notifications/preferences", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    assert r.json() == {
        "in_app_social": True,
        "in_app_announcements": True,
        "email_updates": True,
    }


def test_put_partial_update(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    r = client.put("/notifications/preferences", json={"in_app_social": False}, headers=H)
    assert r.status_code == 200
    assert r.json() == {
        "in_app_social": False,
        "in_app_announcements": True,
        "email_updates": True,
    }

    # A second partial update leaves the first change intact.
    r = client.put("/notifications/preferences", json={"email_updates": False}, headers=H)
    assert r.json() == {
        "in_app_social": False,
        "in_app_announcements": True,
        "email_updates": False,
    }

    # GET reflects the stored state.
    r = client.get("/notifications/preferences", headers=H)
    assert r.json()["in_app_social"] is False


def test_preferences_require_auth(client):
    assert client.get("/notifications/preferences").status_code == 401
    assert client.put("/notifications/preferences", json={}).status_code == 401


# ── Delivery gating ─────────────────────────────────────────────────────
def test_notify_skips_disabled_type(db_session):
    a = auth_service.signup(db_session, email="a@x.com", username="aa_user", password="Password1")
    b = auth_service.signup(db_session, email="b@x.com", username="bb_user", password="Password1")
    db_session.add(UserNotificationPrefs(user_id=a.id, in_app_social=False))
    db_session.commit()

    out = notification_service.notify(
        db_session,
        user_id=a.id,
        type=NOTIF_POST_LIKE,
        payload={"post_id": 1},
        actor_user_id=b.id,
    )
    assert out is None
    rows = db_session.execute(
        select(Notification).where(Notification.user_id == a.id)
    ).scalars().all()
    assert rows == []

    # Unmapped types are always delivered regardless of toggles.
    out = notification_service.notify(
        db_session, user_id=a.id, type=NOTIF_CERTIFICATE_READY, payload={}
    )
    assert out is not None


def test_notify_allows_when_no_prefs_row(db_session):
    a = auth_service.signup(db_session, email="a@x.com", username="aa_user", password="Password1")
    b = auth_service.signup(db_session, email="b@x.com", username="bb_user", password="Password1")

    out = notification_service.notify(
        db_session,
        user_id=a.id,
        type=NOTIF_POST_LIKE,
        payload={"post_id": 1},
        actor_user_id=b.id,
    )
    assert out is not None


def test_announce_to_all_excludes_opted_out(db_session):
    a = auth_service.signup(db_session, email="a@x.com", username="aa_user", password="Password1")
    b = auth_service.signup(db_session, email="b@x.com", username="bb_user", password="Password1")
    c = auth_service.signup(db_session, email="c@x.com", username="cc_user", password="Password1")
    # b opted out; c has an explicit row with announcements still on;
    # a has no row at all (defaults apply).
    db_session.add(UserNotificationPrefs(user_id=b.id, in_app_announcements=False))
    db_session.add(UserNotificationPrefs(user_id=c.id))
    db_session.commit()

    count = notification_service.announce_to_all(
        db_session,
        type=NOTIF_ADMIN_ANNOUNCEMENT,
        payload={"title": "t", "body": "b"},
    )
    assert count == 2

    recipients = {
        n.user_id
        for n in db_session.execute(select(Notification)).scalars().all()
    }
    assert recipients == {a.id, c.id}
