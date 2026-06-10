"""
Firebase Admin SDK — verifies Google ID tokens.

Lazy-initialized so the module can be imported during tests without a
real credentials file.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailable, TokenError

logger = logging.getLogger(__name__)

_app = None  # firebase_admin.App


def _init_firebase():
    global _app
    if _app is not None:
        return _app

    import firebase_admin
    from firebase_admin import credentials

    s = get_settings()
    if s.FIREBASE_CREDENTIALS_JSON:
        cred = credentials.Certificate(json.loads(s.FIREBASE_CREDENTIALS_JSON))
        _app = firebase_admin.initialize_app(cred)
        logger.info("firebase_init source=env")
        return _app

    if s.FIREBASE_CREDENTIALS_PATH and os.path.isfile(s.FIREBASE_CREDENTIALS_PATH):
        cred = credentials.Certificate(s.FIREBASE_CREDENTIALS_PATH)
        _app = firebase_admin.initialize_app(cred)
        logger.info("firebase_init source=file path=%s", s.FIREBASE_CREDENTIALS_PATH)
        return _app

    raise RuntimeError(
        "Firebase credentials not found. Set FIREBASE_CREDENTIALS_JSON or "
        "FIREBASE_CREDENTIALS_PATH."
    )


def verify_google_id_token(id_token: str) -> dict:
    """Verify a Firebase Google ID token and return the claims dict.

    Failure classification matters for correct HTTP semantics and debuggability:
      * The token is genuinely bad (expired / revoked / malformed / wrong
        audience) -> TokenError -> 401. The client must re-authenticate.
      * We could not REACH Google to verify it (DNS down, no egress, Google
        outage, cert-fetch failure) -> ServiceUnavailable -> 503. This is an
        infra fault, NOT the user's credentials — surfacing it as 401 sends
        operators hunting for a credential bug that isn't there.
    """
    _init_firebase()
    from firebase_admin import auth as firebase_auth

    s = get_settings()
    try:
        return firebase_auth.verify_id_token(
            id_token, check_revoked=s.FIREBASE_CHECK_REVOKED
        )
    except firebase_auth.RevokedIdTokenError as exc:
        raise TokenError("Google token has been revoked") from exc
    except firebase_auth.ExpiredIdTokenError as exc:
        raise TokenError("Google token has expired") from exc
    except firebase_auth.CertificateFetchError as exc:
        # SDK could not download Google's public signing certs — connectivity,
        # not the user. 503 so the client retries and operators look at egress.
        logger.error("firebase_cert_fetch_failed err=%s", exc)
        raise ServiceUnavailable(
            "Identity verification is temporarily unavailable. Please try again."
        ) from exc
    except firebase_auth.InvalidIdTokenError as exc:
        raise TokenError("Invalid Google token") from exc
    except Exception as exc:
        # Reaching here means an UNEXPECTED failure. Invalid/forged tokens are
        # already caught above as InvalidIdTokenError, so an unclassified error
        # is overwhelmingly a transport/network fault (e.g. raw
        # requests.ConnectionError from a revocation check). Treat as 503, not
        # 401, so we never blame the user's credentials for our own outage.
        logger.error("firebase_verify_unexpected_error err=%s", exc)
        raise ServiceUnavailable(
            "Could not verify Google identity right now. Please try again."
        ) from exc
