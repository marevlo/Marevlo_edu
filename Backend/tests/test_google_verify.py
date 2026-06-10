"""
Locks in the failure classification of `verify_google_id_token`.

The production bug this guards against: a connectivity failure to Google
(DNS down, no egress, Google outage) was being reported to the client as a
401 — indistinguishable from a genuinely bad token — which sends operators
hunting for a credential bug that doesn't exist.

Contract:
  * genuinely bad token (invalid / expired / revoked)  -> TokenError      (401)
  * cannot REACH Google to verify (certs / transport)  -> ServiceUnavailable (503)
"""
from __future__ import annotations

import sys
import types

import pytest

from app.auth.services import firebase as fb
from app.core.exceptions import ServiceUnavailable, TokenError


def _install_fake_firebase(monkeypatch, raise_exc):
    """Replace firebase_admin.auth with a fake whose verify_id_token raises
    `raise_exc`, and neutralise credential init. Returns the fake auth module
    so the caller can reference its exception classes."""

    auth = types.ModuleType("firebase_admin.auth")

    class RevokedIdTokenError(Exception):
        pass

    class ExpiredIdTokenError(Exception):
        pass

    class InvalidIdTokenError(Exception):
        pass

    class CertificateFetchError(Exception):
        pass

    auth.RevokedIdTokenError = RevokedIdTokenError
    auth.ExpiredIdTokenError = ExpiredIdTokenError
    auth.InvalidIdTokenError = InvalidIdTokenError
    auth.CertificateFetchError = CertificateFetchError

    def verify_id_token(_token, check_revoked=False):
        if raise_exc is not None:
            raise raise_exc(auth)
        return {"uid": "uid-123", "email": "user@example.com"}

    auth.verify_id_token = verify_id_token

    pkg = types.ModuleType("firebase_admin")
    pkg.auth = auth
    monkeypatch.setitem(sys.modules, "firebase_admin", pkg)
    monkeypatch.setitem(sys.modules, "firebase_admin.auth", auth)
    # Skip real credential loading.
    monkeypatch.setattr(fb, "_init_firebase", lambda: None)
    return auth


def test_valid_token_returns_claims(monkeypatch):
    _install_fake_firebase(monkeypatch, raise_exc=None)
    claims = fb.verify_google_id_token("good-token")
    assert claims["uid"] == "uid-123"
    assert claims["email"] == "user@example.com"


@pytest.mark.parametrize("err_attr", ["InvalidIdTokenError", "ExpiredIdTokenError", "RevokedIdTokenError"])
def test_bad_token_is_401(monkeypatch, err_attr):
    _install_fake_firebase(monkeypatch, raise_exc=lambda a: getattr(a, err_attr)("bad"))
    with pytest.raises(TokenError):
        fb.verify_google_id_token("bad-token")


def test_cert_fetch_failure_is_503(monkeypatch):
    _install_fake_firebase(monkeypatch, raise_exc=lambda a: a.CertificateFetchError("no certs"))
    with pytest.raises(ServiceUnavailable):
        fb.verify_google_id_token("any-token")


def test_transport_failure_is_503(monkeypatch):
    # A raw requests.ConnectionError-style failure (exactly what a dead DNS /
    # no egress produces) must NOT be mistaken for a bad token.
    _install_fake_firebase(monkeypatch, raise_exc=lambda a: ConnectionError("name resolution failed"))
    with pytest.raises(ServiceUnavailable):
        fb.verify_google_id_token("any-token")
