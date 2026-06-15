"""Reels HTTP endpoints.

Three routers:
  public_router  — optional auth; rails, feed, watch-by-slug, search, view,
                   topics, report. The no-login public watch page lives here.
  reels_router   — authed; upload, finalize, like/save, CTA click, studio,
                   delete.
  admin_router   — require_admin; queues, actions, anchors, reports, audit.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.models.user import User
from app.core.dependencies import get_current_user, get_db, get_optional_user, require_admin
from app.core.idempotency import IdempotencyContext, idempotency
from app.reels.schemas.reel import (
    AnchorsUpdateIn,
    CtaClickIn,
    ModerationActionIn,
    ReelCreate,
    ReelUploadUrlIn,
    ReportIn,
    ReportResolveIn,
    ViewIn,
)
from app.reels.services.moderation_service import moderation_service
from app.reels.services.reel_service import reel_service

public_router = APIRouter(prefix="/reels", tags=["reels"])
reels_router = APIRouter(prefix="/reels", tags=["reels"])
admin_router = APIRouter(prefix="/reels/admin", tags=["reels-admin"])


def _serialize_list(db, reels, user, source):
    liked, saved = reel_service.bulk_flags(db, [r.id for r in reels],
                                           user.id if user else None)
    return [reel_service.to_out(db, r, user=user, source=source,
                                liked=r.id in liked, saved=r.id in saved)
            for r in reels]


# ════════ PUBLIC (optional auth) ════════
@public_router.get("/topics")
def list_topics(db: Session = Depends(get_db)):
    return reel_service.list_topics(db)


@public_router.get("/rail/problem/{problem_id}")
def rail_for_problem(
    problem_id: int,
    topics: str = Query("", description="comma-separated topic/concept slugs for this problem"),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    slugs = [s.strip() for s in topics.split(",") if s.strip()]
    reels = reel_service.rail_for_problem(db, problem_id=problem_id,
                                          problem_topic_slugs=slugs)
    return {"reels": _serialize_list(db, reels, user, "problem_page")}


@public_router.get("/rail/topic/{topic_slug}")
def rail_for_topic(
    topic_slug: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    reels = reel_service.rail_for_topic(db, topic_slug=topic_slug)
    return {"reels": _serialize_list(db, reels, user, "topic_page")}


@public_router.get("/feed")
def feed(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=30),
    source: str = Query("floater"),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    reels, total = reel_service.feed(db, page=page, limit=limit)
    return {"reels": _serialize_list(db, reels, user, source),
            "pagination": {"page": page, "limit": limit, "total_count": total,
                           "total_pages": (total + limit - 1) // limit if limit else 0}}


@public_router.get("/search")
def search(
    q: str = Query(..., min_length=2, max_length=120),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    hits = reel_service.search(db, q=q)
    liked, saved = reel_service.bulk_flags(db, [r.id for r, _ in hits],
                                           user.id if user else None)
    return {"results": [
        {**reel_service.to_out(db, r, user=user, source="search",
                               liked=r.id in liked, saved=r.id in saved),
         "snippet": snip} for r, snip in hits]}


@public_router.get("/watch/{slug}")
def watch(
    slug: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Public watch page payload — works logged out. Creators can preview
    their own unpublished reels."""
    r = reel_service.get_by_slug(db, slug,
                                 allow_unpublished_for=user.id if user else None)
    liked, saved = reel_service.bulk_flags(db, [r.id], user.id if user else None)
    return reel_service.to_out(db, r, user=user, source="public",
                               liked=r.id in liked, saved=r.id in saved,
                               include_transcript=True)


