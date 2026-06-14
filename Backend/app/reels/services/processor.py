"""Reel processing orchestrator — runs the post-publish enhancement steps.

Called by the worker (SQS) or the inline dev thread. Owns its own DB session
(it runs outside the request lifecycle). The reel is already live; everything
here is best-effort enhancement, so each step is isolated — a Whisper failure
never blocks the HLS job and vice-versa, and neither ever changes the reel's
published status.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.reels.models.reel import Reel

logger = logging.getLogger(__name__)


def process_reel(reel_id: int) -> None:
    db = SessionLocal()
    try:
        reel = db.query(Reel).filter(Reel.id == reel_id, Reel.deleted_at.is_(None)).first()
        if reel is None:
            logger.warning("reels.processor: reel %s not found / deleted; skipping", reel_id)
            return

        reel.processing_started_at = datetime.now(timezone.utc)
        reel.processing_error = None
        db.commit()

        errors: list[str] = []

        # 1. Transcription first — cheap, high leverage (search + captions + MIRA).
        try:
            from app.reels.services.transcribe import transcribe_reel

            transcribe_reel(db, reel)
        except Exception as exc:  # noqa: BLE001
            logger.exception("reels.processor: transcription failed for reel %s", reel_id)
            errors.append(f"transcribe: {exc}")

        # 2. HLS transcode — upgrades playback. Async on AWS side; this only
        #    submits the job (worker polls / a callback sets hls_url later) or
        #    runs synchronously depending on the transcode backend.
        try:
            from app.reels.services.transcode import transcode_reel

            transcode_reel(db, reel)
        except Exception as exc:  # noqa: BLE001
            logger.exception("reels.processor: transcode failed for reel %s", reel_id)
            errors.append(f"transcode: {exc}")

        reel.processing_completed_at = datetime.now(timezone.utc)
        reel.processing_error = " | ".join(errors) if errors else None
        db.commit()
        logger.info("reels.processor: reel %s done (errors=%d)", reel_id, len(errors))
    finally:
        db.close()
