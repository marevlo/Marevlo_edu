"""
Notification system tests:
  - comment on your post emits a notification
  - like on your post emits a notification (and unlike does not)
  - self-actions don't emit notifications to yourself
  - mark-read flow
  - admin announcement fans out to all users
  - listing pagination works and unread_count is correct
"""
from sqlalchemy import select

from app.auth.models.user import User
from app.core import database as _db
from app.notifications.models.notification import (
    NOTIF_ADMIN_ANNOUNCEMENT,
    NOTIF_POST_COMMENT,
    NOTIF_POST_LIKE,
    NOTIF_REPORT_RESOLVED,
    Notification,
)


def _SL():
    return _db.SessionLocal()


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    return client.post(
        "/auth/login", data={"username": email, "password": "Password1"}
    ).json()["access_token"]


# ── Triggers ────────────────────────────────────────────────────────────
def test_post_comment_notifies_post_author(client):
    """Bob comments on Alice's post → Alice gets a comment notification."""
    token_a = _signup_and_login(client, username="alice", email="alice@x.com")
    token_b = _signup_and_login(client, username="bobby", email="bob@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    post_id = client.post(
        "/feed/posts", json={"content": "hi", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(
        f"/feed/posts/{post_id}/comments", json={"content": "great post"}, headers=HB
    )

    r = client.get("/notifications", headers=HA)
    assert r.status_code == 200
    items = r.json()["notifications"]
    assert any(n["type"] == NOTIF_POST_COMMENT for n in items)
    notif = next(n for n in items if n["type"] == NOTIF_POST_COMMENT)
    assert notif["payload"]["post_id"] == post_id
    assert notif["actor_username"] == "bobby"
    assert notif["read_at"] is None


def test_post_like_notifies_post_author(client):
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)

    items = client.get("/notifications", headers=HA).json()["notifications"]
    assert any(n["type"] == NOTIF_POST_LIKE for n in items)


def test_unlike_does_not_emit_notification(client):
    """Toggling off a like should not generate a fresh notification."""
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)
    # Bob unlikes
    client.post(f"/feed/posts/{pid}/like", headers=HB)

    # Alice should have exactly one POST_LIKE notification, not two.
    with _SL() as db:
        likes = db.execute(
            select(Notification)
            .where(Notification.type == NOTIF_POST_LIKE)
        ).scalars().all()
        # There's only one poster (Alice) and one liker (Bob) in this test;
        # exactly one row from the like-on event.
        assert len(likes) == 1


