"""Reels background worker — `python -m app.reels.worker`.

Long-polls the SQS queue (REELS_SQS_QUEUE_URL) and runs the post-publish
enhancement pipeline (HLS transcode + Whisper transcription) for each reel.
Runs as its own container in dev (docker compose) and as an ECS Fargate
service in prod.

Reels are already live by the time a message lands here, so the worker is a
best-effort enhancer: a crash or restart loses no published content, and SQS
redelivery retries any reel whose processing didn't finish.

For local dev without SQS, set REELS_WORKER_INLINE=true on the API instead —
the pipeline then runs in-process and this worker isn't needed.
"""
from __future__ import annotations

import json
import logging
import signal
import sys
import time

from app.core.config import get_settings
from app.core.logging_config import configure_logging
from app.reels.services.processor import process_reel

logger = logging.getLogger(__name__)

_running = True


def _stop(signum, _frame):
    global _running
    logger.info("reels.worker: received signal %s; draining and exiting", signum)
    _running = False


def main() -> int:
    try:
        configure_logging()
    except Exception:  # logging is best-effort; never block the worker on it
        logging.basicConfig(level=logging.INFO)

    settings = get_settings()
    queue_url = settings.REELS_SQS_QUEUE_URL
    if not queue_url:
        # Dev / not-yet-configured: idle instead of exiting. Exiting would
        # crash-loop under `restart: unless-stopped` and spam logs. In dev,
        # processing runs in-process on the API via REELS_WORKER_INLINE=true,
        # so this worker simply has nothing to do.
        logger.warning("reels.worker: REELS_SQS_QUEUE_URL not set; idling "
                       "(set it to consume, or use REELS_WORKER_INLINE on the API for dev)")
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
        while _running:
            time.sleep(5)
        return 0

    import boto3

    sqs = boto3.client("sqs", region_name=settings.AWS_REGION)
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    logger.info("reels.worker: polling %s", queue_url)

    while _running:
        resp = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,      # long poll
            VisibilityTimeout=600,   # 10 min to transcode/transcribe
        )
        for msg in resp.get("Messages", []):
            receipt = msg["ReceiptHandle"]
            try:
                body = json.loads(msg["Body"])
                reel_id = int(body["reel_id"])
            except (KeyError, ValueError, json.JSONDecodeError):
                logger.exception("reels.worker: bad message; deleting %s", msg.get("MessageId"))
                sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt)
                continue

            try:
                process_reel(reel_id)
            except Exception:
                # Leave the message un-deleted: SQS redelivers after the
                # visibility timeout, and a DLQ catches the poison pill.
                logger.exception("reels.worker: processing reel %s failed; will retry", reel_id)
                continue

            sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt)

    logger.info("reels.worker: stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
