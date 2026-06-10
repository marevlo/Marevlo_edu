"""
Query-budget regression tests.

Every list endpoint that joins to other tables MUST issue O(1) SQL statements,
not O(N) — once N is the page size. This catches N+1 the moment a careless
attribute access or relationship traversal slips into a router or serializer.

How to add a new endpoint to this file:
  1. Seed enough rows that an N+1 bug would be obvious (≥10 rows is plenty).
  2. Wrap the request in `with query_counter() as count:`.
  3. Assert `count.value < BUDGET` where BUDGET is roughly 2x what the cleanly-
     written code emits, leaving headroom for incidental queries the framework
     adds (auth lookup, etc).

If a budget assertion fails on a PR, the diff almost always introduced a
lazy-load or a per-row .first() call. Find it and replace with selectinload
or a single bulk query.
"""

import pytest


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    return client.post(
        "/auth/login",
        data={"username": email, "password": "Password1"},
    ).json()["access_token"]


# ── Feed list ───────────────────────────────────────────────────────────
def test_feed_list_query_budget(client, query_counter):
    """20 posts × (1 like + 1 comment each) = page should still be < 12 queries."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    for i in range(20):
        pid = client.post("/feed/posts", json={"content": f"p{i}", "type": "post"}, headers=H).json()["id"]
        client.post(f"/feed/posts/{pid}/like", headers=H)
        client.post(f"/feed/posts/{pid}/comments", json={"content": f"c{i}"}, headers=H)

    with query_counter() as count:
        r = client.get("/feed/posts", headers=H)
    assert r.status_code == 200
    assert len(r.json()["posts"]) == 20
    # Expected: auth user + count + posts + author selectinload + comments selectinload
    # + comment-author selectinload + liked-by-me set + hidden-user set ~= 8.
    assert count.value < 12, (
        f"feed list issued {count.value} queries with 20 posts — N+1 regression?\n"
        + "\n".join(f"  - {s.split(chr(10))[0][:90]}" for s in count.statements)
    )


# ── Chat list ───────────────────────────────────────────────────────────
def test_chat_list_query_budget(client, query_counter):
    """5 chats with messages should issue a constant handful of queries."""
    from sqlalchemy import select
    from app.auth.models.user import User
    from app.core.database import SessionLocal

    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    H = {"Authorization": f"Bearer {token_a}"}

    for i in range(5):
        _signup_and_login(client, username=f"usr{i}", email=f"u{i}@example.com")
        with SessionLocal() as db:
            uid = db.execute(select(User.id).where(User.username == f"usr{i}")).scalar()
        cid = client.get(f"/chat/chats/{uid}", headers=H).json()["id"]
        client.post(
            f"/chat/chats/{cid}/messages",
            json={"content": f"hi {i}"},
            headers=H,
        )

    with query_counter() as count:
        r = client.get("/chat/chats", headers=H)
    assert r.status_code == 200
    assert len(r.json()["chats"]) == 5
    # Expected: auth + count + chats + bulk users + bulk last-message
    # + bulk unread + hidden-user set ~= 7-8
    assert count.value < 12, (
        f"chat list issued {count.value} queries — N+1 regression?\n"
        + "\n".join(f"  - {s.split(chr(10))[0][:90]}" for s in count.statements)
    )


# ── Problems list ───────────────────────────────────────────────────────
def test_problems_list_query_budget(client, query_counter):
    """Listing problems should be auth + count + select — that's it."""
    from app.problems.models.problem import Problem
    from app.core.database import SessionLocal

    token = _signup_and_login(client)
    with SessionLocal() as db:
        for i in range(15):
            db.add(
                Problem(
                    title=f"P{i}",
                    description="desc",
                    difficulty=("Easy" if i % 3 == 0 else "Medium"),
                )
            )
        db.commit()

    with query_counter() as count:
        r = client.get("/problems?limit=20", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) == 15
    # Expected: auth + count + select = 3
    assert count.value < 6, (
        f"problems list issued {count.value} queries — should be ~3"
    )


# ── Course comments list (public, no auth) ─────────────────────────────
def test_course_comments_list_query_budget(client, query_counter):
    """Course comment list is a single JOIN — should be 1 query."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    for i in range(10):
        client.post(
            "/courses/m01/comments", json={"content": f"comment {i}"}, headers=H
        )

    with query_counter() as count:
        r = client.get("/courses/m01/comments")
    assert r.status_code == 200
    assert len(r.json()["comments"]) == 10
    # No auth on this endpoint; just 1 JOIN query.
    assert count.value < 3, (
        f"course comments issued {count.value} queries — should be ~1"
    )


# ── Admin reports list ──────────────────────────────────────────────────
def test_admin_reports_list_query_budget(client, query_counter):
    """Admin reports queue with mixed types should still be O(1)."""
    from app.auth.models.user import User
    from app.core.database import SessionLocal

    # Create an admin
    _signup_and_login(client, username="admin", email="admin@example.com")
    with SessionLocal() as db:
        admin = db.query(User).filter_by(username="admin").first()
        admin.is_admin = True
        db.commit()
    admin_token = client.post(
        "/auth/login",
        data={"username": "admin@example.com", "password": "Password1"},
    ).json()["access_token"]
    AH = {"Authorization": f"Bearer {admin_token}"}

    # Create reporters and posts; file 5 reports
    for i in range(5):
        rep_tok = _signup_and_login(client, username=f"rep{i}", email=f"rep{i}@example.com")
        # post by admin so reporters can report it
        if i == 0:
            client.post(
                "/feed/posts",
                json={"content": "to report", "type": "post"},
                headers=AH,
            )
        client.post(
            "/feed/posts/1/report",
            json={"reason": "spam"},
            headers={"Authorization": f"Bearer {rep_tok}"},
        )

    with query_counter() as count:
        r = client.get("/admin/reports", headers=AH)
    assert r.status_code == 200
    # Expected: auth + 2 count queries (post + comment) + 2 select queries
    # (post reports + comment reports) + 1 union total = ~6
    assert count.value < 12, (
        f"admin reports issued {count.value} queries — N+1 regression?"
    )
