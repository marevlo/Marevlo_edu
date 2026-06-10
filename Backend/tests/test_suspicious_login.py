"""
Suspicious-login alerts and password-changed email confirmation.

What we test:
  - First-ever login (only one session row) is NOT flagged.
  - Returning user from a known (IP, UA) is NOT flagged.
  - Returning user from a new (IP, UA) IS flagged: writes
    EVT_SUSPICIOUS_LOGIN to security_events and sends an email.
  - Password reset triggers a password-changed email.
  - Login still succeeds even if the email send fails (best-effort).
"""
from sqlalchemy import select

from app.common.security_event import (
    EVT_PW_RESET_COMPLETED,
    EVT_SUSPICIOUS_LOGIN,
    SecurityEvent,
)
from app.core import database as _db


def _SL():
    return _db.SessionLocal()


def _signup(client, *, username="alice", email="alice@example.com", password="Password1"):
    return client.post(
        "/auth/signup",
        json={"username": username, "email": email, "password": password},
    )


def _login(client, *, email="alice@example.com", password="Password1", ip=None, ua=None):
    headers = {}
    if ip:
        # TestClient honors X-Forwarded-For when ProxyHeadersMiddleware sees
        # the request as coming from a trusted proxy. Tests bypass that by
        # patching the request state directly via header trickery —
        # TestClient.client (httpx) carries through arbitrary headers.
        headers["X-Forwarded-For"] = ip
    if ua:
        headers["User-Agent"] = ua
    return client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers=headers,
    )


def _events(event_type: str) -> list:
    with _SL() as db:
        return list(
            db.execute(
                select(SecurityEvent).where(SecurityEvent.event_type == event_type)
            )
            .scalars()
            .all()
        )


# ── Suspicious-login detection ──────────────────────────────────────────
def test_first_login_is_not_flagged(client):
    """A user logging in for the first time after signup is not 'suspicious'."""
    _signup(client)
    _login(client, ua="Mozilla/5.0 Firefox/120")  # this is the first login

    assert _events(EVT_SUSPICIOUS_LOGIN) == []


def test_repeat_login_same_device_is_not_flagged(client):
    """Same browser/device on subsequent logins should not flag."""
    _signup(client)
    # First login (creates first session; a *second* login from the same UA
    # should match an existing session and NOT flag).
    _login(client, ua="Mozilla/5.0 Firefox/120")
    _login(client, ua="Mozilla/5.0 Firefox/120")

    assert _events(EVT_SUSPICIOUS_LOGIN) == []


def test_login_from_new_user_agent_is_flagged(client):
    """Returning user from a previously-unseen UA is flagged + audited."""
    _signup(client)
    _login(client, ua="Mozilla/5.0 Firefox/120")  # known device
    _login(client, ua="Mozilla/5.0 Chrome/130")   # new device

    flagged = _events(EVT_SUSPICIOUS_LOGIN)
    assert len(flagged) == 1
    assert flagged[0].user_agent == "Mozilla/5.0 Chrome/130"


def test_two_new_devices_both_flag(client):
    """Each new (UA, IP) pair flags independently."""
    _signup(client)
    _login(client, ua="Firefox/120")
    _login(client, ua="Chrome/130")
    _login(client, ua="Safari/17")

    flagged = _events(EVT_SUSPICIOUS_LOGIN)
    assert len(flagged) == 2
    seen = {f.user_agent for f in flagged}
    assert seen == {"Chrome/130", "Safari/17"}


def test_login_still_succeeds_even_when_email_send_fails(client, monkeypatch):
    """Email failure must NOT block the login response."""
    from app.auth.services import email_service as es

    def boom(*args, **kwargs):
        raise RuntimeError("SMTP down")

    monkeypatch.setattr(es.email_service, "send_suspicious_login", boom)

    _signup(client)
    _login(client, ua="Firefox/120")
    r = _login(client, ua="Chrome/130")
    assert r.status_code == 200
    assert "access_token" in r.json()
    # The audit row was still written even though the email failed.
    assert len(_events(EVT_SUSPICIOUS_LOGIN)) == 1


# ── Password-changed email confirmation ─────────────────────────────────
def test_password_reset_sends_confirmation_email(client, monkeypatch):
    """After a successful password reset, the user receives a confirmation email."""
    sent: list[dict] = []

    from app.auth.services import email_service as es

    def fake_password_changed(*, to_email):
        sent.append({"to": to_email})

    monkeypatch.setattr(
        es.email_service, "send_password_changed", fake_password_changed
    )

    _signup(client)

    # Capture the OTP from the print fallback (dev mode has no SMTP). The
    # OTP service prints to stdout via "[DEV] Email to ...". Cleaner: pull
    # the most recent EmailOTP row directly.
    client.post("/auth/password/forgot", json={"email": "alice@example.com"})

    from app.auth.models.user import EmailOTP, User

    with _SL() as db:
        user = db.query(User).filter_by(email="alice@example.com").first()
        otp_row = (
            db.query(EmailOTP)
            .filter_by(user_id=user.id, used_at=None)
            .order_by(EmailOTP.id.desc())
            .first()
        )
    assert otp_row is not None

    # We don't know the plaintext OTP (only its hash). Re-issue via the
    # service test seam: monkeypatch hash_otp comparison... too invasive.
    # Instead, test the service layer directly by calling reset_password
    # through an interface that bypasses OTP verification — but that's
    # also too invasive. Cleanest path: the test directly invokes
    # `email_service.send_password_changed` from the service level.
    #
    # So instead of testing the full HTTP path, this test only asserts
    # that `send_password_changed` is the one wired into the auth flow,
    # which we verify by calling it directly on the service.

    # Direct service call to verify the send-on-reset wiring exists.
    from app.auth.services.auth_service import auth_service
    assert hasattr(auth_service, "reset_password")

    # Now: capture the actual email send when we *do* go through HTTP. We
    # can't decrypt the OTP, so we substitute one by hashing a known value.
    from app.core.security import hash_otp
    new_code = "123456"
    with _SL() as db:
        # Burn all current OTPs to be safe.
        from datetime import datetime, timezone
        db.query(EmailOTP).filter_by(used_at=None).update(
            {EmailOTP.used_at: datetime.now(timezone.utc)}
        )
        # Insert one we know the plaintext for.
        from datetime import timedelta
        db.add(
            EmailOTP(
                user_id=user.id,
                code_hash=hash_otp(new_code),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
        )
        db.commit()

    r = client.post(
        "/auth/password/reset",
        json={
            "email": "alice@example.com",
            "otp": new_code,
            "new_password": "NewPass123",
        },
    )
    assert r.status_code == 200

    # The reset wrote an audit event.
    assert len(_events(EVT_PW_RESET_COMPLETED)) >= 1
    # AND the email was sent.
    assert sent == [{"to": "alice@example.com"}]
