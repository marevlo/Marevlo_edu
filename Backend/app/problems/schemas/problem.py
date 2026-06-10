"""Problem-related Pydantic schemas."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class TestCaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    input: str
    expected_output: str


class ProblemSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    slug: Optional[str] = None
    difficulty: Optional[str] = None
    created_at: datetime


class ProblemDetail(ProblemSummary):
    description: str
    sample_testcases: List[TestCaseOut] = []
