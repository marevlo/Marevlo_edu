"""Problem read service."""
from __future__ import annotations

from typing import List

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFound
from app.problems.models.problem import Problem, ProblemTestCase


class ProblemService:
    def list(
        self, db: Session, *, page: int = 1, limit: int = 50, difficulty: str | None = None
    ) -> tuple[List[Problem], int]:
        # Build the WHERE clause once; reuse for both count and page query.
        filters = []
        if difficulty:
            filters.append(Problem.difficulty == difficulty)

        total = (
            db.execute(select(func.count(Problem.id)).where(*filters)).scalar() or 0
        )
        items = (
            db.execute(
                select(Problem)
                .where(*filters)
                .order_by(Problem.id)
                .offset((page - 1) * limit)
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return items, int(total)

    def get(self, db: Session, problem_id: int) -> Problem:
        problem = db.get(Problem, problem_id)
        if not problem:
            raise NotFound("Problem not found")
        return problem

    def get_with_sample_testcases(self, db: Session, problem_id: int) -> tuple[Problem, list[ProblemTestCase]]:
        problem = self.get(db, problem_id)
        samples = (
            db.execute(
                select(ProblemTestCase)
                .where(ProblemTestCase.problem_id == problem_id)
                .where(ProblemTestCase.is_hidden.is_(False))
                .order_by(ProblemTestCase.id)
            )
            .scalars()
            .all()
        )
        return problem, list(samples)


problem_service = ProblemService()
