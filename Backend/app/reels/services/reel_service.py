"""Reel service — upload, ranking, engagement, search, serialization."""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import Forbidden, NotFound, StorageNotConfigured, ValidationError
from app.core.storage import storage
from app.feed.schemas.post import format_relative_time
from app.reels.models.reel import (
    ANCHOR_TYPES,
    REEL_TYPES,
    Reel,
    ReelAnchor,
    ReelCtaEvent,
    ReelLike,
    ReelModerationAction,
    ReelSave,
    ReelTopic,
    ReelTranscript,
    ReelView,
)
from app.reels.services.cta_resolver import build_viewer_context, resolve_cta

logger = logging.getLogger(__name__)

MIN_DURATION = 20
MAX_DURATION = 300
MAX_SIZE_REEL_VIDEO = 150 * 1024 * 1024
MAX_SIZE_REEL_THUMB = 1 * 1024 * 1024
VIDEO_TYPES = ("video/mp4", "video/webm")
THUMB_TYPES = ("image/jpeg", "image/png", "image/webp")
_VEXT = {"video/mp4": "mp4", "video/webm": "webm"}
_TEXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

from app.reels.services.taxonomy import TAXONOMY


def _slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:90]
    return f"{s}-{uuid.uuid4().hex[:6]}"


def _is_mp4(head: bytes) -> bool:
    return len(head) >= 12 and head[4:8] == b"ftyp"


def _is_webm(head: bytes) -> bool:
    return head[:4] == b"\x1aE\xdf\xa3"


