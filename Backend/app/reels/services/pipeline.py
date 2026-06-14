"""Async processing pipeline — enqueue HLS transcode + Whisper transcription.

Direct-publish policy: a reel is already LIVE (status=approved, published_at
set) by the time this runs. The pipeline only ENHANCES the reel afterwards —
it adds an adaptive-bitrate HLS rendition and auto-captions. It never gates
publication, so a slow or failed pipeline never blocks a creator.

Three enqueue strategies, chosen by config (in priority order):

1. SQS  (REELS_SQS_QUEUE_URL set) — production. A separate `reels-worker`
   process (`python -m app.reels.worker`) long-polls the queue and runs
   `process_reel`. This is the only mode that survives an API restart.

2. INLINE thread (REELS_WORKER_INLINE=true) — dev convenience. Runs the
   pipeline in a daemon thread inside the API process so Whisper captions
   light up locally without standing up SQS + a worker. Lost on restart.

3. NO-OP (nothing configured) — the reel stays a progressive-MP4 with no
   auto-captions. Fully functional; just un-enhanced.
"""
from __future__ import annotations

import json
import logging
import threading

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def enqueue_processing(reel_id: int) -> None:
    """Hand a freshly-published reel to the async enhancement pipeline."""
    settings = get_settings()

    if settings.REELS_SQS_QUEUE_URL:
        try:
            import boto3

            sqs = boto3.client("sqs", region_name=settings.AWS_REGION)
            sqs.send_message(
                QueueUrl=settings.REELS_SQS_QUEUE_URL,
                MessageBody=json.dumps({"reel_id": reel_id}),
            )
            logger.info("reels.pipeline: enqueued reel %s to SQS", reel_id)
            return
        except Exception:  # never let enqueue failure surface to the creator
            logger.exception("reels.pipeline: SQS enqueue failed for reel %s", reel_id)
            return

    if settings.REELS_WORKER_INLINE:
        # Daemon thread: the reel is already live, so this is best-effort.
        t = threading.Thread(target=_run_inline, args=(reel_id,),
                             name=f"reel-process-{reel_id}", daemon=True)
        t.start()
        logger.info("reels.pipeline: processing reel %s inline (dev)", reel_id)
        return

    logger.info("reels.pipeline: reel %s live; no async pipeline configured (no-op)", reel_id)


def _run_inline(reel_id: int) -> None:
    from app.reels.services.processor import process_reel

    try:
        process_reel(reel_id)
    except Exception:
        logger.exception("reels.pipeline: inline processing failed for reel %s", reel_id)
