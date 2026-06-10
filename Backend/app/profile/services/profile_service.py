"""
Profile service.

Encapsulates:
  - Get/update profile (lazy-create on first access)
  - Avatar / resume lifecycle (S3 presigned PUT + confirm + delete-old)
  - Stats (XP, level, rank, problems solved, courses completed)
  - Badges (atomic insert via INSERT...ON CONFLICT)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.exceptions import (
    Forbidden,
    NotFound,
    StorageNotConfigured,
    ValidationError,
)
from app.core.storage import (
    AVATAR_CONTENT_TYPES,
    MAX_SIZE_AVATAR,
    MAX_SIZE_RESUME,
    RESUME_CONTENT_TYPES,
    storage,
)
from app.profile.models.profile import UserAchievement, UserProfile

logger = logging.getLogger(__name__)


BADGE_CATALOGUE: Dict[str, dict] = {
    "first_solve": {
        "label": "First Blood",
        "description": "Submitted your first accepted solution",
        "icon": "⚡",
        "color": "#f59e0b",
    },
    "ten_solves": {
        "label": "Problem Crusher",
        "description": "10 accepted solutions",
        "icon": "🔥",
        "color": "#f43f5e",
    },
    "fifty_solves": {
        "label": "Algorithm Ace",
        "description": "50 accepted solutions",
        "icon": "🏆",
        "color": "#6366f1",
    },
    "hundred_solves": {
        "label": "Code Legend",
        "description": "100 accepted solutions",
        "icon": "💎",
        "color": "#8b5cf6",
    },
    "streak_7": {
        "label": "Week Warrior",
        "description": "7-day activity streak",
        "icon": "🗓️",
        "color": "#06b6d4",
    },
    "streak_30": {
        "label": "Month Master",
        "description": "30-day activity streak",
        "icon": "📅",
        "color": "#10b981",
    },
    "first_course": {
        "label": "Scholar",
        "description": "Completed your first course",
        "icon": "📚",
        "color": "#06b6d4",
    },
    "profile_complete": {
        "label": "Identity",
        "description": "Filled in bio and location",
        "icon": "👤",
        "color": "#8b5cf6",
    },
}

XP_TABLE = {"Easy": 10, "Medium": 25, "Hard": 50}
XP_COURSE_COMPLETE = 100


class ProfileService:
    XP_PER_LEVEL = 100

    # ── Profile read / write ────────────────────────────────────────────
    def get_or_create(self, db: Session, user_id: int) -> UserProfile:
        profile = db.get(UserProfile, user_id)
        if profile:
            return profile
        profile = UserProfile(user_id=user_id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    def update(self, db: Session, user_id: int, fields: dict) -> UserProfile:
        profile = self.get_or_create(db, user_id)
        for key, value in fields.items():
            if value is not None and hasattr(profile, key):
                setattr(profile, key, value)
        db.commit()
        db.refresh(profile)

        if profile.bio and profile.location:
            self._grant_badge(db, user_id, "profile_complete")
        return profile

    def serialize(self, profile: UserProfile) -> dict:
        """Convert to dict and resolve S3 keys to presigned GET URLs."""
        data = {col.name: getattr(profile, col.name) for col in profile.__table__.columns}
        for field in ("avatar_url", "resume_url"):
            data[field] = storage.resolve_url(data.get(field))
        return data

    # ── Avatar ──────────────────────────────────────────────────────────
    def request_avatar_upload(
        self, *, user_id: int, content_type: str, size: int
    ) -> dict:
        if not storage.is_configured():
            raise StorageNotConfigured()
        if content_type not in AVATAR_CONTENT_TYPES:
            raise ValidationError("Avatar must be JPEG, PNG, or WebP")
        if size <= 0 or size > MAX_SIZE_AVATAR:
            raise ValidationError(f"Avatar must be between 1 byte and {MAX_SIZE_AVATAR} bytes")

        key = storage.avatar_key(user_id, content_type)
        url = storage.presigned_put(key=key, content_type=content_type, max_size=size)
        from app.core.config import get_settings

        return {
            "upload_url": url,
            "object_key": key,
            "expires_in": get_settings().S3_PRESIGN_TTL_PUT_SECONDS,
            "max_size": MAX_SIZE_AVATAR,
        }

    def confirm_avatar(self, db: Session, *, user_id: int, object_key: str) -> UserProfile:
        if not storage.key_belongs_to_user(object_key, user_id):
            raise Forbidden("Object key does not belong to this user")
        if not object_key.startswith(f"users/{user_id}/avatar/"):
            raise Forbidden("Object key is not in the avatar prefix")

        head = storage.head_object(object_key)
        if head is None:
            raise ValidationError("Upload not found in S3 — did the PUT succeed?")
        if head.get("ContentLength", 0) > MAX_SIZE_AVATAR:
            storage.delete_object(object_key)
            raise ValidationError("Uploaded avatar exceeds 2 MB")
        declared_ct = head.get("ContentType", "")
        if declared_ct not in AVATAR_CONTENT_TYPES:
            storage.delete_object(object_key)
            raise ValidationError("Uploaded file is not a supported image")

        # Magic-byte validation: don't trust the declared Content-Type.
        # We sniff the first kilobyte. If it's lying, we delete and reject.
        from app.core.file_validation import (
            reencode_image,
            validate_magic_bytes,
        )

        try:
            head_bytes = storage.fetch_first_bytes(object_key, n=1024)
            if not head_bytes:
                raise ValidationError("Could not read uploaded object")
            validate_magic_bytes(head_bytes, declared_content_type=declared_ct)
        except ValidationError:
            storage.delete_object(object_key)
            raise

        # Re-encode through Pillow to strip metadata + defeat polyglot payloads.
        # Best-effort: if Pillow isn't installed, this is a no-op.
        try:
            full_bytes = storage.fetch_object(object_key)
            if full_bytes:
                cleaned, _ = reencode_image(
                    full_bytes, content_type=declared_ct, max_dimension=2048
                )
                if cleaned != full_bytes:
                    # Overwrite the S3 object with the cleaned version.
                    storage.put_bytes(
                        key=object_key,
                        data=cleaned,
                        content_type=declared_ct,
                    )
        except ValidationError:
            # reencode_image raises ValidationError if the bytes don't decode
            # as an image — that's a hostile upload.
            storage.delete_object(object_key)
            raise

        return self._set_avatar_key(db, user_id=user_id, key=object_key)

    def _set_avatar_key(self, db: Session, *, user_id: int, key: str) -> UserProfile:
        profile = self.get_or_create(db, user_id)
        old_key = profile.avatar_url if profile.avatar_url and storage.looks_like_object_key(profile.avatar_url) else None
        profile.avatar_url = key
        db.commit()
        db.refresh(profile)
        if old_key and old_key != key:
            storage.delete_object(old_key)
        return profile

    def clear_avatar(self, db: Session, user_id: int) -> UserProfile:
        profile = self.get_or_create(db, user_id)
        old_key = profile.avatar_url if profile.avatar_url and storage.looks_like_object_key(profile.avatar_url) else None
        profile.avatar_url = None
        db.commit()
        db.refresh(profile)
        if old_key:
            storage.delete_object(old_key)
        return profile

    # ── Resume ──────────────────────────────────────────────────────────
    def upload_resume(
        self, db: Session, *, user_id: int, file_bytes: bytes, content_type: str
    ) -> UserProfile:
        if not storage.is_configured():
            raise StorageNotConfigured()
        if content_type not in RESUME_CONTENT_TYPES:
            raise ValidationError("Only PDF and Word documents are accepted")
        if len(file_bytes) > MAX_SIZE_RESUME:
            raise ValidationError(f"Resume exceeds {MAX_SIZE_RESUME} bytes")

        # Magic-byte validation. Word .docx is a zip — we don't have a
        # signature for it in our table, so we only enforce magic bytes when
        # we have a known signature (currently: PDF). Word docs go through.
        from app.core.file_validation import detect_content_type

        if content_type == "application/pdf":
            detected = detect_content_type(file_bytes[:1024])
            if detected != "application/pdf":
                raise ValidationError(
                    "File claims to be a PDF but its contents say otherwise."
                )

        key = storage.resume_key(user_id, content_type)
        storage.put_bytes(key=key, data=file_bytes, content_type=content_type)

        profile = self.get_or_create(db, user_id)
        old_key = profile.resume_url if profile.resume_url and storage.looks_like_object_key(profile.resume_url) else None
        profile.resume_url = key
        db.commit()
        db.refresh(profile)
        if old_key:
            storage.delete_object(old_key)
        return profile

    # ── Stats ───────────────────────────────────────────────────────────
    def get_stats(self, db: Session, user_id: int) -> dict:
        profile = db.get(UserProfile, user_id)
        xp = profile.xp if profile else 0
        level = (xp // self.XP_PER_LEVEL) + 1

        solved = db.execute(
            text(
                """
                SELECT COUNT(DISTINCT problem_id) FROM problem_submissions
                WHERE user_id = :uid AND status = 'accepted'
                """
            ),
            {"uid": user_id},
        ).scalar() or 0

        rank = self._compute_rank(db, user_id, solved)

        courses_completed = db.execute(
            text(
                """
                SELECT COUNT(*) FROM activity_logs
                WHERE user_id = :uid AND action = 'course_completed'
                """
            ),
            {"uid": user_id},
        ).scalar() or 0

        # Difficulty breakdown
        difficulty_breakdown = db.execute(
            text(
                """
                SELECT p.difficulty, COUNT(DISTINCT s.problem_id)
                FROM problem_submissions s
                JOIN problems p ON s.problem_id = p.id
                WHERE s.user_id = :uid AND s.status = 'accepted'
                GROUP BY p.difficulty
                """
            ),
            {"uid": user_id},
        ).all()

        counts = { "Easy": 0, "Medium": 0, "Hard": 0 }
        for diff, count in difficulty_breakdown:
            if diff in counts:
                counts[diff] = count

        streak = self._compute_streak(db, user_id)

        return {
            "xp": xp,
            "level": level,
            "streak": streak,
            "rank": rank,
            "courses_completed": int(courses_completed),
            "problems_solved": int(solved),
            "easy_solved": counts["Easy"],
            "medium_solved": counts["Medium"],
            "hard_solved": counts["Hard"],
        }

    def _compute_rank(self, db: Session, user_id: int, my_solved: int) -> int:
        """Rank = number of users with strictly more solves + 1."""
        if my_solved == 0:
            # Special case: people with 0 solves all share the bottom rank.
            total = db.execute(
                text(
                    """
                    SELECT COUNT(DISTINCT user_id) FROM problem_submissions
                    WHERE status = 'accepted' AND user_id IS NOT NULL
                    """
                )
            ).scalar() or 0
            return int(total) + 1

        ahead = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM (
                    SELECT user_id, COUNT(DISTINCT problem_id) AS cnt
                    FROM problem_submissions
                    WHERE status = 'accepted'
                    GROUP BY user_id
                    HAVING COUNT(DISTINCT problem_id) > :my_cnt
                ) t
                """
            ),
            {"my_cnt": my_solved},
        ).scalar() or 0
        return int(ahead) + 1

    def _compute_streak(self, db: Session, user_id: int) -> int:
        """Count consecutive days (ending today or yesterday) with activity.

        Portable across Postgres and SQLite — we ask the DB only for raw
        timestamps within a 60-day window, then bucket them into UTC dates
        in Python. This avoids dialect-specific date functions.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=60)
        rows = db.execute(
            text(
                """
                SELECT created_at FROM activity_logs
                WHERE user_id = :uid AND created_at >= :cutoff
                """
            ),
            {"uid": user_id, "cutoff": cutoff},
        ).fetchall()

        if not rows:
            return 0

        days = set()
        for (ts,) in rows:
            if ts is None:
                continue
            # Normalize to UTC-naive date.
            if isinstance(ts, str):
                # Some dialects (SQLite) return ISO strings; parse defensively.
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            days.add(ts.astimezone(timezone.utc).date())

        if not days:
            return 0

        today = datetime.now(timezone.utc).date()
        # Streak is "alive" if today or yesterday has activity.
        if today not in days and (today - timedelta(days=1)) not in days:
            return 0

        streak = 0
        cursor = today if today in days else (today - timedelta(days=1))
        while cursor in days:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    def get_activity(self, db: Session, user_id: int, days: int = 70) -> list[dict]:
        """Return per-day activity counts. Bucketed in Python for portability."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        rows = db.execute(
            text(
                """
                SELECT created_at FROM activity_logs
                WHERE user_id = :uid AND created_at >= :cutoff
                """
            ),
            {"uid": user_id, "cutoff": cutoff},
        ).fetchall()

        counts: dict[str, int] = {}
        for (ts,) in rows:
            if ts is None:
                continue
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            day_str = ts.astimezone(timezone.utc).date().isoformat()
            counts[day_str] = counts.get(day_str, 0) + 1
        return [{"date": d, "count": c} for d, c in sorted(counts.items())]

    # ── XP & badges ─────────────────────────────────────────────────────
    def award_xp(self, db: Session, *, user_id: int, amount: int) -> int:
        profile = self.get_or_create(db, user_id)
        profile.xp = (profile.xp or 0) + amount
        db.commit()
        db.refresh(profile)
        return profile.xp

    def _grant_badge(self, db: Session, user_id: int, badge_key: str) -> None:
        """Atomic upsert — safe under concurrent grants."""
        stmt = (
            pg_insert(UserAchievement)
            .values(user_id=user_id, badge_key=badge_key)
            .on_conflict_do_nothing(index_elements=["user_id", "badge_key"])
        )
        db.execute(stmt)
        db.commit()

    def evaluate_achievements(self, db: Session, user_id: int) -> list[str]:
        """Re-check all conditions; grant any not-yet-earned. Returns granted keys."""
        profile = db.get(UserProfile, user_id)

        solved = db.execute(
            text(
                "SELECT COUNT(DISTINCT problem_id) FROM problem_submissions "
                "WHERE user_id = :uid AND status = 'accepted'"
            ),
            {"uid": user_id},
        ).scalar() or 0

        streak = self._compute_streak(db, user_id)
        courses = db.execute(
            text(
                "SELECT COUNT(*) FROM activity_logs "
                "WHERE user_id = :uid AND action = 'course_completed'"
            ),
            {"uid": user_id},
        ).scalar() or 0

        conditions = {
            "first_solve": solved >= 1,
            "ten_solves": solved >= 10,
            "fifty_solves": solved >= 50,
            "hundred_solves": solved >= 100,
            "streak_7": streak >= 7,
            "streak_30": streak >= 30,
            "first_course": courses >= 1,
            "profile_complete": bool(profile and profile.bio and profile.location),
        }
        granted: list[str] = []
        for key, met in conditions.items():
            if met:
                self._grant_badge(db, user_id, key)
                granted.append(key)
        return granted

    def list_achievements(self, db: Session, user_id: int) -> list[dict]:
        rows = (
            db.query(UserAchievement)
            .filter(UserAchievement.user_id == user_id)
            .order_by(UserAchievement.earned_at)
            .all()
        )
        result = []
        for row in rows:
            meta = BADGE_CATALOGUE.get(row.badge_key, {})
            result.append(
                {
                    "badge_key": row.badge_key,
                    "label": meta.get("label", row.badge_key),
                    "description": meta.get("description", ""),
                    "icon": meta.get("icon", "🏅"),
                    "color": meta.get("color", "#6366f1"),
                    "earned_at": row.earned_at,
                }
            )
        return result


profile_service = ProfileService()
