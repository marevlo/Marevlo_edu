"""Learning system: enrollment, lesson progress, dashboard, notes, bookmarks."""


def _signup_and_login(client, *, username="alice", email="alice@example.com"):
    client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": "Password1"},
    )
    return client.post(
        "/auth/login",
        data={"username": email, "password": "Password1"},
    ).json()["access_token"]


# ── Enrollment ──────────────────────────────────────────────────────────
def test_enroll_is_idempotent(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    r1 = client.post("/learning/enrollments/recsys", headers=H)
    assert r1.status_code == 200
    eid = r1.json()["id"]
    assert r1.json()["course_id"] == "recsys"
    assert r1.json()["source"] == "free"

    # Same call again — same enrollment id, no new row.
    r2 = client.post("/learning/enrollments/recsys", headers=H)
    assert r2.status_code == 200
    assert r2.json()["id"] == eid


def test_list_enrollments(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}
    client.post("/learning/enrollments/recsys", headers=H)
    client.post("/learning/enrollments/dsa", headers=H)

    r = client.get("/learning/enrollments", headers=H)
    assert r.status_code == 200
    course_ids = sorted(e["course_id"] for e in r.json()["enrollments"])
    assert course_ids == ["dsa", "recsys"]


def test_enroll_requires_auth(client):
    r = client.post("/learning/enrollments/recsys")
    assert r.status_code == 401


# ── Progress ────────────────────────────────────────────────────────────
def test_progress_creates_and_auto_enrolls(client):
    """First progress update on a lesson creates the row AND enrolls the user."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    # User has no enrollment yet.
    assert client.get("/learning/enrollments", headers=H).json()["enrollments"] == []

    r = client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "last_position": "20"},
        headers=H,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["lesson_id"] == "recsys.m01.l01"
    assert body["course_id"] == "recsys"
    assert body["status"] == "in_progress"
    assert body["last_position"] == "20"

    # Auto-enrollment happened.
    enrollments = client.get("/learning/enrollments", headers=H).json()["enrollments"]
    assert any(e["course_id"] == "recsys" for e in enrollments)


def test_progress_resume_position_persists(client):
    """Updating last_position persists across calls (resume-from-where-you-left-off)."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "last_position": "30"},
        headers=H,
    )
    client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "last_position": "65"},
        headers=H,
    )

    r = client.get("/learning/progress/recsys.m01.l01", headers=H)
    assert r.status_code == 200
    assert r.json()["last_position"] == "65"


def test_progress_completion_is_one_way(client):
    """Once a lesson is completed, sending in_progress doesn't unset it."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "status": "completed"},
        headers=H,
    )
    r = client.get("/learning/progress/recsys.m01.l01", headers=H)
    assert r.json()["status"] == "completed"
    completed_at_first = r.json()["completed_at"]
    assert completed_at_first is not None

    # Try to revert to in_progress.
    client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "status": "in_progress"},
        headers=H,
    )
    r = client.get("/learning/progress/recsys.m01.l01", headers=H)
    # Stays completed.
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"] == completed_at_first  # unchanged


def test_progress_time_delta_is_capped(client):
    """A single update can't add more than MAX_TIME_DELTA_SECONDS (600)."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "time_delta_seconds": 3600},  # 1h
        headers=H,
    )
    assert r.status_code == 200
    # Server caps at 600.
    assert r.json()["time_spent_seconds"] == 600


def test_progress_rejects_course_mismatch(client):
    """A lesson belongs to one course; the client must not switch courses on it."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys"},
        headers=H,
    )

    r = client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "dsa"},  # wrong course for this lesson
        headers=H,
    )
    assert r.status_code == 400
    assert "recsys" in r.text.lower()


def test_progress_for_course(client):
    """Listing progress for a course returns only that course's lessons."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    client.put("/learning/progress/recsys.m01.l01", json={"course_id": "recsys"}, headers=H)
    client.put("/learning/progress/recsys.m01.l02", json={"course_id": "recsys"}, headers=H)
    client.put("/learning/progress/dsa.m01.l01", json={"course_id": "dsa"}, headers=H)

    r = client.get("/learning/courses/recsys/progress", headers=H)
    assert r.status_code == 200
    lesson_ids = {l["lesson_id"] for l in r.json()["lessons"]}
    assert lesson_ids == {"recsys.m01.l01", "recsys.m01.l02"}


