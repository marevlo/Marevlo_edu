"""
Submission HTTP endpoints.

Critical fix vs. the old code: `user_id` is taken from the authenticated
session via `get_current_user`, NEVER from the request body. The old
`/execute/run` accepted `user_id` in the JSON body, allowing trivial
impersonation.
"""

from typing import List

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db
from app.core.access import require_entitlement
from app.core.rate_limiting import limiter
from app.problems.models.problem import Problem
from app.submissions.models.submission import ProblemSubmission
from app.submissions.schemas.submission import (
    RunRequest,
    RunResponse,
    SubmissionHistoryItem,
    SubmissionOut,
    SubmitRequest,
)
from app.submissions.services.submission_service import submission_service

router = APIRouter(prefix="/submissions", tags=["submissions"])


@router.post("/run", response_model=RunResponse)
@limiter.limit("30/minute")
def run_code(
    request: Request,
    body: RunRequest,
    user: User = Depends(require_entitlement("dsa")),
):
    """Execute code without persisting. Used for the 'Run' button in the IDE."""
    result = submission_service.run(
        language=body.language, code=body.code, stdin=body.stdin
    )
    return result


@router.post("/submit", response_model=SubmissionOut)
@limiter.limit("20/minute")
def submit_code(
    request: Request,
    body: SubmitRequest,
    user: User = Depends(require_entitlement("dsa")),
    db: Session = Depends(get_db),
):
    """Submit code for grading; persists a row and awards XP on acceptance."""
    submission = submission_service.submit(
        db,
        user_id=user.id,
        problem_id=body.problem_id,
        language=body.language,
        code=body.code,
    )
    return submission


@router.get("/my-submissions", response_model=List[SubmissionHistoryItem])
def get_my_submissions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Get the authenticated user's submission history."""
    results = (
        db.query(
            ProblemSubmission.id,
            ProblemSubmission.problem_id,
            Problem.title.label("problem_title"),
            Problem.difficulty,
            ProblemSubmission.language,
            ProblemSubmission.status,
            ProblemSubmission.submitted_at,
            ProblemSubmission.execution_time,
        )
        .join(Problem, ProblemSubmission.problem_id == Problem.id)
        .filter(ProblemSubmission.user_id == user.id)
        .order_by(ProblemSubmission.submitted_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return results
