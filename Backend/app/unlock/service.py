"""
Job-board unlock service.

The job board unlocks when a user has:
  1. Accepted submissions on >= 75% of all problems.
  2. Completed (status='completed') >= 75% of all known course lessons.

TOTAL_LEAF_LESSONS is the count of all leaf modules registered in the
frontend COURSE_HTML_MAP. Update this constant whenever new courses are added.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.learning.models.learning import LessonProgress
from app.problems.models.problem import Problem
from app.submissions.models.submission import ProblemSubmission

TOTAL_LEAF_LESSONS: int = 122  # update when new course modules are added
UNLOCK_THRESHOLD: float = 0.75


class UnlockService:
    def job_board_status(self, db: Session, *, user_id: int) -> dict:
        total_problems: int = db.execute(
            select(func.count(Problem.id))
        ).scalar_one() or 0

        solved_problems: int = db.execute(
            select(func.count(func.distinct(ProblemSubmission.problem_id)))
            .where(ProblemSubmission.user_id == user_id)
            .where(ProblemSubmission.status == "accepted")
        ).scalar_one() or 0

        completed_lessons: int = db.execute(
            select(func.count(LessonProgress.id))
            .where(LessonProgress.user_id == user_id)
            .where(LessonProgress.status == "completed")
        ).scalar_one() or 0

        problems_pct = (solved_problems / total_problems * 100) if total_problems > 0 else 0.0
        lessons_pct = (completed_lessons / TOTAL_LEAF_LESSONS * 100)

        return {
            "unlocked": problems_pct >= UNLOCK_THRESHOLD * 100 and lessons_pct >= UNLOCK_THRESHOLD * 100,
            "problems": {
                "completed": solved_problems,
                "total": total_problems,
                "pct": round(problems_pct, 1),
            },
            "courses": {
                "lessons_completed": completed_lessons,
                "lessons_total": TOTAL_LEAF_LESSONS,
                "pct": round(lessons_pct, 1),
            },
        }


unlock_service = UnlockService()
