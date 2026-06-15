"""Moderation service — queues, actions, reports, audit. All actions logged."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFound, ValidationError
from app.reels.models.reel import (
    Reel,
    ReelAnchor,
    ReelModerationAction,
    ReelReport,
)

MOD_ACTIONS = ("approve", "reject", "hide", "restore", "takedown")
HIGH_RISK_REPORT_REASONS = ("copyright",)


class ModerationService:
    def queues(self, db: Session) -> dict:
        rows = (db.query(Reel.status, func.count(Reel.id))
                .filter(Reel.deleted_at.is_(None)).group_by(Reel.status).all())
        counts = {s: 0 for s in ("processing", "pending", "approved", "rejected", "hidden")}
        counts.update(dict(rows))
        counts["open_reports"] = (db.query(func.count(ReelReport.id))
                                  .filter(ReelReport.status == "open").scalar() or 0)
        return counts

    def list_queue(self, db: Session, *, status: str, page: int, limit: int):
        q = (db.query(Reel)
             .options(selectinload(Reel.author), selectinload(Reel.anchors),
                      selectinload(Reel.transcript))
             .filter(Reel.status == status, Reel.deleted_at.is_(None)))
        total = q.with_entities(func.count(Reel.id)).order_by(None).scalar() or 0
        rows = q.order_by(Reel.created_at.asc()).offset((page - 1) * limit).limit(limit).all()
        return rows, total

    def act(self, db: Session, *, reel_id: int, reviewer_id: int, action: str,
            reason: str | None, notes: str | None) -> Reel:
        if action not in MOD_ACTIONS:
            raise ValidationError(f"Unknown action: {action}")
        reel = db.query(Reel).filter(Reel.id == reel_id, Reel.deleted_at.is_(None)).first()
        if not reel:
            raise NotFound("Reel not found")

        if action == "approve":
            reel.status = "approved"
            reel.published_at = reel.published_at or datetime.now(timezone.utc)
        elif action == "reject":
            reel.status = "rejected"
        elif action == "hide":
            reel.status = "hidden"
        elif action == "restore":
            reel.status = "approved"
        elif action == "takedown":
            reel.status = "rejected"
            reel.deleted_at = datetime.now(timezone.utc)

        db.add(ReelModerationAction(reel_id=reel_id, reviewer_id=reviewer_id,
                                    action=action, reason=reason, notes=notes))
        db.commit()
        db.refresh(reel)
        return reel

    def set_anchors(self, db: Session, *, reel_id: int, reviewer_id: int,
                    anchors: list[dict]) -> Reel:
        reel = db.query(Reel).filter(Reel.id == reel_id).first()
        if not reel:
            raise NotFound("Reel not found")
        db.query(ReelAnchor).filter(ReelAnchor.reel_id == reel_id).delete()
        for a in anchors:
            db.add(ReelAnchor(reel_id=reel_id, anchor_type=a["anchor_type"],
                              anchor_id=str(a["anchor_id"]),
                              label=a.get("label", str(a["anchor_id"]))[:140],
                              source="moderator"))
        db.add(ReelModerationAction(reel_id=reel_id, reviewer_id=reviewer_id,
                                    action="anchor_edit",
                                    reason=f"{len(anchors)} anchors set"))
        db.commit()
        db.refresh(reel)
        return reel

    def audit(self, db: Session, *, reel_id: int | None, limit: int = 100):
        q = db.query(ReelModerationAction).order_by(ReelModerationAction.created_at.desc())
        if reel_id:
            q = q.filter(ReelModerationAction.reel_id == reel_id)
        return q.limit(limit).all()

    # ── reports / copyright flow ─────────────────────────────────────
    def file_report(self, db: Session, *, reel_id: int, reporter_id: int | None,
                    reason: str, description: str | None) -> dict:
        reel = db.query(Reel).filter(Reel.id == reel_id, Reel.deleted_at.is_(None)).first()
        if not reel:
            raise NotFound("Reel not found")
        db.add(ReelReport(reel_id=reel_id, reporter_id=reporter_id,
                          reason=reason, description=description))
        auto_hidden = False
        if reason in HIGH_RISK_REPORT_REASONS and reel.status == "approved":
            reel.status = "hidden"
            auto_hidden = True
            db.add(ReelModerationAction(reel_id=reel_id, reviewer_id=None,
                                        action="auto_hide",
                                        reason=f"high-risk report: {reason}"))
        db.commit()
        return {"reported": True, "auto_hidden": auto_hidden}

    def list_reports(self, db: Session, *, status: str, page: int, limit: int):
        q = db.query(ReelReport).filter(ReelReport.status == status)
        total = q.with_entities(func.count(ReelReport.id)).order_by(None).scalar() or 0
        rows = (q.order_by(ReelReport.created_at.desc())
                .offset((page - 1) * limit).limit(limit).all())
        return rows, total

    def resolve_report(self, db: Session, *, report_id: int, reviewer_id: int,
                       outcome: str) -> dict:
        rep = db.query(ReelReport).filter(ReelReport.id == report_id).first()
        if not rep:
            raise NotFound("Report not found")
        if outcome not in ("dismiss", "takedown", "restore_and_dismiss"):
            raise ValidationError("Unknown outcome")
        if outcome == "takedown":
            self.act(db, reel_id=rep.reel_id, reviewer_id=reviewer_id,
                     action="takedown", reason=f"report #{rep.id}: {rep.reason}", notes=None)
            rep.status = "actioned"
        else:
            if outcome == "restore_and_dismiss":
                self.act(db, reel_id=rep.reel_id, reviewer_id=reviewer_id,
                         action="restore", reason=f"report #{rep.id} dismissed", notes=None)
            rep.status = "dismissed"
        db.commit()
        return {"status": rep.status}


moderation_service = ModerationService()