def test_self_actions_do_not_notify_self(client):
    """Alice liking and commenting on her own post should NOT notify herself."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    pid = client.post(
        "/feed/posts", json={"content": "self", "type": "post"}, headers=H
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=H)
    client.post(f"/feed/posts/{pid}/comments", json={"content": "self comment"}, headers=H)

    items = client.get("/notifications", headers=H).json()["notifications"]
    assert items == []


def test_unread_count_endpoint(client):
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)
    client.post(f"/feed/posts/{pid}/comments", json={"content": "c"}, headers=HB)

    r = client.get("/notifications/unread-count", headers=HA)
    assert r.status_code == 200
    assert r.json()["unread_count"] == 2


# ── Mark read ───────────────────────────────────────────────────────────
def test_mark_one_read(client):
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)
    nid = client.get("/notifications", headers=HA).json()["notifications"][0]["id"]

    r = client.post(f"/notifications/{nid}/read", headers=HA)
    assert r.status_code == 200
    assert r.json()["affected"] == 1

    # Second mark-read returns 404 (already read, idempotent — same status).
    r = client.post(f"/notifications/{nid}/read", headers=HA)
    assert r.status_code == 404

    # Unread count drops.
    assert client.get("/notifications/unread-count", headers=HA).json()["unread_count"] == 0


def test_cant_mark_someone_elses_notification(client):
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)
    nid = client.get("/notifications", headers=HA).json()["notifications"][0]["id"]

    # Bob tries to mark Alice's notification read.
    r = client.post(f"/notifications/{nid}/read", headers=HB)
    assert r.status_code == 404


def test_mark_all_read(client):
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)
    client.post(f"/feed/posts/{pid}/comments", json={"content": "c"}, headers=HB)

    r = client.post("/notifications/mark-all-read", headers=HA)
    assert r.status_code == 200
    assert r.json()["affected"] == 2
    assert client.get("/notifications/unread-count", headers=HA).json()["unread_count"] == 0


# ── Filter only_unread ──────────────────────────────────────────────────
def test_only_unread_filter(client):
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    client.post(f"/feed/posts/{pid}/like", headers=HB)
    client.post(f"/feed/posts/{pid}/comments", json={"content": "c"}, headers=HB)
    # Mark one read
    nid = client.get("/notifications", headers=HA).json()["notifications"][0]["id"]
    client.post(f"/notifications/{nid}/read", headers=HA)

    r = client.get("/notifications?only_unread=true", headers=HA)
    items = r.json()["notifications"]
    assert len(items) == 1
    assert all(n["read_at"] is None for n in items)


# ── Admin announcement ──────────────────────────────────────────────────
def test_admin_announcement_fans_out(client):
    """Admin announcement creates a notification for every active user."""
    # Three regular users
    _signup_and_login(client, username="alice", email="a@x.com")
    _signup_and_login(client, username="bobby", email="b@x.com")
    _signup_and_login(client, username="carol", email="c@x.com")
    # Admin
    _signup_and_login(client, username="admin", email="admin@x.com")
    with _SL() as db:
        admin = db.query(User).filter_by(username="admin").first()
        admin.is_admin = True
        db.commit()
    admin_token = client.post(
        "/auth/login", data={"username": "admin@x.com", "password": "Password1"}
    ).json()["access_token"]
    AH = {"Authorization": f"Bearer {admin_token}"}

    r = client.post(
        "/admin/announcements",
        json={
            "title": "New course: RAG",
            "body": "Just shipped!",
            "url": "/courses/rag",
        },
        headers=AH,
    )
    assert r.status_code == 200
    # 3 users + admin = 4, minus self = 3.
    assert r.json()["affected"] == 3

    # Each user can read the announcement.
    alice_token = client.post(
        "/auth/login", data={"username": "a@x.com", "password": "Password1"}
    ).json()["access_token"]
    items = client.get(
        "/notifications", headers={"Authorization": f"Bearer {alice_token}"}
    ).json()["notifications"]
    assert any(n["type"] == NOTIF_ADMIN_ANNOUNCEMENT for n in items)
    notif = next(n for n in items if n["type"] == NOTIF_ADMIN_ANNOUNCEMENT)
    assert notif["payload"]["title"] == "New course: RAG"


def test_admin_announcement_rejects_missing_fields(client):
    _signup_and_login(client, username="admin", email="admin@x.com")
    with _SL() as db:
        admin = db.query(User).filter_by(username="admin").first()
        admin.is_admin = True
        db.commit()
    tok = client.post(
        "/auth/login", data={"username": "admin@x.com", "password": "Password1"}
    ).json()["access_token"]

    r = client.post(
        "/admin/announcements",
        json={"title": "missing body"},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 400


def test_announcement_requires_admin(client):
    token = _signup_and_login(client)
    r = client.post(
        "/admin/announcements",
        json={"title": "x", "body": "y"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


# ── Report-resolved notification ────────────────────────────────────────
def test_report_resolved_notifies_reporter(client):
    """When admin resolves a report, the reporter gets notified."""
    # Alice (post author), Bob (reporter), admin
    token_a = _signup_and_login(client, username="alice", email="a@x.com")
    token_b = _signup_and_login(client, username="bobby", email="b@x.com")
    _signup_and_login(client, username="admin", email="admin@x.com")
    with _SL() as db:
        admin = db.query(User).filter_by(username="admin").first()
        admin.is_admin = True
        db.commit()
    admin_tok = client.post(
        "/auth/login", data={"username": "admin@x.com", "password": "Password1"}
    ).json()["access_token"]

    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}
    AH = {"Authorization": f"Bearer {admin_tok}"}

    pid = client.post(
        "/feed/posts", json={"content": "x", "type": "post"}, headers=HA
    ).json()["id"]
    rid = client.post(
        f"/feed/posts/{pid}/report",
        json={"reason": "spam"},
        headers=HB,
    ).json()["id"]

    # Admin resolves
    r = client.post(
        f"/admin/reports/post/{rid}/resolve",
        json={"action": "resolve_delete"},
        headers=AH,
    )
    assert r.status_code == 200

    # Bob (reporter) sees the resolution notification.
    items = client.get("/notifications", headers=HB).json()["notifications"]
    resolved = [n for n in items if n["type"] == NOTIF_REPORT_RESOLVED]
    assert len(resolved) == 1
    assert resolved[0]["payload"]["report_id"] == rid
    assert resolved[0]["payload"]["action"] == "resolve_delete"
