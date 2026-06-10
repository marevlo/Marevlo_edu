"""
Notebook launch — mints a one-shot JWT and returns a JupyterHub login URL.

The JupyterHub instance verifies this JWT against the same JWT_SECRET to
authenticate the user. TTL is intentionally tiny (60s) — the URL is single-
use; once the user follows it, JupyterHub starts its own session.
"""

from fastapi import APIRouter, Depends

from app.auth.models.user import User
from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.core.security import create_notebook_token

router = APIRouter(prefix="/notebook", tags=["notebook"])


@router.post("/launch")
def launch_notebook(user: User = Depends(get_current_user)):
    base = get_settings().NOTEBOOK_BASE_URL.rstrip("/")
    token = create_notebook_token(user_id=user.id, username=user.username)
    return {"url": f"{base}/hub/login?token={token}"}
