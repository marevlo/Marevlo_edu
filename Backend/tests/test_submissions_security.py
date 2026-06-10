"""
Critical security tests for the submission endpoints.

These verify the auth holes from the original codebase have been closed:
- /submissions/run requires auth
- /submissions/submit requires auth
- user_id is taken from the authenticated session, NOT from request body
"""
from unittest.mock import patch


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


def test_run_endpoint_requires_authentication(client):
    """The OLD bug: /execute/run accepted user_id from body, no auth."""
    r = client.post(
        "/submissions/run",
        json={"language": "python", "code": "print('hi')"},
    )
    assert r.status_code == 401


def test_submit_endpoint_requires_authentication(client):
    r = client.post(
        "/submissions/submit",
        json={"problem_id": 1, "language": "python", "code": "x = 1"},
    )
    assert r.status_code == 401


def test_submit_uses_authenticated_user_not_body(client, db_session):
    """Even if a malicious client sends user_id in the body, the recorded
    submission must belong to the authenticated user."""
    # Create two users; 'alice' is the attacker, 'victim' is the target.
    token_alice = _signup_and_login(client, username="alice", email="alice@example.com")
    client.post(
        "/auth/signup",
        json={"username": "victim", "email": "victim@example.com", "password": "Password1"},
    )

    # Add a problem to submit against with at least one test case.
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Two Sum", description="Sum two numbers.", difficulty="Easy")
        db.add(p)
        db.commit()
        db.refresh(p)
        problem_id = p.id
        
        # Add a test case
        tc = ProblemTestCase(problem_id=problem_id, input="1 2", expected_output="3")
        db.add(tc)
        db.commit()
        
        from app.auth.models.user import User
        victim = db.query(User).filter_by(username="victim").first()
        victim_id = victim.id

    # Mock the runner so we don't need a real one.
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        mock_run.return_value = {"stdout": "3", "stderr": "", "exit_code": 0, "runtime_ms": 5, "memory_kb": 0}

        # Alice tries to claim user_id=victim_id in the body. Should be ignored.
        r = client.post(
            "/submissions/submit",
            json={
                "problem_id": problem_id,
                "language": "python",
                "code": "print('3')",
                "user_id": victim_id,  # ← attempted impersonation
            },
            headers={"Authorization": f"Bearer {token_alice}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()

    # The recorded submission must be Alice's, not the victim's.
    from app.auth.models.user import User
    from app.submissions.models.submission import ProblemSubmission
    with SessionLocal() as db:
        alice = db.query(User).filter_by(username="alice").first()
        sub = db.query(ProblemSubmission).filter_by(id=body["id"]).first()
        assert sub.user_id == alice.id
        assert sub.user_id != victim_id


def test_run_with_auth_returns_runner_output(client):
    token = _signup_and_login(client)
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        mock_run.return_value = {"stdout": "hello\n", "stderr": "", "exit_code": 0, "runtime_ms": 10, "memory_kb": 0}
        r = client.post(
            "/submissions/run",
            json={"language": "python", "code": "print('hello')"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 200
    assert r.json()["stdout"] == "hello\n"
    assert r.json()["exit_code"] == 0


# ── Comprehensive judge tests ──────────────────────────────────────────────

def test_submit_accepted_all_testcases_pass(client):
    """Test accepted verdict when all testcases match expected output."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Sum", description="Sum two.", difficulty="Easy", time_limit_s=2.0, memory_limit_mb=256)
        db.add(p)
        db.commit()
        db.refresh(p)
        
        tc1 = ProblemTestCase(problem_id=p.id, input="1 2", expected_output="3")
        tc2 = ProblemTestCase(problem_id=p.id, input="5 10", expected_output="15")
        db.add_all([tc1, tc2])
        db.commit()
        problem_id = p.id
    
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        # Both testcases pass
        mock_run.side_effect = [
            {"stdout": "3", "stderr": "", "exit_code": 0, "runtime_ms": 5, "memory_kb": 0},
            {"stdout": "15", "stderr": "", "exit_code": 0, "runtime_ms": 5, "memory_kb": 0},
        ]
        
        r = client.post(
            "/submissions/submit",
            json={"problem_id": problem_id, "language": "python", "code": "a,b=map(int,input().split());print(a+b)"},
            headers={"Authorization": f"Bearer {token}"},
        )
    
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "accepted"
    assert body["test_cases_passed"] == 2
    assert body["total_test_cases"] == 2


def test_submit_wrong_answer(client):
    """Test wrong_answer verdict when output doesn't match."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Double", description="Double the number.", difficulty="Easy", time_limit_s=2.0, memory_limit_mb=256)
        db.add(p)
        db.commit()
        db.refresh(p)
        
        tc = ProblemTestCase(problem_id=p.id, input="5", expected_output="10")
        db.add(tc)
        db.commit()
        problem_id = p.id
    
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        # Wrong output
        mock_run.return_value = {"stdout": "5", "stderr": "", "exit_code": 0, "runtime_ms": 5, "memory_kb": 0}
        
        r = client.post(
            "/submissions/submit",
            json={"problem_id": problem_id, "language": "python", "code": "print(int(input()))"},
            headers={"Authorization": f"Bearer {token}"},
        )
    
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "wrong_answer"
    assert body["test_cases_passed"] == 0
    assert body["total_test_cases"] == 1


def test_submit_time_limit_exceeded(client):
    """Test time_limit_exceeded when runner returns exit_code -1."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Slow", description="Slow code.", difficulty="Easy", time_limit_s=1.0, memory_limit_mb=256)
        db.add(p)
        db.commit()
        db.refresh(p)
        
        tc = ProblemTestCase(problem_id=p.id, input="1", expected_output="done")
        db.add(tc)
        db.commit()
        problem_id = p.id
    
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        # Timeout: exit_code -1, runtime > limit
        mock_run.return_value = {"stdout": "", "stderr": "Timed out after 2s", "exit_code": -1, "runtime_ms": 2500, "memory_kb": 0}
        
        r = client.post(
            "/submissions/submit",
            json={"problem_id": problem_id, "language": "python", "code": "while True: pass"},
            headers={"Authorization": f"Bearer {token}"},
        )
    
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "time_limit_exceeded"
    assert body["test_cases_passed"] == 0


def test_submit_memory_limit_exceeded(client):
    """Test memory_limit_exceeded when memory exceeds limit."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Memory", description="Memory hog.", difficulty="Easy", time_limit_s=2.0, memory_limit_mb=100)
        db.add(p)
        db.commit()
        db.refresh(p)
        
        tc = ProblemTestCase(problem_id=p.id, input="", expected_output="done")
        db.add(tc)
        db.commit()
        problem_id = p.id
    
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        # Exceeds memory limit
        mock_run.return_value = {"stdout": "", "stderr": "Memory limit exceeded", "exit_code": 1, "runtime_ms": 50, "memory_kb": 120000}
        
        r = client.post(
            "/submissions/submit",
            json={"problem_id": problem_id, "language": "python", "code": "x = [0] * 1000000"},
            headers={"Authorization": f"Bearer {token}"},
        )
    
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "memory_limit_exceeded"


def test_submit_compile_error(client):
    """Test compile_error for C++ compilation failures."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Compile", description="Bad syntax.", difficulty="Easy", time_limit_s=2.0, memory_limit_mb=256)
        db.add(p)
        db.commit()
        db.refresh(p)
        
        tc = ProblemTestCase(problem_id=p.id, input="1", expected_output="ok")
        db.add(tc)
        db.commit()
        problem_id = p.id
    
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        # Compile error
        mock_run.return_value = {"stdout": "", "stderr": "error: expected ';' before '}'", "exit_code": 1, "runtime_ms": 10, "memory_kb": 0}
        
        r = client.post(
            "/submissions/submit",
            json={"problem_id": problem_id, "language": "cpp", "code": "int main() { }"},
            headers={"Authorization": f"Bearer {token}"},
        )
    
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "compile_error"


def test_submit_runtime_error(client):
    """Test runtime_error for non-zero exit codes (non-compile)."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem, ProblemTestCase
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="Runtime", description="Bad logic.", difficulty="Easy", time_limit_s=2.0, memory_limit_mb=256)
        db.add(p)
        db.commit()
        db.refresh(p)
        
        tc = ProblemTestCase(problem_id=p.id, input="1", expected_output="ok")
        db.add(tc)
        db.commit()
        problem_id = p.id
    
    with patch("app.submissions.services.submission_service.runner_client.run") as mock_run:
        # Runtime error (not a compile error)
        mock_run.return_value = {"stdout": "", "stderr": "Traceback (most recent call last):\n  ZeroDivisionError: division by zero", "exit_code": 1, "runtime_ms": 10, "memory_kb": 0}
        
        r = client.post(
            "/submissions/submit",
            json={"problem_id": problem_id, "language": "python", "code": "x = 1 / 0"},
            headers={"Authorization": f"Bearer {token}"},
        )
    
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "runtime_error"


def test_submit_no_testcases_fails(client):
    """Test that submission fails when problem has no testcases."""
    token = _signup_and_login(client)
    
    from app.problems.models.problem import Problem
    from app.core.database import SessionLocal
    with SessionLocal() as db:
        p = Problem(title="NoTests", description="No testcases.", difficulty="Easy")
        db.add(p)
        db.commit()
        problem_id = p.id
    
    r = client.post(
        "/submissions/submit",
        json={"problem_id": problem_id, "language": "python", "code": "print('hi')"},
        headers={"Authorization": f"Bearer {token}"},
    )
    
    assert r.status_code in [400, 422]  # ValidationError
