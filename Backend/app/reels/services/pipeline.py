"""Async processing pipeline — HLS transcode + Whisper transcription.

v1 ships WITHOUT these wired: reels play as progressive MP4 via presigned
URLs the moment they're approved, and transcripts can be supplied manually
(creator paste or moderator edit). The product works end-to-end without
this file doing anything.

Wire-up plan for the developer (in priority order):

1. TRANSCRIPTION (do this first — cheap, high leverage)
   - Worker: S3 event or a cron picking reels with status='pending' and no
     ReelTranscript row.
   - Run faster-whisper (CPU is fine for <5-min clips) on the object.
   - Insert ReelTranscript(generated_by='whisper'), store the .vtt next to
     the video (vtt_object_key), and the search + anchor-suggest endpoints
     light up automatically.

2. HLS (do when global playback metrics demand it)
   - AWS MediaConvert job template: HLS, 240/480/720/1080 ladder,
     output to users/{uid}/reels/hls/{reel_id}/.
   - CloudFront distribution in front of the bucket path; signed cookies.
   - On job completion, set Reel.hls_url to the master playlist URL.
     to_out() already prefers hls_url when present — no other change.

3. RISK CHECKS (before opening uploads broadly)
   - Duplicate: pHash a few keyframes; compare against existing reels.
   - Audio fingerprint vs known platforms is a paid API (e.g. ACRCloud) —
     defer until copyright complaints actually appear.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def enqueue_processing(reel_id: int) -> None:
    """Hook called after a reel row is created.

    Replace the body with a real enqueue (SQS message / Celery task /
    arq job). Keeping it a no-op means uploads flow straight to the
    moderation queue, which is the correct v1 behavior.
    """
    logger.info("reels.pipeline: reel %s ready for async processing (no-op)", reel_id)
