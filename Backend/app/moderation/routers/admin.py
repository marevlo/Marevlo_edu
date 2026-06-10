"""Admin-only moderation endpoints.

All routes require `is_admin = true` on the calling user. Use the
`promote_user_to_admin` script (or update the DB directly) to bootstrap your
first admin account.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_db, require_admin
from app.moderation.schemas.moderation import (
    MessageOut,
    ReportListOut,
    ReportOut,
    ResolveReportRequest,
)
from app.moderation.services.moderation_service import moderation_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/reports", response_model=ReportListOut)
def list_reports(
    target_type: str = Query("all", pattern="^(all|post|comment)$"),
    status_filter: str = Query("open", alias="status", pattern="^(open|resolved|dismissed)$"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    items, total = moderation_service.list_reports(
        db,
        target_type=target_type,
        status=status_filter,
        page=page,
        limit=limit,
    )
    return ReportListOut(
        reports=[ReportOut(**i) for i in items],
        pagination={
            "page": page,
            "limit": limit,
            "total_count": total,
            "total_pages": (total + limit - 1) // limit if limit else 0,
        },
    )


@router.post("/reports/post/{report_id}/resolve", response_model=ReportOut)
def resolve_post_report(
    report_id: int,
    body: ResolveReportRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = moderation_service.resolve_post_report(
        db,
        admin_id=admin.id,
        report_id=report_id,
        action=body.action,
        note=body.note,
    )
    return ReportOut(
        id=r.id,
        target_id=r.post_id,
        target_type="post",
        reporter_id=r.reporter_id,
        reporter_username=None,
        reason=r.reason,
        note=r.note,
        status=r.status,
        resolved_at=r.resolved_at,
        created_at=r.created_at,
    )


@router.post("/reports/comment/{report_id}/resolve", response_model=ReportOut)
def resolve_comment_report(
    report_id: int,
    body: ResolveReportRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    r = moderation_service.resolve_comment_report(
        db,
        admin_id=admin.id,
        report_id=report_id,
        action=body.action,
        note=body.note,
    )
    return ReportOut(
        id=r.id,
        target_id=r.comment_id,
        target_type="comment",
        reporter_id=r.reporter_id,
        reporter_username=None,
        reason=r.reason,
        note=r.note,
        status=r.status,
        resolved_at=r.resolved_at,
        created_at=r.created_at,
    )


@router.delete("/posts/{post_id}", response_model=MessageOut)
def admin_delete_post(
    post_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    moderation_service.admin_delete_post(db, admin_id=admin.id, post_id=post_id)
    return MessageOut(message="Post soft-deleted")


@router.delete("/comments/{comment_id}", response_model=MessageOut)
def admin_delete_comment(
    comment_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    moderation_service.admin_delete_comment(db, admin_id=admin.id, comment_id=comment_id)
    return MessageOut(message="Comment soft-deleted")