# ── Dashboard ───────────────────────────────────────────────────────────
def test_dashboard_aggregates_per_course(client):
    """Dashboard shows per-course totals + 'continue learning' resume row."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    # 2 lessons in recsys: 1 completed, 1 in_progress
    client.put(
        "/learning/progress/recsys.m01.l01",
        json={"course_id": "recsys", "status": "completed", "time_delta_seconds": 300},
        headers=H,
    )
    client.put(
        "/learning/progress/recsys.m01.l02",
        json={"course_id": "recsys", "last_position": "40", "time_delta_seconds": 120},
        headers=H,
    )
    # 1 in dsa
    client.put(
        "/learning/progress/dsa.m01.l01",
        json={"course_id": "dsa", "last_position": "10"},
        headers=H,
    )

    r = client.get("/learning/dashboard", headers=H)
    assert r.status_code == 200
    body = r.json()

    # Two courses surfaced.
    courses = {c["course_id"]: c for c in body["courses"]}
    assert "recsys" in courses
    assert "dsa" in courses

    rec = courses["recsys"]
    assert rec["lessons_completed"] == 1
    assert rec["lessons_total_in_progress"] == 2
    assert rec["total_time_seconds"] == 420
    assert rec["enrolled"] is True

    # Resume should point at the most recently accessed in_progress lesson.
    assert body["resume"] is not None
    # dsa.m01.l01 was the last touch.
    assert body["resume"]["lesson_id"] == "dsa.m01.l01"
    assert body["resume"]["last_position"] == "10"


def test_dashboard_empty_for_new_user(client):
    """A user with no progress sees an empty dashboard, not a 500."""
    token = _signup_and_login(client)
    r = client.get("/learning/dashboard", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["courses"] == []
    assert body["resume"] is None


def test_dashboard_query_budget(client, query_counter):
    """Dashboard MUST be a constant number of queries regardless of lessons touched."""
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    # Touch 20 lessons across 3 courses.
    for i in range(8):
        client.put(
            f"/learning/progress/recsys.m01.l{i:02d}",
            json={"course_id": "recsys"},
            headers=H,
        )
    for i in range(8):
        client.put(
            f"/learning/progress/dsa.m01.l{i:02d}",
            json={"course_id": "dsa"},
            headers=H,
        )
    for i in range(4):
        client.put(
            f"/learning/progress/research.p{i:02d}",
            json={"course_id": "research"},
            headers=H,
        )

    with query_counter() as count:
        r = client.get("/learning/dashboard", headers=H)
    assert r.status_code == 200
    # Expected: auth user + 4 dashboard queries (aggregate, resume, enrollments,
    # last-per-course) = ~5. Budget < 8.
    assert count.value < 8, (
        f"dashboard issued {count.value} queries with 20 lessons / 3 courses — N+1?"
    )


# ── Notes ───────────────────────────────────────────────────────────────
def test_notes_upsert_and_get(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    r = client.put(
        "/learning/notes/recsys.m01.l01",
        json={"course_id": "recsys", "content": "Embeddings are the core idea."},
        headers=H,
    )
    assert r.status_code == 200
    assert r.json()["content"] == "Embeddings are the core idea."

    # Update overwrites — no version history.
    r = client.put(
        "/learning/notes/recsys.m01.l01",
        json={"course_id": "recsys", "content": "Updated."},
        headers=H,
    )
    assert r.status_code == 200

    r = client.get("/learning/notes/recsys.m01.l01", headers=H)
    assert r.json()["content"] == "Updated."


def test_notes_filter_by_course(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}
    client.put(
        "/learning/notes/recsys.m01.l01",
        json={"course_id": "recsys", "content": "a"},
        headers=H,
    )
    client.put(
        "/learning/notes/dsa.m01.l01",
        json={"course_id": "dsa", "content": "b"},
        headers=H,
    )

    r = client.get("/learning/notes?course_id=recsys", headers=H)
    assert len(r.json()["notes"]) == 1
    assert r.json()["notes"][0]["course_id"] == "recsys"


def test_notes_delete(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}
    client.put(
        "/learning/notes/recsys.m01.l01",
        json={"course_id": "recsys", "content": "to delete"},
        headers=H,
    )
    r = client.delete("/learning/notes/recsys.m01.l01", headers=H)
    assert r.status_code == 200
    r = client.get("/learning/notes/recsys.m01.l01", headers=H)
    assert r.status_code == 404


# ── Bookmarks ───────────────────────────────────────────────────────────
def test_bookmark_add_and_remove(client):
    token = _signup_and_login(client)
    H = {"Authorization": f"Bearer {token}"}

    r = client.post(
        "/learning/bookmarks/recsys.m01.l03",
        json={"course_id": "recsys", "caption": "review later"},
        headers=H,
    )
    assert r.status_code == 200
    assert r.json()["caption"] == "review later"

    # Adding again is idempotent (same id).
    bid = r.json()["id"]
    r2 = client.post(
        "/learning/bookmarks/recsys.m01.l03",
        json={"course_id": "recsys", "caption": "re-marked"},
        headers=H,
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == bid
    # Caption updated though.
    assert r2.json()["caption"] == "re-marked"

    # Remove works.
    r = client.delete("/learning/bookmarks/recsys.m01.l03", headers=H)
    assert r.status_code == 200
    # Listing now empty for this course.
    r = client.get("/learning/bookmarks?course_id=recsys", headers=H)
    assert r.json()["bookmarks"] == []


def test_bookmarks_isolated_per_user(client):
    token_a = _signup_and_login(client, username="alice", email="a@example.com")
    token_b = _signup_and_login(client, username="bobby", email="b@example.com")
    HA = {"Authorization": f"Bearer {token_a}"}
    HB = {"Authorization": f"Bearer {token_b}"}

    client.post(
        "/learning/bookmarks/recsys.m01.l01",
        json={"course_id": "recsys"},
        headers=HA,
    )
    # B sees nothing.
    r = client.get("/learning/bookmarks", headers=HB)
    assert r.json()["bookmarks"] == []
