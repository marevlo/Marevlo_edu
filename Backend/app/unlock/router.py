"""Job-board unlock status endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.unlock.service import unlock_service

router = APIRouter(prefix="/unlock", tags=["unlock"])


@router.get("/job-board")
def job_board_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns whether the job board is unlocked for the current user,
    along with progress percentages for problems and courses.
    Unlocked when both problems and course lessons are >= 75% complete.
    """
    return unlock_service.job_board_status(db, user_id=user.id)
