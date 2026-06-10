"""
Feed end-to-end + performance tests.

The key assertion in test_feed_list_query_count is that a feed page with N
posts triggers a constant number of SQL queries (not O(N)). This catches
N+1 regressions automatically.
"""
from unittest.mock import patch

from sqlalchemy import event


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    r = client.post(
        "/auth/login",
        data={"username": email, "password": "Password1"},
    )
    return r.json()["access_token"]


def test_create_and_list_posts(client):
    token = _signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/feed/posts", json={"content": "Hello world!", "type": "post"}, headers=headers)
    assert r.status_code == 200, r.text
    post = r.json()
    assert post["content"] == "Hello world!"
    assert post["author"] == "alice"
    assert post["likes"] == 0

    r = client.get("/feed/posts", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["posts"]) == 1
    assert body["posts"][0]["id"] == post["id"]


def test_like_toggle(client):
    token = _signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post("/feed/posts", json={"content": "x", "type": "post"}, headers=headers)
    pid = r.json()["id"]

    # Like
    r = client.post(f"/feed/posts/{pid}/like", headers=headers)
    assert r.status_code == 200
    assert r.json()["likes"] == 1
    assert r.json()["likedByMe"] is True

    # Unlike
    r = client.post(f"/feed/posts/{pid}/like", headers=headers)
    assert r.status_code == 200
    assert r.json()["likes"] == 0
    assert r.json()["likedByMe"] is False


def test_delete_post_only_by_author(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")

    r = client.post("/feed/posts", json={"content": "alice's post", "type": "post"},
                    headers={"Authorization": f"Bearer {token_a}"})
    pid = r.json()["id"]

    # Bob tries to delete Alice's post
    r = client.delete(f"/feed/posts/{pid}", headers={"Authorization": f"Bearer {token_b}"})
    assert r.status_code == 403

    # Alice deletes her own
    r = client.delete(f"/feed/posts/{pid}", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200


def test_feed_list_query_count_is_constant(client, engine):
    """N+1 regression test.

    Create 10 posts, hit /feed/posts, assert we issue a small constant number
    of queries — NOT one per post. Old code did 5+ queries per post.
    """
    token = _signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Create 10 posts with comments and likes to stress the renderer.
    for i in range(10):
        r = client.post("/feed/posts", json={"content": f"post {i}", "type": "post"}, headers=headers)
        pid = r.json()["id"]
        client.post(f"/feed/posts/{pid}/like", headers=headers)
        client.post(f"/feed/posts/{pid}/comments", json={"content": f"comment {i}"}, headers=headers)

    # Count queries during the list call.
    queries: list[str] = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        # Skip BEGIN/COMMIT noise — only count statement executions.
        if statement.strip().upper().startswith(("BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE")):
            return
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        r = client.get("/feed/posts", headers=headers)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    assert r.status_code == 200
    body = r.json()
    assert len(body["posts"]) == 10

    # Constant query budget: auth lookup + count + posts + author selectinload
    # + comments selectinload + comment-author selectinload + liked-by-me set.
    # Allow some headroom but assert it stays < ~15 even with 10 posts.
    assert len(queries) < 15, f"Feed list issued {len(queries)} queries — N+1 regression?"
