"""HLS transcoding via AWS MediaConvert.

Submits a MediaConvert job that turns the uploaded MP4/WebM into an adaptive
HLS ladder (360p / 720p / 1080p) written under
    users/{uid}/reels/hls/{reel_id}/master.m3u8

MediaConvert is asynchronous: this function only SUBMITS the job. The reel's
`hls_url` is set when the job completes — either by the worker polling job
status, or (preferred in prod) an EventBridge → Lambda/endpoint callback that
calls `mark_hls_ready`. `to_out()` already prefers `hls_url` over the raw
object key, so once it's set, playback upgrades with no other change.

If MediaConvert isn't configured the step is a no-op: the reel keeps playing
as progressive MP4 via a presigned GET.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.reels.models.reel import Reel

logger = logging.getLogger(__name__)

# 3-rung ladder. height/bitrate pairs; MediaConvert picks the closest standard.
_LADDER = [
    (360, 800_000),
    (720, 2_500_000),
    (1080, 5_000_000),
]


def _hls_prefix(reel: Reel) -> str:
    return f"users/{reel.user_id}/reels/hls/{reel.id}"


def transcode_reel(db: Session, reel: Reel) -> None:
    settings = get_settings()
    if not (settings.MEDIACONVERT_ROLE_ARN and settings.S3_BUCKET):
        logger.info("reels.transcode: MediaConvert not configured; reel %s stays progressive MP4", reel.id)
        return

    import boto3

    mc = boto3.client(
        "mediaconvert",
        region_name=settings.AWS_REGION,
        endpoint_url=settings.MEDIACONVERT_ENDPOINT_URL,
    )

    src = f"s3://{settings.S3_BUCKET}/{reel.video_object_key}"
    dst = f"s3://{settings.S3_BUCKET}/{_hls_prefix(reel)}/"

    outputs = [{
        "NameModifier": f"_{h}p",
        "ContainerSettings": {"Container": "M3U8", "M3u8Settings": {}},
        "VideoDescription": {
            "Height": h,
            "CodecSettings": {
                "Codec": "H_264",
                "H264Settings": {"RateControlMode": "QVBR", "MaxBitrate": br},
            },
        },
        "AudioDescriptions": [{
            "CodecSettings": {"Codec": "AAC", "AacSettings": {
                "Bitrate": 96_000, "CodingMode": "CODING_MODE_2_0", "SampleRate": 48_000}},
        }],
    } for h, br in _LADDER]

    job = {
        "Role": settings.MEDIACONVERT_ROLE_ARN,
        "Settings": {
            "Inputs": [{
                "FileInput": src,
                "AudioSelectors": {"Audio Selector 1": {"DefaultSelection": "DEFAULT"}},
            }],
            "OutputGroups": [{
                "Name": "Apple HLS",
                "OutputGroupSettings": {
                    "Type": "HLS_GROUP_SETTINGS",
                    "HlsGroupSettings": {
                        "Destination": dst,
                        "SegmentLength": 6,
                        "MinSegmentLength": 0,
                    },
                },
                "Outputs": outputs,
            }],
        },
        "UserMetadata": {"reel_id": str(reel.id)},
    }
    if settings.MEDIACONVERT_QUEUE_ARN:
        job["Queue"] = settings.MEDIACONVERT_QUEUE_ARN

    resp = mc.create_job(**job)
    logger.info("reels.transcode: submitted MediaConvert job %s for reel %s",
                resp.get("Job", {}).get("Id"), reel.id)


def mark_hls_ready(db: Session, reel_id: int) -> None:
    """Call on MediaConvert job completion (callback or poll) to flip playback
    over to HLS. The master playlist path is deterministic from the reel id."""
    reel = db.query(Reel).filter(Reel.id == reel_id).first()
    if reel is None:
        logger.warning("reels.transcode: reel %s gone before HLS ready", reel_id)
        return
    settings = get_settings()
    master = f"{_hls_prefix(reel)}/master.m3u8"
    if settings.REELS_CDN_BASE_URL:
        reel.hls_url = f"{settings.REELS_CDN_BASE_URL.rstrip('/')}/{master}"
    else:
        reel.hls_url = master  # object key; resolve_url() will presign it
    db.commit()
    logger.info("reels.transcode: reel %s HLS ready -> %s", reel_id, reel.hls_url)
