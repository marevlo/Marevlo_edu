"""MaxBodySizeMiddleware: reject oversized bodies before they hit handlers."""


def _signup_and_login(client):
    client.post(
        "/auth/signup",
        json={"username": "alice", "email": "alice@example.com", "password": "Password1"},
    )
    return client.post(
        "/auth/login", data={"username": "alice@example.com", "password": "Password1"}
    ).json()["access_token"]


def test_normal_body_passes_through(client):
    """Sanity: a tiny JSON body works."""
    token = _signup_and_login(client)
    r = client.post(
        "/feed/posts",
        headers={"Authorization": f"Bearer {token}"},
        json={"content": "hi", "type": "post"},
    )
    assert r.status_code == 200


def test_oversized_body_rejected_via_content_length(client):
    """Client-declared Content-Length over the cap → 413, body never read."""
    token = _signup_and_login(client)
    # Pad up to 11 MB (cap is 10 MB).
    huge = "x" * (11 * 1024 * 1024)
    r = client.post(
        "/feed/posts",
        headers={"Authorization": f"Bearer {token}"},
        json={"content": huge, "type": "post"},
    )
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "payload_too_large"