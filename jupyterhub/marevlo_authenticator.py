"""
JWT-based JupyterHub Authenticator that consumes Marevlo-issued notebook tokens.

Flow:
  1. Marevlo backend mints a short-lived JWT (type="notebook", sub=user_id).
  2. Frontend redirects user to /hub/login?token=<jwt>.
  3. MarevloLoginHandler reads the token and calls login_user(...) which
     hands the token to MarevloAuthenticator.authenticate(...).
  4. authenticate(...) validates signature, expiry, and type, then returns
     the user's id (as a string) — that becomes the JupyterHub username.
"""

import os

import jwt
from jupyterhub.auth import Authenticator
from jupyterhub.handlers import BaseHandler
from tornado import web


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET env var is required for MarevloAuthenticator")
    return secret


def _jwt_algorithm() -> str:
    return os.environ.get("JWT_ALGORITHM", "HS256")


class MarevloLoginHandler(BaseHandler):
    """Reads ?token=<jwt> off the query string and logs the user in."""

    async def get(self):
        token = self.get_argument("token", default=None)
        if not token:
            raise web.HTTPError(401, "Missing token query parameter")
        user = await self.login_user({"jwt_token": token})
        if user is None:
            raise web.HTTPError(401, "Invalid or expired notebook token")
        self.redirect(self.get_next_url(user))


class MarevloAuthenticator(Authenticator):
    auto_login = True
    # No enable_auth_state — the JWT already carries `sub` (user id) and `name`,
    # which is everything we need.  Turning it on requires a JUPYTERHUB_CRYPT_KEY
    # we don't actually use anywhere.

    def get_handlers(self, app):
        return [("/login", MarevloLoginHandler)]

    async def authenticate(self, handler, data):
        token = (data or {}).get("jwt_token")
        if not token:
            return None
        try:
            payload = jwt.decode(
                token,
                _jwt_secret(),
                algorithms=[_jwt_algorithm()],
            )
        except jwt.PyJWTError:
            return None

        if payload.get("type") != "notebook":
            return None

        user_id = str(payload.get("sub") or "").strip()
        if not user_id:
            return None

        return user_id
