"""
Submission service.

`run`     — executes code without persisting.
`submit`  — executes, persists ProblemSubmission row, awards XP if accepted,
            re-evaluates achievements.
"""
from __future__ import annotations

import json
import logging
import re

from sqlalchemy.orm import Session

from app.common.activity_log import ActivityLog
from app.core.exceptions import NotFound, ValidationError
from app.problems.models.problem import Problem, ProblemTestCase
from app.profile.services.profile_service import XP_TABLE, profile_service
from app.submissions.models.submission import ProblemSubmission
from app.submissions.services.runner_client import runner_client

logger = logging.getLogger(__name__)


class SubmissionService:
    def run(self, *, language: str, code: str, stdin: str = "") -> dict:
        return runner_client.run(language=language, code=code, stdin=stdin)

    def _normalize(self, output: str) -> str:
        s = (output or "").strip()
        s = s.rstrip('\n').rstrip('\r')
        # Normalize Python booleans/None to JSON equivalents
        s = re.sub(r'\bNone\b', 'null', s)
        s = re.sub(r'\bTrue\b', 'true', s)
        s = re.sub(r'\bFalse\b', 'false', s)
        try:
            parsed = json.loads(s)
            s = json.dumps(parsed, separators=(',', ':'))
        except (json.JSONDecodeError, ValueError):
            pass
        return s

    def _is_compile_error(self, stderr: str, language: str) -> bool:
        """Detect compilation errors for C++/Java."""
        if language in ("python", "javascript"):
            return False
        patterns = ["error:", "cannot find symbol", "compilation failed"]
        return any(p in stderr.lower() for p in patterns)

    def _is_memory_error(self, stderr: str) -> bool:
        """Detect memory limit errors from stderr."""
        patterns = ["memory limit exceeded", "out of memory", "cannot allocate memory"]
        return any(p in stderr.lower() for p in patterns)

    def submit(
        self,
        db: Session,
        *,
        user_id: int,
        problem_id: int,
        language: str,
        code: str,
    ) -> ProblemSubmission:
        problem = db.get(Problem, problem_id)
        if not problem:
            raise NotFound("Problem not found")

        # Fetch ALL test cases for this problem
        testcases = db.query(ProblemTestCase).filter(
            ProblemTestCase.problem_id == problem_id
        ).order_by(ProblemTestCase.id).all()

        if not testcases:
            raise ValidationError("Problem has no test cases configured")

        time_limit_ms = int((problem.time_limit_s or 2.0) * 1000)
        memory_limit_mb = problem.memory_limit_mb or 256

        status = "accepted"
        passed_count = 0
        max_time_ms = 0
        max_memory_kb = 0

        for tc in testcases:
            result = runner_client.run(
                language=language,
                code=code,
                stdin=tc.input,
                timeout_ms=time_limit_ms + 1000,
                memory_mb=memory_limit_mb,
            )

            runtime_ms = result.get("runtime_ms") or 0
            memory_kb = result.get("memory_kb") or 0
            max_time_ms = max(max_time_ms, runtime_ms)
            max_memory_kb = max(max_memory_kb, memory_kb)

            exit_code = result["exit_code"]
            stderr = result.get("stderr", "")

            if exit_code == -1 or runtime_ms > time_limit_ms:
                status = "time_limit_exceeded"
                break

            if memory_kb > memory_limit_mb * 1024 or self._is_memory_error(stderr):
                status = "memory_limit_exceeded"
                break

            if exit_code != 0:
                if self._is_compile_error(stderr, language):
                    status = "compile_error"
                else:
                    status = "runtime_error"
                break

            actual = self._normalize(result.get("stdout", ""))
            expected = self._normalize(tc.expected_output)

            if actual != expected:
                status = "wrong_answer"
                break

            passed_count += 1

        submission = ProblemSubmission(
            user_id=user_id,
            problem_id=problem_id,
            language=language,
            status=status,
            test_cases_passed=passed_count,
            total_test_cases=len(testcases),
            execution_time=max_time_ms / 1000.0 if max_time_ms > 0 else None,
            memory_used=max_memory_kb / 1024.0 if max_memory_kb > 0 else None,
        )
        db.add(submission)
        db.add(
            ActivityLog(
                user_id=user_id,
                action="submit_problem",
                meta={"problem_id": problem_id, "status": status, "language": language},
            )
        )
        db.commit()
        db.refresh(submission)

        if status == "accepted":
            xp = XP_TABLE.get(problem.difficulty or "Easy", XP_TABLE["Easy"])
            profile_service.award_xp(db, user_id=user_id, amount=xp)
            profile_service.evaluate_achievements(db, user_id)

        return submission


submission_service = SubmissionService()
