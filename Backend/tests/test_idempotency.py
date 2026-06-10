"""Idempotency-Key behaviour for create endpoints."""


def _signup_and_login(client):
    client.post(
        "/auth/signup",
        json={"username": "alice", "email": "alice@example.com", "password": "Password1"},
    )
    return client.post(
        "/auth/login",
        data={"username": "alice@example.com", "password": "Password1"},
    ).json()["access_token"]


def test_repeated_post_with_same_idempotency_key_creates_one_post(client):
    """Two POSTs with the same Idempotency-Key must yield the same post id."""
    token = _signup_and_login(client)
    headers = {
        "Authorization": f"Bearer {token}",
        "Idempotency-Key": "client-uuid-1234",
    }

    r1 = client.post("/feed/posts", json={"content": "hello", "type": "post"}, headers=headers)
    assert r1.status_code == 200
    post_id_1 = r1.json()["id"]

    # Replay — same body, same key — must return the same id.
    r2 = client.post("/feed/posts", json={"content": "hello", "type": "post"}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["id"] == post_id_1
    # And the replay header should be set.
    assert r2.headers.get("Idempotent-Replay") == "true"

    # Verify only one row in DB.
    from app.feed.models.post import Post
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        assert db.query(Post).count() == 1


def test_different_idempotency_keys_create_separate_posts(client):
    token = _signup_and_login(client)
    h1 = {"Authorization": f"Bearer {token}", "Idempotency-Key": "key-a"}
    h2 = {"Authorization": f"Bearer {token}", "Idempotency-Key": "key-b"}

    r1 = client.post("/feed/posts", json={"content": "p1", "type": "post"}, headers=h1)
    r2 = client.post("/feed/posts", json={"content": "p2", "type": "post"}, headers=h2)
    assert r1.json()["id"] != r2.json()["id"]


def test_no_idempotency_key_means_no_dedup(client):
    """Without an Idempotency-Key, a retried POST creates a new row."""
    token = _signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    r1 = client.post("/feed/posts", json={"content": "hi", "type": "post"}, headers=headers)
    r2 = client.post("/feed/posts", json={"content": "hi", "type": "post"}, headers=headers)
    assert r1.json()["id"] != r2.json()["id"]
