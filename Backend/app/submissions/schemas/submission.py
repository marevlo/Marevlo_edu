"""Submission-related schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RunRequest(BaseModel):
    """Run code without saving as a submission (debugging)."""
    problem_id: Optional[int] = None  # optional context
    language: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=200_000)
    stdin: str = ""


class RunResponse(BaseModel):
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    runtime_ms: Optional[int] = None


class SubmitRequest(BaseModel):
    """Submit code for grading. Records a row in problem_submissions."""
    problem_id: int
    language: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=200_000)


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    problem_id: int
    language: Optional[str] = None
    status: Optional[str] = None
    test_cases_passed: Optional[int] = None
    total_test_cases: Optional[int] = None
    execution_time: Optional[float] = None
    memory_used: Optional[float] = None
    submitted_at: datetime


class SubmissionHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    problem_id: int
    problem_title: str
    difficulty: str
    language: Optional[str] = None
    status: Optional[str] = None
    submitted_at: datetime
    execution_time: Optional[float] = None
