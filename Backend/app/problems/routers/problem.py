"""Problems HTTP endpoints — read-only for end users."""

from typing import List, Optional, Union

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db, get_optional_user
from app.core.access import require_entitlement
from app.problems.schemas.problem import ProblemDetail, ProblemSummary, TestCaseOut
from app.problems.services.problem_service import problem_service

router = APIRouter(prefix="/problems", tags=["problems"])


@router.get("", response_model=List[ProblemSummary])
def list_problems(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    difficulty: Optional[str] = Query(None, pattern="^(Easy|Medium|Hard)$"),
    user: User = Depends(require_entitlement("dsa")),
    db: Session = Depends(get_db),
):
    items, _ = problem_service.list(db, page=page, limit=limit, difficulty=difficulty)
    return items


@router.get("/{problem_id}", response_model=ProblemDetail)
def get_problem(
    problem_id: int,
    user: User = Depends(require_entitlement("dsa")),
    db: Session = Depends(get_db),
):
    problem, samples = problem_service.get_with_sample_testcases(db, problem_id)
    return ProblemDetail(
        id=problem.id,
        title=problem.title,
        slug=problem.slug,
        difficulty=problem.difficulty,
        created_at=problem.created_at,
        description=problem.description,
        sample_testcases=[TestCaseOut.model_validate(tc) for tc in samples],
    )


@router.get("/{problem_id}/online")
def get_online_count(
    problem_id: str,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """
    Get approximate online viewer count for a problem's discussion.
    
    Accepts both numeric problem ID and problem slug.
    Unauthenticated access is allowed.
    """
    # Try to parse as int, otherwise treat as slug
    try:
        problem_id_parsed: Union[int, str] = int(problem_id)
    except ValueError:
        problem_id_parsed = problem_id
    
    from app.discussions.services.discussion_service import discussion_service
    from app.discussions.schemas.discussion import OnlineCountOut
    
    count = discussion_service.get_online_count(db, problem_id=problem_id_parsed)
    return OnlineCountOut(count=count)
