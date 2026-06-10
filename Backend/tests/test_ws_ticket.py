"""WebSocket ticket flow tests."""


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    r = client.post("/auth/login", data={"username": email, "password": "Password1"})
    return r.json()["access_token"]


def test_ws_ticket_requires_auth(client):
    r = client.post("/auth/ws-ticket")
    assert r.status_code == 401


def test_ws_ticket_issued_for_authenticated_user(client):
    token = _signup_and_login(client)
    r = client.post("/auth/ws-ticket", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert "ticket" in body
    assert len(body["ticket"]) >= 32  # random URL-safe ≥ 32 chars
    assert body["expires_in"] == 60


def test_ws_ticket_is_one_shot(client):
    """A consumed ticket cannot be reused."""
    from app.auth.services.ws_ticket import ws_ticket_service

    token = _signup_and_login(client)
    r = client.post("/auth/ws-ticket", headers={"Authorization": f"Bearer {token}"})
    ticket = r.json()["ticket"]

    # First consume succeeds.
    user_id = ws_ticket_service.consume(ticket)
    assert user_id is not None

    # Second consume must return None — single-use enforced.
    user_id2 = ws_ticket_service.consume(ticket)
    assert user_id2 is None


def test_ws_ticket_unknown_returns_none(client):
    """Random tickets that were never issued must not authenticate."""
    from app.auth.services.ws_ticket import ws_ticket_service

    assert ws_ticket_service.consume("not-a-real-ticket-abc123") is None
    assert ws_ticket_service.consume("") is None


def test_ws_ticket_returns_correct_user(client):
    """The ticket must map to the issuing user, not whoever else."""
    from app.auth.services.ws_ticket import ws_ticket_service
    from app.auth.models.user import User
    from app.core.database import SessionLocal

    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")

    ticket_a = client.post(
        "/auth/ws-ticket", headers={"Authorization": f"Bearer {token_a}"}
    ).json()["ticket"]
    ticket_b = client.post(
        "/auth/ws-ticket", headers={"Authorization": f"Bearer {token_b}"}
    ).json()["ticket"]

    with SessionLocal() as db:
        alice_id = db.query(User).filter_by(username="alice").first().id
        bob_id = db.query(User).filter_by(username="bob").first().id

    assert ws_ticket_service.consume(ticket_a) == alice_id
    assert ws_ticket_service.consume(ticket_b) == bob_id
