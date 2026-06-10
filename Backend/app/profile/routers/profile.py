"""Profile HTTP endpoints."""

from typing import List

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.profile.schemas.profile import (
    AchievementOut,
    ActivityPoint,
    AvatarConfirmIn,
    AvatarUploadUrlIn,
    AvatarUploadUrlOut,
    ProfileOut,
    ProfileUpdate,
    StatsOut,
)
from app.profile.services.profile_service import profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=ProfileOut)
def get_my_profile(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = profile_service.get_or_create(db, user.id)
    return profile_service.serialize(profile)


@router.put("/me", response_model=ProfileOut)
def update_my_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = profile_service.update(db, user.id, body.model_dump(exclude_none=True))
    return profile_service.serialize(profile)


@router.get("/stats", response_model=StatsOut)
def get_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_service.get_stats(db, user.id)


@router.get("/activity", response_model=List[ActivityPoint])
def get_activity(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return profile_service.get_activity(db, user.id, days=70)


@router.get("/achievements", response_model=List[AchievementOut])
def get_achievements(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return profile_service.list_achievements(db, user.id)


# ── Avatar (presigned PUT flow) ─────────────────────────────────────────
@router.post("/avatar/upload-url", response_model=AvatarUploadUrlOut)
def request_avatar_upload(
    body: AvatarUploadUrlIn, user: User = Depends(get_current_user)
):
    return profile_service.request_avatar_upload(
        user_id=user.id, content_type=body.content_type, size=body.size
    )


@router.post("/avatar/confirm", response_model=ProfileOut)
def confirm_avatar(
    body: AvatarConfirmIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = profile_service.confirm_avatar(db, user_id=user.id, object_key=body.object_key)
    return profile_service.serialize(profile)


@router.delete("/avatar", response_model=ProfileOut)
def delete_avatar(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = profile_service.clear_avatar(db, user.id)
    return profile_service.serialize(profile)


# ── Resume (server-side passthrough) ────────────────────────────────────
@router.post("/resume")
async def upload_resume(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    profile = profile_service.upload_resume(
        db,
        user_id=user.id,
        file_bytes=contents,
        content_type=file.content_type or "application/octet-stream",
    )
    serialized = profile_service.serialize(profile)
    return {"resume_url": serialized.get("resume_url"), "filename": file.filename}