@public_router.post("/{reel_id}/view")
def record_view(
    reel_id: int,
    body: ViewIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return reel_service.record_view(db, reel_id=reel_id,
                                    user_id=user.id if user else None,
                                    watched_seconds=body.watched_seconds,
                                    completion_percent=body.completion_percent)


@public_router.post("/{reel_id}/report")
def report(
    reel_id: int,
    body: ReportIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return moderation_service.file_report(db, reel_id=reel_id,
                                          reporter_id=user.id if user else None,
                                          reason=body.reason,
                                          description=body.description)


# ════════ AUTHED ════════
@reels_router.post("/upload-url")
def request_upload(body: ReelUploadUrlIn, user: User = Depends(get_current_user)):
    return reel_service.request_upload(
        user_id=user.id, video_content_type=body.video_content_type,
        video_size=body.video_size,
        thumbnail_content_type=body.thumbnail_content_type,
        thumbnail_size=body.thumbnail_size)


@reels_router.post("")
def create_reel(
    body: ReelCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    idem: IdempotencyContext = Depends(idempotency),
):
    cached = idem.replay()
    if cached is not None:
        return cached
    reel = reel_service.create_reel(
        db, user_id=user.id, title=body.title, description=body.description,
        reel_type=body.reel_type, difficulty=body.difficulty, language=body.language,
        video_object_key=body.video_object_key,
        thumbnail_object_key=body.thumbnail_object_key,
        duration_seconds=body.duration_seconds,
        anchors=[a.model_dump() for a in body.anchors],
        declared_rights=body.declared_rights,
        transcript_text=body.transcript_text)
    out = reel_service.to_out(db, reel, user=user, source="upload")
    idem.store(out)
    return out


@reels_router.get("/mine")
def my_reels(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.reels.models.reel import Reel
    from sqlalchemy.orm import selectinload
    rows = (db.query(Reel)
            .options(selectinload(Reel.anchors), selectinload(Reel.transcript))
            .filter(Reel.user_id == user.id, Reel.deleted_at.is_(None))
            .order_by(Reel.created_at.desc()).all())
    return {"reels": [reel_service.to_out(db, r, user=user, source="studio")
                      for r in rows]}


@reels_router.post("/{reel_id}/like")
def toggle_like(reel_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    from app.reels.models.reel import ReelLike
    result = reel_service.toggle(db, ReelLike, "like_count",
                                 reel_id=reel_id, user_id=user.id)
    if result.get("on"):  # only on a new like — check for a milestone
        try:
            from app.reels.services.notification_service import notify_like_milestone
            notify_like_milestone(db, reel=reel_service.get(db, reel_id))
        except Exception:  # noqa: BLE001
            pass
    return result


@reels_router.post("/{reel_id}/save")
def toggle_save(reel_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    from app.reels.models.reel import ReelSave
    return reel_service.toggle(db, ReelSave, "save_count",
                               reel_id=reel_id, user_id=user.id)


@reels_router.post("/{reel_id}/cta-click")
def cta_click(reel_id: int, body: CtaClickIn,
              user: User | None = Depends(get_optional_user),
              db: Session = Depends(get_db)):
    return reel_service.log_cta(db, reel_id=reel_id, user=user,
                                source=body.source, clicked=True)


@reels_router.post("/{reel_id}/unlock-problem")
def unlock_problem(reel_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Spend one free unlock on this reel's anchored problem (idempotent;
    paid users pass through). 403 when the free meter is exhausted."""
    from app.reels.services.entitlements import consume_unlock
    reel = reel_service.get(db, reel_id)
    out = consume_unlock(db, user=user, reel=reel)
    # log as a clicked practice_free CTA for the impact funnel
    reel_service.log_cta(db, reel_id=reel_id, user=user, source="unlock", clicked=True)
    return out


@reels_router.delete("/{reel_id}")
def delete_reel(reel_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    reel_service.delete_own(db, reel_id=reel_id, user_id=user.id)
    return {"message": "Reel deleted"}


# ════════ ADMIN ════════
@admin_router.get("/queues")
def queue_counts(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return moderation_service.queues(db)


@admin_router.get("/queue/{status}")
def list_queue(status: str, page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=50),
               admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows, total = moderation_service.list_queue(db, status=status, page=page, limit=limit)
    return {"reels": [reel_service.to_out(db, r, user=admin, source="moderation",
                                          include_transcript=True) for r in rows],
            "total": total}


@admin_router.post("/{reel_id}/action")
def moderate(reel_id: int, body: ModerationActionIn,
             admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    reel = moderation_service.act(db, reel_id=reel_id, reviewer_id=admin.id,
                                  action=body.action, reason=body.reason,
                                  notes=body.notes)
    return {"id": reel.id, "status": reel.status}


@admin_router.put("/{reel_id}/anchors")
def set_anchors(reel_id: int, body: AnchorsUpdateIn,
                admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    reel = moderation_service.set_anchors(
        db, reel_id=reel_id, reviewer_id=admin.id,
        anchors=[a.model_dump() for a in body.anchors])
    return {"id": reel.id, "anchors": [
        {"type": a.anchor_type, "id": a.anchor_id, "label": a.label}
        for a in reel.anchors]}


@admin_router.get("/reports")
def list_reports(status: str = Query("open"), page: int = Query(1, ge=1),
                 limit: int = Query(20, ge=1, le=50),
                 admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows, total = moderation_service.list_reports(db, status=status, page=page, limit=limit)
    return {"reports": [
        {"id": r.id, "reelId": r.reel_id, "reason": r.reason,
         "description": r.description, "status": r.status,
         "createdAt": r.created_at.isoformat()} for r in rows], "total": total}


@admin_router.post("/reports/{report_id}/resolve")
def resolve_report(report_id: int, body: ReportResolveIn,
                   admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return moderation_service.resolve_report(db, report_id=report_id,
                                             reviewer_id=admin.id,
                                             outcome=body.outcome)


@admin_router.get("/audit")
def audit(reel_id: int | None = Query(None),
          admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = moderation_service.audit(db, reel_id=reel_id)
    return {"actions": [
        {"id": a.id, "reelId": a.reel_id, "reviewerId": a.reviewer_id,
         "action": a.action, "reason": a.reason,
         "at": a.created_at.isoformat()} for a in rows]}
