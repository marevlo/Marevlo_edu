"""
Transactional email.

Uses SMTP — works with AWS SES (recommended), Gmail App Passwords, Mailgun,
or any other SMTP provider. Falls back to console output in dev if no SMTP
is configured.

Supports:
  - send_otp: password-reset OTP (existing).
  - send_password_changed: confirms a successful password reset.
  - send_suspicious_login: alerts the user that we saw a login from a new
    IP / user-agent.
  - send: generic helper for any subject/body.

All sends are best-effort. SMTPException propagates so callers can decide
whether to retry or audit-log; everything else (DNS, timeout, etc.) is
swallowed and logged.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    def _is_configured(self) -> bool:
        s = get_settings()
        return bool(s.SMTP_HOST and s.SMTP_USER and s.SMTP_PASS)

    def _send(
        self,
        *,
        to_email: str,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
    ) -> None:
        if not self._is_configured():
            # Dev fallback — visible in logs and stdout.
            logger.info("dev_email recipient=%s subject=%r", to_email, subject)
            print(f"[DEV] Email to {to_email}: {subject}\n{text_body}\n")
            return

        s = get_settings()
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = s.SMTP_FROM
        msg["To"] = to_email
        msg.set_content(text_body)
        if html_body:
            msg.add_alternative(html_body, subtype="html")

        try:
            with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=10) as server:
                if s.SMTP_USE_TLS:
                    server.starttls()
                server.login(s.SMTP_USER, s.SMTP_PASS)
                server.send_message(msg)
            logger.info("email_sent recipient=%s subject=%r", to_email, subject)
        except smtplib.SMTPException:
            # Don't reveal SMTP details in the API response.
            logger.exception("email_failed recipient=%s", to_email)
            raise

    # ── Public templates ────────────────────────────────────────────────
    def send_otp(self, *, to_email: str, otp: str) -> None:
        self._send(
            to_email=to_email,
            subject="Marevlo password reset code",
            text_body=(
                f"Marevlo password reset\n\n"
                f"Your verification code is: {otp}\n\n"
                f"This code expires in 10 minutes. If you didn't request a password reset, "
                f"you can safely ignore this email.\n\n"
                f"— The Marevlo team\n"
            ),
            html_body=f"""\
<html><body style="font-family:system-ui,sans-serif">
  <h2 style="color:#7c3aed">Marevlo password reset</h2>
  <p>Your verification code is:</p>
  <p style="font-size:28px;letter-spacing:4px;font-weight:700;background:#f5f3ff;padding:12px 16px;border-radius:8px;display:inline-block">{otp}</p>
  <p>This code expires in <strong>10 minutes</strong>.</p>
  <p style="color:#666">If you didn't request a password reset, ignore this email.</p>
</body></html>""",
        )

    def send_password_changed(self, *, to_email: str) -> None:
        """Confirm to the user that their password was just changed."""
        self._send(
            to_email=to_email,
            subject="Your Marevlo password was changed",
            text_body=(
                "Hello,\n\n"
                "This is a confirmation that the password on your Marevlo account "
                "was just changed.\n\n"
                "If you didn't do this, your account may be compromised. Please reset "
                "your password again immediately and contact support@marevlo.com.\n\n"
                "— The Marevlo team\n"
            ),
            html_body="""\
<html><body style="font-family:system-ui,sans-serif">
  <h2 style="color:#7c3aed">Password changed</h2>
  <p>This is a confirmation that the password on your Marevlo account was just changed.</p>
  <p style="color:#dc2626"><strong>If you didn't do this</strong>, your account may be compromised.
  Please reset your password again and contact <a href="mailto:support@marevlo.com">support@marevlo.com</a>.</p>
</body></html>""",
        )

    def send_suspicious_login(
        self,
        *,
        to_email: str,
        ip: str,
        user_agent: str,
        when: str,
    ) -> None:
        """Alert user that we saw a login from a new IP / user-agent."""
        self._send(
            to_email=to_email,
            subject="New sign-in to your Marevlo account",
            text_body=(
                f"We noticed a new sign-in to your Marevlo account.\n\n"
                f"  When:        {when}\n"
                f"  IP address:  {ip}\n"
                f"  Device:      {user_agent}\n\n"
                f"If this was you, no action is needed.\n\n"
                f"If it wasn't you, change your password immediately at "
                f"https://marevlo.com/account/security and contact support@marevlo.com.\n\n"
                f"— The Marevlo team\n"
            ),
            html_body=f"""\
<html><body style="font-family:system-ui,sans-serif">
  <h2 style="color:#7c3aed">New sign-in</h2>
  <p>We noticed a new sign-in to your Marevlo account.</p>
  <table style="border-collapse:collapse">
    <tr><td style="padding:4px 12px;color:#666">When</td><td style="padding:4px 12px"><b>{when}</b></td></tr>
    <tr><td style="padding:4px 12px;color:#666">IP address</td><td style="padding:4px 12px"><code>{ip}</code></td></tr>
    <tr><td style="padding:4px 12px;color:#666">Device</td><td style="padding:4px 12px">{user_agent}</td></tr>
  </table>
  <p>If this was you, no action is needed.</p>
  <p style="color:#dc2626"><strong>If it wasn't you</strong>, change your password immediately and
  contact <a href="mailto:support@marevlo.com">support@marevlo.com</a>.</p>
</body></html>""",
        )


email_service = EmailService()
