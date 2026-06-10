"""Moderation: reports, blocks, admin actions, profanity filter, soft-delete behaviour."""
from app.auth.models.user import User
from app.core import database as core_db


def _signup_and_login(client, *, username, email):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    return client.post(
        "/auth/login",
        data={"username": email, "password": "Password1"},
    ).json()["access_token"]


def _make_admin(username):
    """Promote a user to admin directly via DB. In production this would be a
    secure CLI/script; for tests we toggle the column."""
    with core_db.SessionLocal() as db:
        u = db.query(User).filter_by(username=username).first()
        u.is_admin = True
        db.commit()


# ── Profanity filter ───────────────────────────────────────────────────
def test_profanity_in_post_rejected(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    r = client.post(
        "/feed/posts",
        headers={"Authorization": f"Bearer {token}"},
        json={"content": "what the fuck is this", "type": "post"},
    )
    assert r.status_code == 400
    assert "not allowed" in r.json()["error"]["message"].lower()


def test_profanity_in_comment_rejected(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    pid = client.post(
        "/feed/posts", json={"content": "ok post", "type": "post"}, headers=headers
    ).json()["id"]
    r = client.post(
        f"/feed/posts/{pid}/comments",
        json={"content": "you are an asshole"},
        headers=headers,
    )
    assert r.status_code == 400


def test_clean_content_passes(client):
    """Sanity: words containing substrings of profanity ('classic') are NOT blocked."""
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    r = client.post(
        "/feed/posts",
        headers={"Authorization": f"Bearer {token}"},
        json={"content": "This is a classic example of an algorithm.", "type": "post"},
    )
    assert r.status_code == 200


# ── Reports ───────────────────────────────────────────────────────────
def test_report_post(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    pid = client.post(
        "/feed/posts",
        json={"content": "alice's post", "type": "post"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["id"]

    r = client.post(
        f"/feed/posts/{pid}/report",
        json={"reason": "spam", "note": "this looks spammy"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reason"] == "spam"
    assert body["status"] == "open"


def test_cannot_report_own_post(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    pid = client.post("/feed/posts", json={"content": "x", "type": "post"}, headers=headers).json()["id"]
    r = client.post(
        f"/feed/posts/{pid}/report",
        json={"reason": "spam"},
        headers=headers,
    )
    assert r.status_code == 400


def test_cannot_double_report(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    pid = client.post(
        "/feed/posts",
        json={"content": "x", "type": "post"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["id"]
    bob_h = {"Authorization": f"Bearer {token_b}"}
    r1 = client.post(f"/feed/posts/{pid}/report", json={"reason": "spam"}, headers=bob_h)
    assert r1.status_code == 200
    r2 = client.post(f"/feed/posts/{pid}/report", json={"reason": "spam"}, headers=bob_h)
    assert r2.status_code == 409


# ── Admin guard ───────────────────────────────────────────────────────
def test_admin_endpoints_reject_non_admin(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    r = client.get("/admin/reports", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"


def test_admin_can_list_reports(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    pid = client.post(
        "/feed/posts",
        json={"content": "alice", "type": "post"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["id"]
    client.post(
        f"/feed/posts/{pid}/report",
        json={"reason": "abusive"},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    _make_admin("alice")
    r = client.get("/admin/reports", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200
    body = r.json()
    assert body["pagination"]["total_count"] >= 1
    assert any(rr["target_id"] == pid for rr in body["reports"])


def test_admin_resolve_with_delete_hides_post(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    pid = client.post(
        "/feed/posts",
        json={"content": "bad post", "type": "post"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["id"]
    rid = client.post(
        f"/feed/posts/{pid}/report",
        json={"reason": "abusive"},
        headers={"Authorization": f"Bearer {token_b}"},
    ).json()["id"]

    _make_admin("alice")
    r = client.post(
        f"/admin/reports/post/{rid}/resolve",
        json={"action": "resolve_delete"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    # The post should no longer appear in the feed
    r = client.get("/feed/posts", headers={"Authorization": f"Bearer {token_b}"})
    assert all(p["id"] != pid for p in r.json()["posts"])

    # And /feed/posts/{pid} returns 404
    r = client.get(f"/feed/posts/{pid}", headers={"Authorization": f"Bearer {token_b}"})
    assert r.status_code == 404


def test_admin_can_directly_soft_delete_post(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    pid = client.post(
        "/feed/posts",
        json={"content": "post", "type": "post"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["id"]

    _make_admin("alice")
    r = client.delete(
        f"/admin/posts/{pid}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200

    r = client.get("/feed/posts", headers={"Authorization": f"Bearer {token_b}"})
    assert all(p["id"] != pid for p in r.json()["posts"])


# ── Blocks ────────────────────────────────────────────────────────────
def test_block_hides_users_posts_from_feed(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")

    # Bob posts something
    bob_h = {"Authorization": f"Bearer {token_b}"}
    pid = client.post("/feed/posts", json={"content": "from bob", "type": "post"}, headers=bob_h).json()["id"]

    alice_h = {"Authorization": f"Bearer {token_a}"}

    # Alice sees Bob's post initially
    r = client.get("/feed/posts", headers=alice_h)
    assert any(p["id"] == pid for p in r.json()["posts"])

    # Alice blocks Bob
    with core_db.SessionLocal() as db:
        bob_id = db.query(User).filter_by(username="bob").first().id
    r = client.post(f"/users/{bob_id}/block", headers=alice_h)
    assert r.status_code == 200

    # Now Alice doesn't see Bob's post
    r = client.get("/feed/posts", headers=alice_h)
    assert all(p["id"] != pid for p in r.json()["posts"])

    # And Bob doesn't see Alice's posts either (mutual invisibility)
    apid = client.post("/feed/posts", json={"content": "from alice", "type": "post"}, headers=alice_h).json()["id"]
    r = client.get("/feed/posts", headers=bob_h)
    assert all(p["id"] != apid for p in r.json()["posts"])


def test_block_prevents_dm(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    with core_db.SessionLocal() as db:
        bob_id = db.query(User).filter_by(username="bob").first().id

    alice_h = {"Authorization": f"Bearer {token_a}"}

    # Alice blocks Bob
    client.post(f"/users/{bob_id}/block", headers=alice_h)

    # Alice cannot start a chat with Bob
    r = client.get(f"/chat/chats/{bob_id}", headers=alice_h)
    assert r.status_code == 403


def test_unblock(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    with core_db.SessionLocal() as db:
        bob_id = db.query(User).filter_by(username="bob").first().id

    alice_h = {"Authorization": f"Bearer {token_a}"}
    client.post(f"/users/{bob_id}/block", headers=alice_h)

    r = client.delete(f"/users/{bob_id}/block", headers=alice_h)
    assert r.status_code == 200

    # After unblock, chat is allowed again
    r = client.get(f"/chat/chats/{bob_id}", headers=alice_h)
    assert r.status_code == 200


def test_cannot_block_yourself(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    with core_db.SessionLocal() as db:
        alice_id = db.query(User).filter_by(username="alice").first().id
    r = client.post(
        f"/users/{alice_id}/block",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400


def test_my_blocks_list(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")
    with core_db.SessionLocal() as db:
        bob_id = db.query(User).filter_by(username="bob").first().id
    alice_h = {"Authorization": f"Bearer {token_a}"}
    client.post(f"/users/{bob_id}/block", headers=alice_h)

    r = client.get("/users/me/blocks", headers=alice_h)
    assert r.status_code == 200
    blocks = r.json()["blocks"]
    assert len(blocks) == 1
    assert blocks[0]["target_username"] == "bob"
