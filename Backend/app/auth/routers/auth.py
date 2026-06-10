"""
Auth HTTP endpoints. Thin — all logic lives in AuthService.
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.auth.models.user import User
from app.auth.schemas.auth import (
    ForgotPasswordRequest,
    GoogleLoginRequest,
    MessageOut,
    RefreshRequest,
    ResetPasswordRequest,
    TokenPair,
    UserCreate,
    UserOut,
    WSTicketOut,
)
from app.auth.services.auth_service import auth_service
from app.auth.services.ws_ticket import TICKET_TTL_SECONDS, ws_ticket_service
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiting import limiter

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return getattr(request.state, "real_ip", None) or (
        request.client.host if request.client else None
    )


@router.post(
    "/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED
)
@limiter.limit("5/minute")
def signup(
    request: Request,
    payload: UserCreate,
    db: Session = Depends(get_db),
):
    # Age / DPDP minor handling. MINORS_MODE: "block" = 18+ only;
    # "consent" = collect a guardian email + consent for under-18 users.
    settings = get_settings()
    dob = payload.date_of_birth
    guardian_email = None
    guardian_consent_at = None
    if dob is None:
        if settings.REQUIRE_DOB:
            raise HTTPException(status_code=400, detail="Date of birth is required.")
    else:
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        if age < 0 or age > 120:
            raise HTTPException(status_code=400, detail="Please enter a valid date of birth.")
        if age < settings.MINOR_AGE:
            if settings.MINORS_MODE == "block":
                raise HTTPException(
                    status_code=403,
                    detail=f"You must be at least {settings.MINOR_AGE} years old to sign up.",
                )
            if not payload.guardian_email or not payload.guardian_consent:
                raise HTTPException(
                    status_code=400,
                    detail="A parent/guardian email and their consent are required for users under 18.",
                )
            guardian_email = str(payload.guardian_email)
            guardian_consent_at = datetime.now(timezone.utc)

    user = auth_service.signup(
        db,
        email=payload.email,
        username=payload.username,
        password=payload.password,
        date_of_birth=dob,
        guardian_email=guardian_email,
        guardian_consent_at=guardian_consent_at,
    )
    return user


@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return auth_service.login(
        db,
        email=form.username,  # OAuth2 form calls it `username`; we accept email
        password=form.password,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/google", response_model=TokenPair)
@limiter.limit("10/minute")
def google_login(
    request: Request,
    body: GoogleLoginRequest,
    db: Session = Depends(get_db),
):
    return auth_service.google_login(
        db,
        id_token=body.id_token,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("20/minute")
def refresh(
    request: Request,
    body: RefreshRequest,
    db: Session = Depends(get_db),
):
    return auth_service.refresh(db, refresh_token=body.refresh_token)


@router.post("/logout", response_model=MessageOut)
@limiter.limit("10/minute")
def logout(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.logout(
        db,
        user_id=user.id,
        session_id=getattr(user, "session_id", None),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return MessageOut(message="Logged out")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/ws-ticket", response_model=WSTicketOut)
@limiter.limit("60/minute")
def issue_ws_ticket(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Mint a one-shot, 60-second ticket for opening a WebSocket connection.

    The ticket can be consumed exactly once via the `?ticket=` query param on
    the /chat/ws endpoint. Use this instead of passing the access token in the
    URL — URLs can leak via browser history, proxies, and access logs.
    """
    ticket = ws_ticket_service.issue(user_id=user.id)
    return WSTicketOut(ticket=ticket, expires_in=TICKET_TTL_SECONDS)


@router.post("/password/forgot", response_model=MessageOut)
@limiter.limit("5/minute")
def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    auth_service.request_password_reset(
        db,
        email=body.email,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return MessageOut(message="If the email exists, an OTP has been sent.")


@router.post("/password/reset", response_model=MessageOut)
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    auth_service.reset_password(
        db,
        email=body.email,
        otp=body.otp,
        new_password=body.new_password,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return MessageOut(message="Password reset successful. Please log in again.")