class ReelService:
    # ── taxonomy ─────────────────────────────────────────────────────
    def seed_topics(self, db: Session) -> None:
        """Idempotent — inserts only taxonomy slugs not already present."""
        existing = {s for (s,) in db.query(ReelTopic.slug).all()}
        for i, (slug, name, kind, parent) in enumerate(TAXONOMY):
            if slug not in existing:
                db.add(ReelTopic(slug=slug, name=name, kind=kind,
                                 parent_slug=parent, sort_order=i))
        db.commit()

    def list_topics(self, db: Session) -> list[dict]:
        counts = dict(
            db.query(ReelAnchor.anchor_id, func.count(func.distinct(ReelAnchor.reel_id)))
            .join(Reel, Reel.id == ReelAnchor.reel_id)
            .filter(ReelAnchor.anchor_type.in_(("topic", "concept")),
                    Reel.status == "approved", Reel.deleted_at.is_(None))
            .group_by(ReelAnchor.anchor_id).all()
        )
        rows = (
            db.query(ReelTopic).filter(ReelTopic.is_active.is_(True))
            .order_by(ReelTopic.sort_order).all()
        )
        from app.reels.services.taxonomy import category_for
        return [
            {"slug": t.slug, "name": t.name, "kind": t.kind,
             "parent": t.parent_slug, "category": category_for(t.slug),
             "reel_count": counts.get(t.slug, 0)}
            for t in rows
        ]

    # ── upload ───────────────────────────────────────────────────────
    def request_upload(self, *, user_id: int, video_content_type: str, video_size: int,
                       thumbnail_content_type: str | None, thumbnail_size: int | None) -> dict:
        if not storage.is_configured():
            raise StorageNotConfigured()
        if video_content_type not in VIDEO_TYPES:
            raise ValidationError("Video must be MP4 or WebM")
        if video_size <= 0 or video_size > MAX_SIZE_REEL_VIDEO:
            raise ValidationError(f"Video must be at most {MAX_SIZE_REEL_VIDEO} bytes")

        from app.core.config import get_settings

        vid_key = f"users/{user_id}/reels/{uuid.uuid4().hex}.{_VEXT[video_content_type]}"
        out = {
            "video_upload_url": storage.presigned_put(
                key=vid_key, content_type=video_content_type, max_size=video_size),
            "video_object_key": vid_key,
            "thumbnail_upload_url": None, "thumbnail_object_key": None,
            "expires_in": get_settings().S3_PRESIGN_TTL_PUT_SECONDS,
            "max_video_size": MAX_SIZE_REEL_VIDEO,
        }
        if thumbnail_content_type:
            if thumbnail_content_type not in THUMB_TYPES:
                raise ValidationError("Thumbnail must be JPEG, PNG, or WebP")
            if not thumbnail_size or thumbnail_size > MAX_SIZE_REEL_THUMB:
                raise ValidationError("Thumbnail too large")
            t_key = f"users/{user_id}/reels/thumbs/{uuid.uuid4().hex}.{_TEXT[thumbnail_content_type]}"
            out["thumbnail_upload_url"] = storage.presigned_put(
                key=t_key, content_type=thumbnail_content_type, max_size=thumbnail_size)
            out["thumbnail_object_key"] = t_key
        return out

    def create_reel(self, db: Session, *, user_id: int, title: str, description: str | None,
                    reel_type: str, difficulty: str | None, language: str,
                    video_object_key: str, thumbnail_object_key: str | None,
                    duration_seconds: int, anchors: list[dict],
                    declared_rights: bool, transcript_text: str | None) -> Reel:
        if not declared_rights:
            raise ValidationError("You must confirm you have the right to upload this content")
        # Direct-publish means uploads go live with no human gate, so the only
        # backstop against flooding the feed is a per-user daily publish cap.
        from app.core.config import get_settings
        from app.core.rate_guard import rate_guard
        cap = get_settings().REELS_UPLOADS_PER_DAY
        if cap > 0:
            rate_guard.check(key=f"reel_publish:{user_id}", limit=cap, window_seconds=86400)
        if not (MIN_DURATION <= duration_seconds <= MAX_DURATION):
            raise ValidationError(f"Reels must be {MIN_DURATION}s–{MAX_DURATION // 60} min")
        if reel_type not in REEL_TYPES:
            raise ValidationError("Unknown reel type")
        if not anchors:
            raise ValidationError("At least one anchor is required — reels must be wired to the learning graph")
        for a in anchors:
            if a.get("anchor_type") not in ANCHOR_TYPES:
                raise ValidationError(f"Unknown anchor type: {a.get('anchor_type')}")
        if not storage.key_belongs_to_user(video_object_key, user_id):
            raise Forbidden("Video key does not belong to you")
        if thumbnail_object_key and not storage.key_belongs_to_user(thumbnail_object_key, user_id):
            raise Forbidden("Thumbnail key does not belong to you")

        head = storage.head_object(video_object_key)
        if head is None:
            raise ValidationError("Video upload not found — the upload may have failed")
        size = int(head.get("ContentLength", 0))
        ctype = head.get("ContentType", "")
        if size > MAX_SIZE_REEL_VIDEO or ctype not in VIDEO_TYPES:
            storage.delete_object(video_object_key)
            raise ValidationError("Video failed policy checks")
        first = storage.fetch_first_bytes(video_object_key, n=16) or b""
        if (ctype == "video/mp4" and not _is_mp4(first)) or (
            ctype == "video/webm" and not _is_webm(first)
        ):
            storage.delete_object(video_object_key)
            raise ValidationError("File content does not match its declared format")

        reel = Reel(
            slug=_slugify(title), user_id=user_id, title=title.strip(),
            description=(description or "").strip() or None,
            reel_type=reel_type, difficulty=difficulty, language=language,
            video_object_key=video_object_key, thumbnail_object_key=thumbnail_object_key,
            duration_seconds=duration_seconds, size_bytes=size, content_type=ctype,
            status="approved",  # direct-publish: live the moment validation passes
            published_at=datetime.now(tz=timezone.utc),
            creator_declared_rights=True,
        )
        db.add(reel)
        db.flush()
        for a in anchors:
            db.add(ReelAnchor(
                reel_id=reel.id, anchor_type=a["anchor_type"],
                anchor_id=str(a["anchor_id"]), label=a.get("label", str(a["anchor_id"]))[:140],
                source=a.get("source", "creator"), confidence=a.get("confidence"),
            ))
        if transcript_text:
            db.add(ReelTranscript(reel_id=reel.id, transcript_text=transcript_text.strip(),
                                  language=language, generated_by="manual"))
        db.add(ReelModerationAction(reel_id=reel.id, reviewer_id=None, action="auto_published",
                                    reason="direct-publish: validation passed"))
        db.commit()
        db.refresh(reel)
        # Reel is already live. The async pipeline (HLS transcode + Whisper)
        # only enhances it afterwards — it never gates publication.
        from app.reels.services.pipeline import enqueue_processing
        enqueue_processing(reel.id)
        return reel

    # ── ranking (v1 deliberate simplicity — mirrors prototype) ──────
    def rail_for_problem(self, db: Session, *, problem_id: int, problem_topic_slugs: list[str],
                         limit: int = 12) -> list[Reel]:
        reels = self._approved(db).all()
        pid = str(problem_id)

        def score(r: Reel) -> float:
            s = 0.0
            for a in r.anchors:
                if a.anchor_type == "problem" and a.anchor_id == pid:
                    s += 400
                elif a.anchor_type == "concept" and a.anchor_id in problem_topic_slugs:
                    s += 200
                elif a.anchor_type == "topic" and a.anchor_id in problem_topic_slugs:
                    s += 100
            s += r.avg_completion * 0.5 + min(r.save_count / 100, 20)
            return s

        ranked = sorted(((score(r), r) for r in reels), key=lambda x: -x[0])
        return [r for s, r in ranked if s >= 100][:limit]

    def rail_for_topic(self, db: Session, *, topic_slug: str, limit: int = 24) -> list[Reel]:
        ids = [rid for (rid,) in db.query(ReelAnchor.reel_id).filter(
            ReelAnchor.anchor_type.in_(("topic", "concept")),
            ReelAnchor.anchor_id == topic_slug).all()]
        if not ids:
            return []
        return (self._approved(db).filter(Reel.id.in_(ids))
                .order_by((Reel.avg_completion + Reel.save_count / 50.0).desc(),
                          Reel.created_at.desc()).limit(limit).all())

    def feed(self, db: Session, *, page: int, limit: int) -> tuple[list[Reel], int]:
        q = self._approved(db)
        total = q.with_entities(func.count(Reel.id)).order_by(None).scalar() or 0
        rows = (q.order_by(Reel.published_at.desc().nullslast(), Reel.created_at.desc())
                .offset((page - 1) * limit).limit(limit).all())
        return rows, total

    def _approved(self, db: Session):
        return (db.query(Reel)
                .options(selectinload(Reel.author), selectinload(Reel.anchors))
                .filter(Reel.status == "approved", Reel.deleted_at.is_(None)))

    # ── search (transcript ILIKE for v1; move to FTS/pgvector later) ─
    def search(self, db: Session, *, q: str, limit: int = 20) -> list[tuple[Reel, str | None]]:
        term = f"%{q.strip()}%"
        base = self._approved(db).outerjoin(ReelTranscript, ReelTranscript.reel_id == Reel.id)
        rows = (base.filter(or_(
                    Reel.title.ilike(term),
                    Reel.description.ilike(term),
                    ReelTranscript.transcript_text.ilike(term),
                    Reel.anchors.any(ReelAnchor.label.ilike(term)),
                ))
                .order_by(Reel.avg_completion.desc(), Reel.save_count.desc())
                .limit(limit).all())
        out = []
        ql = q.strip().lower()
        for r in rows:
            snippet = None
            if r.transcript and ql in r.transcript.transcript_text.lower():
                txt = r.transcript.transcript_text
                i = txt.lower().index(ql)
                snippet = ("…" if i > 40 else "") + txt[max(0, i - 40): i + len(ql) + 60] + "…"
            out.append((r, snippet))
        return out

    # ── engagement ───────────────────────────────────────────────────
    def get_by_slug(self, db: Session, slug: str, *, allow_unpublished_for: int | None = None) -> Reel:
        r = (db.query(Reel)
             .options(selectinload(Reel.author), selectinload(Reel.anchors),
                      selectinload(Reel.transcript))
             .filter(Reel.slug == slug, Reel.deleted_at.is_(None)).first())
        if not r:
            raise NotFound("Reel not found")
        if r.status != "approved" and r.user_id != allow_unpublished_for:
            raise NotFound("Reel not found")
        return r

    def get(self, db: Session, reel_id: int) -> Reel:
        r = (db.query(Reel)
             .options(selectinload(Reel.author), selectinload(Reel.anchors),
                      selectinload(Reel.transcript))
             .filter(Reel.id == reel_id, Reel.deleted_at.is_(None)).first())
        if not r:
            raise NotFound("Reel not found")
        return r

    def toggle(self, db: Session, model, counter: str, *, reel_id: int, user_id: int) -> dict:
        reel = self.get(db, reel_id)
        row = db.query(model).filter(model.reel_id == reel_id, model.user_id == user_id).first()
        if row:
            db.delete(row)
            setattr(reel, counter, max(0, getattr(reel, counter) - 1))
            on = False
        else:
            db.add(model(reel_id=reel_id, user_id=user_id))
            setattr(reel, counter, getattr(reel, counter) + 1)
            on = True
        db.commit()
        return {"on": on, "count": getattr(reel, counter)}

    def record_view(self, db: Session, *, reel_id: int, user_id: int | None,
                    watched_seconds: int, completion_percent: int) -> dict:
        reel = self.get(db, reel_id)
        completion_percent = max(0, min(100, completion_percent))
        if user_id is not None:
            row = db.query(ReelView).filter(
                ReelView.reel_id == reel_id, ReelView.user_id == user_id).first()
            if row is None:
                db.add(ReelView(reel_id=reel_id, user_id=user_id,
                                watched_seconds=watched_seconds,
                                completion_percent=completion_percent))
                reel.view_count += 1
            else:
                row.watched_seconds = max(row.watched_seconds, watched_seconds)
                row.completion_percent = max(row.completion_percent, completion_percent)
        else:
            reel.view_count += 1  # anonymous: counter only
        # cheap rolling completion estimate
        n = max(reel.view_count, 1)
        reel.avg_completion = round(reel.avg_completion + (completion_percent - reel.avg_completion) / n, 2)
        db.commit()
        return {"views": reel.view_count}

    def log_cta(self, db: Session, *, reel_id: int, user, source: str, clicked: bool) -> dict:
        reel = self.get(db, reel_id)
        ctx = build_viewer_context(db, user, source, reel)
        cta = resolve_cta(ctx, reel)
        db.add(ReelCtaEvent(reel_id=reel_id, user_id=ctx.user_id, persona=ctx.persona,
                            source=source, cta_action=cta.action, cta_label=cta.label,
                            clicked=clicked))
        db.commit()
        return {"logged": True}

    def delete_own(self, db: Session, *, reel_id: int, user_id: int) -> None:
        reel = self.get(db, reel_id)
        if reel.user_id != user_id:
            raise Forbidden("You can only delete your own reels")
        reel.deleted_at = datetime.now(timezone.utc)
        db.commit()

    # ── serialization ────────────────────────────────────────────────
    def to_out(self, db: Session, reel: Reel, *, user, source: str,
               liked: bool = False, saved: bool = False,
               include_transcript: bool = False) -> dict:
        ctx = build_viewer_context(db, user, source, reel)
        cta = resolve_cta(ctx, reel)
        author = reel.author
        out = {
            "id": reel.id, "slug": reel.slug, "title": reel.title,
            "description": reel.description, "type": reel.reel_type,
            "difficulty": reel.difficulty, "language": reel.language,
            "durationSeconds": reel.duration_seconds,
            "videoUrl": reel.hls_url or storage.resolve_url(reel.video_object_key),
            "isHls": bool(reel.hls_url),
            "thumbnailUrl": storage.resolve_url(reel.thumbnail_object_key),
            "author": getattr(author, "username", "unknown"),
            "authorId": reel.user_id,
            "followedByMe": self._follows_author(db, user, reel.user_id),
            "status": reel.status,
            "likes": reel.like_count, "saves": reel.save_count, "views": reel.view_count,
            "avgCompletion": reel.avg_completion,
            "time": format_relative_time(reel.published_at or reel.created_at),
            "likedByMe": liked, "savedByMe": saved,
            "anchors": [
                {"type": a.anchor_type, "id": a.anchor_id, "label": a.label,
                 "source": a.source} for a in reel.anchors
            ],
            "cta": {"label": cta.label, "action": cta.action,
                    "targetType": cta.target_type, "targetId": cta.target_id,
                    "why": cta.why},
            "captionsAvailable": reel.transcript is not None,
        }
        if include_transcript and reel.transcript:
            out["transcript"] = reel.transcript.transcript_text
        return out

    def _follows_author(self, db: Session, user, author_id: int) -> bool:
        uid = getattr(user, "id", None)
        if not uid or uid == author_id:
            return False
        from app.reels.services.social_service import social_service
        return social_service.is_following(db, follower_id=uid, following_id=author_id)

    def bulk_flags(self, db: Session, reel_ids: list[int], user_id: int | None):
        if not user_id or not reel_ids:
            return set(), set()
        liked = {i for (i,) in db.query(ReelLike.reel_id).filter(
            ReelLike.user_id == user_id, ReelLike.reel_id.in_(reel_ids))}
        saved = {i for (i,) in db.query(ReelSave.reel_id).filter(
            ReelSave.user_id == user_id, ReelSave.reel_id.in_(reel_ids))}
        return liked, saved


reel_service = ReelService()
