"""Auto-transcription via faster-whisper.

Downloads the reel's video from S3, runs faster-whisper (CPU is fine for the
≤5-min clips reels allow), and persists both a plain-text transcript row and a
WebVTT caption file (uploaded next to the video). Once a ReelTranscript exists,
search, in-player captions, and MIRA "explain this" all light up automatically.

Idempotent: a reel that already has a transcript is left untouched (a creator
may have pasted one manually, which we never overwrite).

faster-whisper is an optional dependency — if it isn't installed the step logs
and returns without error (the reel simply has no auto-captions).
"""
from __future__ import annotations

import logging
import os
import tempfile

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.storage import storage
from app.reels.models.reel import Reel, ReelTranscript

logger = logging.getLogger(__name__)


def transcribe_reel(db: Session, reel: Reel) -> None:
    if reel.transcript is not None:
        logger.info("reels.transcribe: reel %s already has a transcript; skipping", reel.id)
        return

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.warning("reels.transcribe: faster-whisper not installed; skipping reel %s", reel.id)
        return

    data = storage.fetch_object(reel.video_object_key)
    if not data:
        raise RuntimeError(f"video object missing for reel {reel.id}")

    settings = get_settings()
    ext = os.path.splitext(reel.video_object_key)[1] or ".mp4"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as fh:
            fh.write(data)
            tmp_path = fh.name

        model = WhisperModel(
            settings.WHISPER_MODEL,
            device=settings.WHISPER_DEVICE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
        )
        segments, _info = model.transcribe(tmp_path)
        segments = list(segments)

        text = " ".join(s.text.strip() for s in segments).strip()
        if not text:
            logger.info("reels.transcribe: reel %s produced empty transcript", reel.id)
            return

        vtt = _to_vtt(segments)
        vtt_key = f"users/{reel.user_id}/reels/captions/{reel.id}.vtt"
        try:
            storage.put_bytes(key=vtt_key, data=vtt.encode("utf-8"), content_type="text/vtt")
        except Exception:  # caption file is a bonus; keep the text transcript regardless
            logger.exception("reels.transcribe: failed to upload vtt for reel %s", reel.id)
            vtt_key = None

        db.add(ReelTranscript(
            reel_id=reel.id, transcript_text=text, vtt_object_key=vtt_key,
            language=reel.language, generated_by="whisper", reviewed=False,
        ))
        db.commit()
        logger.info("reels.transcribe: reel %s transcribed (%d chars)", reel.id, len(text))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _fmt_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def _to_vtt(segments) -> str:
    lines = ["WEBVTT", ""]
    for seg in segments:
        lines.append(f"{_fmt_ts(seg.start)} --> {_fmt_ts(seg.end)}")
        lines.append(seg.text.strip())
        lines.append("")
    return "\n".join(lines)
