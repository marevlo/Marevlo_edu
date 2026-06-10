"""Chat and follow tests."""
def _signup_and_login(client, *, username, email):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    r = client.post("/auth/login", data={"username": email, "password": "Password1"})
    return r.json()["access_token"]


def test_create_chat_and_send_message(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")

    # Alice opens a chat with Bob
    from sqlalchemy import select
    from app.auth.models.user import User
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        bob_id = db.execute(select(User.id).where(User.username == "bob")).scalar()

    r = client.get(f"/chat/chats/{bob_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200, r.text
    chat = r.json()
    chat_id = chat["id"]
    assert chat["user_1_username"] in ("alice", "bob")
    assert chat["user_2_username"] in ("alice", "bob")

    # Send message
    r = client.post(
        f"/chat/chats/{chat_id}/messages",
        json={"content": "Hi Bob!"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["content"] == "Hi Bob!"


def test_cannot_chat_with_yourself(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    from sqlalchemy import select
    from app.auth.models.user import User
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        alice_id = db.execute(select(User.id).where(User.username == "alice")).scalar()
    r = client.get(f"/chat/chats/{alice_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 400


def test_follow_unfollow(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    _signup_and_login(client, username="bob", email="bob@example.com")
    from sqlalchemy import select
    from app.auth.models.user import User
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        bob_id = db.execute(select(User.id).where(User.username == "bob")).scalar()

    r = client.post(f"/chat/users/{bob_id}/follow", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200

    # Duplicate follow rejected
    r = client.post(f"/chat/users/{bob_id}/follow", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 409

    # Followers list
    r = client.get(f"/chat/users/{bob_id}/followers", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200
    assert r.json()["followers_count"] == 1

    # Unfollow
    r = client.delete(f"/chat/users/{bob_id}/follow", headers={"Authorization": f"Bearer {token_a}"})
    assert r.status_code == 200


def test_chat_list_one_query_per_chat_constant(client, engine):
    """Regression: list_chats should NOT do per-chat lookups."""
    from sqlalchemy import event, select
    from app.auth.models.user import User
    from app.core.database import SessionLocal

    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    headers = {"Authorization": f"Bearer {token_a}"}

    # Create 5 other users and start a chat + a message with each.
    for i in range(5):
        _signup_and_login(client, username=f"user{i}", email=f"user{i}@example.com")
        with SessionLocal() as db:
            uid = db.execute(select(User.id).where(User.username == f"user{i}")).scalar()
        r = client.get(f"/chat/chats/{uid}", headers=headers)
        cid = r.json()["id"]
        client.post(
            f"/chat/chats/{cid}/messages",
            json={"content": f"hello {i}"},
            headers=headers,
        )

    queries: list[str] = []

    def _capture(conn, cursor, statement, parameters, context, executemany):
        if statement.strip().upper().startswith(("BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE")):
            return
        queries.append(statement)

    event.listen(engine, "before_cursor_execute", _capture)
    try:
        r = client.get("/chat/chats", headers=headers)
    finally:
        event.remove(engine, "before_cursor_execute", _capture)

    assert r.status_code == 200
    assert len(r.json()["chats"]) == 5
    # Constant: auth + count + chats + bulk users + bulk last-message + bulk unread
    assert len(queries) < 12, f"chat list issued {len(queries)} queries — N+1 regression?"
