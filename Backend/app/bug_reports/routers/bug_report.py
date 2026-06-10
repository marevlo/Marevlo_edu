"""Bug report HTTP endpoints (minimal, fixed).

This file had merge/format corruption; provide a minimal working endpoint
that accepts a form `title` and `description`, creates a `BugReport` row,
and returns the id and status. Screenshot/upload is omitted here.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.bug_reports.models.bug_report import BugReport
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiting import limiter

router = APIRouter(prefix="/bug-reports", tags=["bug-reports"])


class BugReportOut(BaseModel):
    id: int
    status: str


@router.post("", status_code=201, response_model=BugReportOut)
@limiter.limit("5/hour")
async def submit_bug_report(
    request: Request,  # noqa: ARG001 - slowapi reads this via introspection
    title: str = Form(..., min_length=5, max_length=200),
    description: str = Form(..., min_length=10, max_length=5000),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BugReportOut:
    """Submit a bug report (title + description)."""
    title_clean = title.strip()
    if len(title_clean) < 5:
        raise HTTPException(422, "Title must be at least 5 non-whitespace characters.")

    description_clean = description.strip()
    if len(description_clean) < 10:
        raise HTTPException(422, "Description must be at least 10 non-whitespace characters.")

    report = BugReport(
        user_id=user.id,
        title=title_clean,
        description=description_clean,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return BugReportOut(id=report.id, status=report.status)
