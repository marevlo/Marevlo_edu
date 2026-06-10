"""Profile + stats tests."""
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


def test_get_profile_creates_lazily(client):
    token = _signup_and_login(client)
    r = client.get("/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["xp"] == 0
    assert body["bio"] is None


def test_update_profile(client):
    token = _signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    r = client.put(
        "/profile/me",
        json={"bio": "Hello", "location": "Bengaluru", "name": "Alice"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["bio"] == "Hello"
    assert r.json()["location"] == "Bengaluru"
    assert r.json()["name"] == "Alice"


def test_profile_complete_badge_awarded(client):
    token = _signup_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    client.put(
        "/profile/me",
        json={"bio": "Hello", "location": "Bengaluru"},
        headers=headers,
    )

    r = client.get("/profile/achievements", headers=headers)
    assert r.status_code == 200
    badges = {b["badge_key"] for b in r.json()}
    assert "profile_complete" in badges


def test_stats_for_zero_activity_user(client):
    token = _signup_and_login(client)
    r = client.get("/profile/stats", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    s = r.json()
    assert s["xp"] == 0
    assert s["level"] == 1
    assert s["problems_solved"] == 0
    # Logging in itself records a daily 'login' activity, so the user has a
    # 1-day streak immediately after signup. This is the intended behaviour:
    # the streak measures active days, and "you logged in today" counts.
    assert s["streak"] == 1
