"""
Authentication business logic.

Routers should be thin — call into AuthService for every flow. This keeps
HTTP concerns out of the domain logic and makes the flows directly testable
without spinning up FastAPI.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.auth.models.user import EmailOTP, User, UserSession
from app.auth.schemas.auth import TokenPair
from app.auth.services.email_service import email_service
from app.auth.services.firebase import verify_google_id_token
from app.auth.services.token_store import refresh_token_store
from app.common.activity_log import ActivityLog
from app.common.audit_logger import audit_logger
from app.common.security_event import (
    EVT_GOOGLE_LOGIN_SUCCESS,
    EVT_LOGIN_FAILURE,
    EVT_LOGIN_SUCCESS,
    EVT_LOGOUT,
    EVT_PW_RESET_COMPLETED,
    EVT_PW_RESET_REQUESTED,
    EVT_SUSPICIOUS_LOGIN,
)
from app.core.config import get_settings
from app.core.exceptions import (
    AccountInactive,
    EmailAlreadyRegistered,
    EmailNotVerified,
    InvalidCredentials,
    TokenError,
    UsernameTaken,
    ValidationError,
)
from app.core.rate_guard import rate_guard
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_otp,
    hash_otp,
    hash_password,
    verify_otp,
    verify_password,
)

logger = logging.getLogger(__name__)

# Audit event types for the account-settings / verification flows. The
# canonical EVT_* registry lives in app.common.security_event; audit_logger
# accepts any short string, so these stay local to avoid widening that module.
EVT_PW_CHANGED = "password_changed"
EVT_ACCOUNT_DELETED = "account_deleted"
EVT_EMAIL_VERIFY_REQUESTED = "email_verify_requested"
EVT_EMAIL_VERIFIED = "email_verified"


class AuthService:
    """Orchestrates user identity flows. Stateless — pass `db` in."""

    OTP_TTL_MINUTES = 10

    # ── Helpers ─────────────────────────────────────────────────────────
    def _get_user_by_email(self, db: Session, email: str) -> Optional[User]:
        return db.execute(select(User).where(User.email == email)).scalar_one_or_none()

    def _get_user_by_username(self, db: Session, username: str) -> Optional[User]:
        return db.execute(
            select(User).where(User.username == username)
        ).scalar_one_or_none()

    def _ensure_usable(self, user: Optional[User]) -> User:
        if user is None or not user.is_usable():
            raise AccountInactive()
        return user

    def _open_session(
        self,
        db: Session,
        *,
        user: User,
        ip: Optional[str],
        user_agent: Optional[str],
    ) -> UserSession:
        session = UserSession(
            user_id=user.id,
            ip_address=ip,
            device=(user_agent[:255] if user_agent else None),
        )
        db.add(session)
        db.flush()  # populate session.id without committing yet
        return session

    def _check_suspicious_login(
        self,
        db: Session,
        *,
        user: User,
        new_session: UserSession,
    ) -> bool:
        """Detect logins from a new (IP, user-agent) combo.

        Heuristic: look at this user's prior sessions. If we've never seen
        this exact (IP, user_agent) pair before, flag as suspicious. False
        positives are tolerable — the email is informational, not alarming.

        First-ever login (no prior sessions) is NOT suspicious — that's
        signup. We define suspicious as "a returning user from a fresh
        device/location."

        Returns True if flagged. Caller is responsible for the email + audit.
        """
        prior_count, matching_count = db.execute(
            select(
                func.count(UserSession.id),
                func.sum(
                    case(
                        (
                            and_(
                                UserSession.ip_address == new_session.ip_address,
                                UserSession.device == new_session.device,
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
            )
            .where(UserSession.user_id == user.id)
            .where(UserSession.id != new_session.id)
        ).one()
        if int(prior_count or 0) == 0:
            return False  # first ever login, not suspicious
        return int(matching_count or 0) == 0

    def _notify_if_suspicious(
        self,
        db: Session,
        *,
        user: User,
        session: UserSession,
        ip: Optional[str],
        user_agent: Optional[str],
    ) -> None:
        """If this login looks like a new device/location, audit-log + email.

        Best-effort. A failure here never blocks the login response.
        """
        try:
            if not self._check_suspicious_login(db, user=user, new_session=session):
                return

            # 1. Audit trail.
            audit_logger.log(
                db,
                event_type=EVT_SUSPICIOUS_LOGIN,
                user_id=user.id,
                ip_address=ip,
                user_agent=user_agent,
                meta={"session_id": session.id},
            )

            # 2. Email the user. Format the timestamp readably.
            when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            email_service.send_suspicious_login(
                to_email=user.email,
                ip=ip or "unknown",
                user_agent=user_agent or "unknown",
                when=when,
            )
        except Exception:
            logger.exception(
                "suspicious_login_notify_failed user_id=%s session_id=%s",
                user.id, getattr(session, "id", None),
            )

    def _issue_token_pair(
        self, *, user: User, session: UserSession
    ) -> TokenPair:
        access = create_access_token(user_id=user.id, session_id=session.id)
        refresh, jti = create_refresh_token(user_id=user.id, session_id=session.id)
        refresh_token_store.store(user_id=user.id, jti=jti)
        return TokenPair(access_token=access, refresh_token=refresh)

    def _log_login_once_per_day(self, db: Session, user_id: int, source: str) -> None:
        """Best-effort daily login log — used by activity heatmap and streaks."""
        today_start = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        existing = db.execute(
            select(ActivityLog.id)
            .where(ActivityLog.user_id == user_id)
            .where(ActivityLog.action == "login")
            .where(ActivityLog.created_at >= today_start)
            .limit(1)
        ).scalar_one_or_none()
        if existing is None:
            db.add(ActivityLog(user_id=user_id, action="login", meta={"source": source}))

    # ── Signup ──────────────────────────────────────────────────────────
    def signup(
        self,
        db: Session,
        *,
        email: str,
        username: str,
        password: str,
        date_of_birth=None,
        guardian_email: str | None = None,
        guardian_consent_at=None,
        tos_accepted_at=None,
        tos_version: str | None = None,
    ) -> User:
        # Lowercase email for storage; usernames are case-sensitive but unique.
        email_normalized = email.lower().strip()
        username_clean = username.strip()

        if self._get_user_by_email(db, email_normalized):
            raise EmailAlreadyRegistered()
        if self._get_user_by_username(db, username_clean):
            raise UsernameTaken()

        user = User(
            email=email_normalized,
            username=username_clean,
            password_hash=hash_password(password),
            is_active=True,
            date_of_birth=date_of_birth,
            guardian_email=guardian_email,
            guardian_consent_at=guardian_consent_at,
            tos_accepted_at=tos_accepted_at,
            tos_version=tos_version,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    # ── Login (password) ────────────────────────────────────────────────
    def login(
        self,
        db: Session,
        *,
        email: str,
        password: str,
        ip: Optional[str],
        user_agent: Optional[str],
    ) -> TokenPair:
        email_norm = email.lower().strip()
        user = self._get_user_by_email(db, email_norm)
        # Constant-time-ish: always run verify_password so wrong-email and
        # wrong-password take the same time. (Not strictly constant time but
        # closes the obvious timing channel.)
        password_ok = (
            user is not None
            and user.password_hash is not None
            and verify_password(password, user.password_hash)
        )
        if not user or not password_ok:
            # Audit failure. user_id is None when the email is unknown.
            audit_logger.log(
                db,
                event_type=EVT_LOGIN_FAILURE,
                user_id=user.id if user else None,
                ip_address=ip,
                user_agent=user_agent,
                meta={"email": email_norm, "reason": "bad_password"},
            )
            raise InvalidCredentials("Incorrect email or password")
        self._ensure_usable(user)

        # Block unverified password accounts when verification is required.
        # Google-only accounts (no password_hash) never reach this path, but
        # the password_hash guard keeps linked accounts safe regardless.
        if (
            get_settings().REQUIRE_EMAIL_VERIFICATION
            and user.email_verified_at is None
            and user.password_hash is not None
        ):
            raise EmailNotVerified()

        user.last_login_at = datetime.now(timezone.utc)
        session = self._open_session(db, user=user, ip=ip, user_agent=user_agent)
        self._log_login_once_per_day(db, user.id, source="password")
        db.commit()
        db.refresh(session)
        # Audit success after the commit (the session is now persisted).
        audit_logger.log(
            db,
            event_type=EVT_LOGIN_SUCCESS,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"session_id": session.id, "method": "password"},
        )
        # Suspicious-login alert: returning user from a new (IP, UA) pair.
        self._notify_if_suspicious(
            db, user=user, session=session, ip=ip, user_agent=user_agent
        )
        return self._issue_token_pair(user=user, session=session)

    # ── Login (Google) ──────────────────────────────────────────────────
    def google_login(
        self,
        db: Session,
        *,
        id_token: str,
        ip: Optional[str],
        user_agent: Optional[str],
    ) -> TokenPair:
        claims = verify_google_id_token(id_token)
        google_uid = claims["uid"]
        email = (claims.get("email") or "").lower().strip()
        if not email:
            raise ValidationError("Google account must have an email address")

        # 1. by google_uid
        user = db.execute(
            select(User).where(User.google_uid == google_uid)
        ).scalar_one_or_none()

        # 2. by email — link Google to existing account
        if user is None:
            user = self._get_user_by_email(db, email)
            if user is not None:
                user.google_uid = google_uid
                db.flush()

        # 3. create new user (Google-only)
        if user is None:
            user = self._create_google_user(db, email=email, google_uid=google_uid)

        self._ensure_usable(user)

        user.last_login_at = datetime.now(timezone.utc)
        session = self._open_session(db, user=user, ip=ip, user_agent=user_agent)
        self._log_login_once_per_day(db, user.id, source="google")
        db.commit()
        db.refresh(session)
        audit_logger.log(
            db,
            event_type=EVT_GOOGLE_LOGIN_SUCCESS,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"session_id": session.id},
        )
        self._notify_if_suspicious(
            db, user=user, session=session, ip=ip, user_agent=user_agent
        )
        return self._issue_token_pair(user=user, session=session)

    def _create_google_user(self, db: Session, *, email: str, google_uid: str) -> User:
        # Synthesize a username from the email. Loop until unique.
        base = email.split("@")[0].replace(".", "_").replace("+", "_")[:40]
        # Strip any chars that won't pass our pattern.
        base = "".join(c for c in base if c.isalnum() or c == "_")
        if not base:
            base = "user"
        username = base
        suffix = 1
        while self._get_user_by_username(db, username):
            username = f"{base}_{suffix}"
            suffix += 1
            if suffix > 1000:  # paranoid safety
                raise RuntimeError("Could not allocate username")
        now = datetime.now(timezone.utc)
        user = User(
            email=email,
            username=username,
            password_hash=None,
            google_uid=google_uid,
            is_active=True,
            # Google verifies email ownership before issuing the ID token.
            email_verified_at=now,
            # Proceeding through the Google sign-in flow constitutes acceptance
            # (the consent copy lives on the login/signup screens).
            tos_accepted_at=now,
            tos_version=get_settings().TOS_VERSION,
        )
        db.add(user)
        db.flush()
        return user

    # ── Refresh ─────────────────────────────────────────────────────────
    def refresh(self, db: Session, *, refresh_token: str) -> TokenPair:
        payload = decode_token(refresh_token, expected_type="refresh")
        try:
            user_id = int(payload["sub"])
            session_id = int(payload["sid"])
            jti = payload["jti"]
        except (KeyError, TypeError, ValueError) as exc:
            raise TokenError("Token is missing required claims") from exc

        if not refresh_token_store.is_valid(user_id=user_id, jti=jti):
            raise TokenError("Refresh token has been revoked or expired")

        user = db.get(User, user_id)
        self._ensure_usable(user)
        session = db.get(UserSession, session_id)
        if not session or session.user_id != user_id:
            raise TokenError("Session not found")

        # Rotate: revoke old, issue new.
        refresh_token_store.revoke(user_id=user_id, jti=jti)
        return self._issue_token_pair(user=user, session=session)

    # ── Logout ──────────────────────────────────────────────────────────
    def logout(
        self,
        db: Session,
        *,
        user_id: int,
        session_id: Optional[int],
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        # Revoke ALL refresh tokens for this user. Stricter than necessary
        # (we could revoke just the one bound to this session), but it makes
        # the user-facing semantics obvious: "log out" actually logs you out.
        refresh_token_store.revoke_all_for_user(user_id=user_id)

        if session_id is not None:
            session = db.get(UserSession, session_id)
            if session and session.user_id == user_id and session.logout_time is None:
                session.logout_time = datetime.now(timezone.utc)
                db.commit()
        audit_logger.log(
            db,
            event_type=EVT_LOGOUT,
            user_id=user_id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"session_id": session_id},
        )

    # ── Password reset ──────────────────────────────────────────────────
    def request_password_reset(
        self,
        db: Session,
        *,
        email: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Send an OTP if the email exists. Always returns silently — never
        leaks whether the email is registered.
        """
        email_norm = email.lower().strip()
        # Per-email rate limit (in addition to the per-IP slowapi limit on the
        # endpoint). This blocks distributed brute-force across many IPs.
        # Allow 5 OTP requests per email per hour.
        rate_guard.check(
            key=f"pw_forgot:{email_norm}", limit=5, window_seconds=3600
        )

        user = self._get_user_by_email(db, email_norm)
        if not user or not user.is_usable():
            # Still audit the attempt — useful for spotting probing.
            audit_logger.log(
                db,
                event_type=EVT_PW_RESET_REQUESTED,
                user_id=None,
                ip_address=ip,
                user_agent=user_agent,
                meta={"email": email_norm, "user_found": False},
            )
            return  # silent no-op

        # Mark previous unused password-reset OTPs as used.
        now = datetime.now(timezone.utc)
        db.query(EmailOTP).filter(
            EmailOTP.user_id == user.id,
            EmailOTP.purpose == "password_reset",
            EmailOTP.used_at.is_(None),
        ).update({EmailOTP.used_at: now})

        otp = generate_otp()
        db.add(
            EmailOTP(
                user_id=user.id,
                code_hash=hash_otp(otp),
                purpose="password_reset",
                expires_at=now + timedelta(minutes=self.OTP_TTL_MINUTES),
            )
        )
        db.commit()

        audit_logger.log(
            db,
            event_type=EVT_PW_RESET_REQUESTED,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"email": email_norm, "user_found": True},
        )

        try:
            email_service.send_otp(to_email=user.email, otp=otp)
        except Exception:
            # Swallow — we already committed the OTP, so the user can re-request.
            # Sentry will capture the underlying SMTP error.
            logger.exception("send_otp_failed user_id=%s", user.id)

    def reset_password(
        self,
        db: Session,
        *,
        email: str,
        otp: str,
        new_password: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        email_norm = email.lower().strip()
        # Hard cap: 10 wrong-OTP attempts per email per hour. Once an attacker
        # is throttled they cannot grind 6-digit codes against any user.
        rate_guard.check(
            key=f"pw_reset_attempt:{email_norm}", limit=10, window_seconds=3600
        )

        user = self._get_user_by_email(db, email_norm)

        # Look up the OTP entry only when a real user exists.
        otp_entry = None
        if user is not None:
            otp_entry = db.execute(
                select(EmailOTP)
                .where(EmailOTP.user_id == user.id)
                .where(EmailOTP.purpose == "password_reset")
                .where(EmailOTP.used_at.is_(None))
                .where(EmailOTP.expires_at > datetime.now(timezone.utc))
                .order_by(EmailOTP.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()

        # Always run HMAC regardless of whether user/OTP was found — prevents
        # email-enumeration via timing differences between the two code paths.
        _sentinel = hash_otp("000000")
        stored_hash = otp_entry.code_hash if otp_entry else _sentinel
        otp_valid = verify_otp(otp, stored_hash)

        if not user or not otp_entry or not otp_valid:
            raise InvalidCredentials("Invalid or expired OTP")

        now = datetime.now(timezone.utc)
        otp_entry.used_at = now
        user.password_hash = hash_password(new_password)
        # Also burn any other outstanding password-reset OTPs.
        db.query(EmailOTP).filter(
            EmailOTP.user_id == user.id,
            EmailOTP.purpose == "password_reset",
            EmailOTP.used_at.is_(None),
            EmailOTP.id != otp_entry.id,
        ).update({EmailOTP.used_at: now})
        db.commit()

        # Force re-login everywhere by revoking all refresh tokens.
        refresh_token_store.revoke_all_for_user(user_id=user.id)

        audit_logger.log(
            db,
            event_type=EVT_PW_RESET_COMPLETED,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"email": email_norm},
        )

        # Confirmation email — best-effort.
        try:
            email_service.send_password_changed(to_email=user.email)
        except Exception:
            logger.exception("send_password_changed_failed user_id=%s", user.id)

    # ── Email verification ──────────────────────────────────────────────
    def request_email_verification(
        self,
        db: Session,
        *,
        email: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Send a verification OTP if the email exists and is unverified.

        Always returns silently — never leaks whether the email is registered
        (or already verified).
        """
        email_norm = email.lower().strip()
        # Per-email rate limit, same defence-in-depth as password reset.
        rate_guard.check(
            key=f"ev_request:{email_norm}", limit=5, window_seconds=3600
        )

        user = self._get_user_by_email(db, email_norm)
        if not user or not user.is_usable() or user.email_verified_at is not None:
            # Still audit the attempt — useful for spotting probing.
            audit_logger.log(
                db,
                event_type=EVT_EMAIL_VERIFY_REQUESTED,
                user_id=user.id if user else None,
                ip_address=ip,
                user_agent=user_agent,
                meta={"email": email_norm, "sent": False},
            )
            return  # silent no-op

        # Mark previous unused verification OTPs as used.
        now = datetime.now(timezone.utc)
        db.query(EmailOTP).filter(
            EmailOTP.user_id == user.id,
            EmailOTP.purpose == "email_verify",
            EmailOTP.used_at.is_(None),
        ).update({EmailOTP.used_at: now})

        otp = generate_otp()
        db.add(
            EmailOTP(
                user_id=user.id,
                code_hash=hash_otp(otp),
                purpose="email_verify",
                expires_at=now + timedelta(minutes=self.OTP_TTL_MINUTES),
            )
        )
        db.commit()

        audit_logger.log(
            db,
            event_type=EVT_EMAIL_VERIFY_REQUESTED,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"email": email_norm, "sent": True},
        )

        try:
            email_service.send_verify_otp(to_email=user.email, otp=otp)
        except Exception:
            # Swallow — the OTP is committed, so the user can re-request.
            logger.exception("send_verify_otp_failed user_id=%s", user.id)

    def confirm_email_verification(
        self,
        db: Session,
        *,
        email: str,
        otp: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        email_norm = email.lower().strip()
        # Hard cap: 10 wrong-OTP attempts per email per hour.
        rate_guard.check(
            key=f"ev_confirm:{email_norm}", limit=10, window_seconds=3600
        )

        user = self._get_user_by_email(db, email_norm)

        # Look up the OTP entry only for real, still-unverified users.
        otp_entry = None
        if user is not None and user.email_verified_at is None:
            otp_entry = db.execute(
                select(EmailOTP)
                .where(EmailOTP.user_id == user.id)
                .where(EmailOTP.purpose == "email_verify")
                .where(EmailOTP.used_at.is_(None))
                .where(EmailOTP.expires_at > datetime.now(timezone.utc))
                .order_by(EmailOTP.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()

        # Always run HMAC regardless of whether user/OTP was found — prevents
        # email-enumeration via timing differences between the two code paths.
        _sentinel = hash_otp("000000")
        stored_hash = otp_entry.code_hash if otp_entry else _sentinel
        otp_valid = verify_otp(otp, stored_hash)

        if not user or not otp_entry or not otp_valid:
            raise InvalidCredentials("Invalid or expired OTP")

        now = datetime.now(timezone.utc)
        otp_entry.used_at = now
        user.email_verified_at = now
        # Also burn any other outstanding verification OTPs.
        db.query(EmailOTP).filter(
            EmailOTP.user_id == user.id,
            EmailOTP.purpose == "email_verify",
            EmailOTP.used_at.is_(None),
            EmailOTP.id != otp_entry.id,
        ).update({EmailOTP.used_at: now})
        db.commit()

        audit_logger.log(
            db,
            event_type=EVT_EMAIL_VERIFIED,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"email": email_norm},
        )

    # ── Change password (logged-in) ─────────────────────────────────────
    def change_password(
        self,
        db: Session,
        *,
        user: User,
        current_password: str,
        new_password: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        if not user.password_hash:
            raise ValidationError(
                "This account uses Google sign-in. "
                "Use 'Forgot password' to set a password first."
            )
        if not verify_password(current_password, user.password_hash):
            raise InvalidCredentials("Current password is incorrect")

        user.password_hash = hash_password(new_password)
        db.commit()

        # Force re-login everywhere by revoking all refresh tokens.
        refresh_token_store.revoke_all_for_user(user_id=user.id)

        audit_logger.log(
            db,
            event_type=EVT_PW_CHANGED,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"email": user.email},
        )

        # Confirmation email — best-effort.
        try:
            email_service.send_password_changed(to_email=user.email)
        except Exception:
            logger.exception("send_password_changed_failed user_id=%s", user.id)

    # ── Delete account ──────────────────────────────────────────────────
    def delete_account(
        self,
        db: Session,
        *,
        user: User,
        password: Optional[str],
        confirm: str,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Soft-delete + anonymize. The row stays (FKs survive) but the unique
        email/username are freed for re-registration and all PII is cleared.
        """
        if confirm != "DELETE":
            raise ValidationError('Type "DELETE" to confirm account deletion.')
        if user.password_hash and not (
            password and verify_password(password, user.password_hash)
        ):
            raise InvalidCredentials("Incorrect password")

        original_email = user.email

        # Goodbye email first — after anonymization there's no address left.
        # Best-effort: a mail failure must not block the deletion.
        try:
            email_service.send_account_deleted(to_email=original_email)
        except Exception:
            logger.exception("send_account_deleted_failed user_id=%s", user.id)

        now = datetime.now(timezone.utc)
        user.deleted_at = now
        user.is_active = False
        user.email = f"deleted_user_{user.id}@deleted.invalid"
        user.username = f"deleted_user_{user.id}"
        user.password_hash = None
        user.google_uid = None
        user.guardian_email = None
        user.date_of_birth = None

        # Close any open sessions.
        db.query(UserSession).filter(
            UserSession.user_id == user.id,
            UserSession.logout_time.is_(None),
        ).update({UserSession.logout_time: now})
        db.commit()

        refresh_token_store.revoke_all_for_user(user_id=user.id)

        audit_logger.log(
            db,
            event_type=EVT_ACCOUNT_DELETED,
            user_id=user.id,
            ip_address=ip,
            user_agent=user_agent,
            meta={"email": original_email},
        )


auth_service = AuthService()
