"""Course reactions and comments."""
def _signup_and_login(client, *, username, email):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    r = client.post("/auth/login", data={"username": email, "password": "Password1"})
    return r.json()["access_token"]


def test_react_toggle_off_and_switch(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    # Like
    r = client.post("/courses/m01/react", json={"type": "like"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["likes"] == 1
    assert body["dislikes"] == 0
    assert body["my_reaction"] == "like"

    # Same vote → toggle off
    r = client.post("/courses/m01/react", json={"type": "like"}, headers=headers)
    assert r.json()["likes"] == 0
    assert r.json()["my_reaction"] is None

    # Dislike
    r = client.post("/courses/m01/react", json={"type": "dislike"}, headers=headers)
    assert r.json()["dislikes"] == 1

    # Switch to like
    r = client.post("/courses/m01/react", json={"type": "like"}, headers=headers)
    assert r.json()["likes"] == 1
    assert r.json()["dislikes"] == 0


def test_comments_lifecycle(client):
    token = _signup_and_login(client, username="alice", email="alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/courses/m01/comments", json={"content": "Great lesson!"}, headers=headers)
    assert r.status_code == 201
    cid = r.json()["id"]

    r = client.get("/courses/m01/comments")
    assert r.status_code == 200
    assert len(r.json()["comments"]) == 1

    # Delete by author
    r = client.delete(f"/courses/m01/comments/{cid}", headers=headers)
    assert r.status_code == 204


def test_comment_cannot_be_deleted_by_other_user(client):
    token_a = _signup_and_login(client, username="alice", email="alice@example.com")
    token_b = _signup_and_login(client, username="bob", email="bob@example.com")

    r = client.post(
        "/courses/m01/comments",
        json={"content": "Mine"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    cid = r.json()["id"]

    r = client.delete(
        f"/courses/m01/comments/{cid}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 403
