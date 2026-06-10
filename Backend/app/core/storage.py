"""
S3 storage layer.

Design:
- All asset paths follow `users/{user_id}/{kind}/{uuid}.{ext}` so a single
  IAM policy (`Resource: arn:aws:s3:::<bucket>/users/*`) covers everything.
- Presigned GETs are cached in-process — we sign one URL per S3 object per
  process, valid for `S3_PRESIGN_TTL_GET_SECONDS`. This eliminates the per-
  feed-render burst of S3 API calls.
- Presigned PUTs are unique per upload (signed with Content-Length + Content-Type).
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
from cachetools import TTLCache

from app.core.config import get_settings
from app.core.exceptions import StorageNotConfigured

logger = logging.getLogger(__name__)

# ── Asset policy ────────────────────────────────────────────────────────
MAX_SIZE_AVATAR = 2 * 1024 * 1024
MAX_SIZE_RESUME = 5 * 1024 * 1024
MAX_SIZE_POST_IMAGE = 5 * 1024 * 1024
MAX_POST_IMAGES = 10

AVATAR_CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")
RESUME_CONTENT_TYPES = (
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
)
POST_IMAGE_CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")

_EXT_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}


class S3Storage:
    """Thin OOP wrapper around boto3 with caching and policy enforcement."""

    def __init__(self) -> None:
        self._client = None
        settings = get_settings()
        self._cache: TTLCache = TTLCache(
            maxsize=settings.S3_PRESIGN_CACHE_SIZE,
            ttl=max(60, settings.S3_PRESIGN_TTL_GET_SECONDS - 300),  # rotate before expiry
        )

    # ── Internals ───────────────────────────────────────────────────────
    @property
    def _s3(self):
        if self._client is None:
            settings = get_settings()
            self._client = boto3.client(
                "s3",
                region_name=settings.AWS_REGION,
                endpoint_url=settings.S3_ENDPOINT_URL,
                config=BotoConfig(signature_version="s3v4"),
            )
        return self._client

    def _bucket(self) -> str:
        bucket = get_settings().S3_BUCKET
        if not bucket:
            raise StorageNotConfigured()
        return bucket

    # ── Configuration check ─────────────────────────────────────────────
    def is_configured(self) -> bool:
        return bool(get_settings().S3_BUCKET)

    # ── Key builders ────────────────────────────────────────────────────
    @staticmethod
    def _ext(content_type: str, default: str) -> str:
        return _EXT_BY_TYPE.get(content_type, default)

    def avatar_key(self, user_id: int | str, content_type: str) -> str:
        return f"users/{user_id}/avatar/{uuid.uuid4().hex}.{self._ext(content_type, 'jpg')}"

    def resume_key(self, user_id: int | str, content_type: str) -> str:
        return f"users/{user_id}/resume/{uuid.uuid4().hex}.{self._ext(content_type, 'pdf')}"

    def post_image_key(self, user_id: int | str, content_type: str) -> str:
        return f"users/{user_id}/feed/{uuid.uuid4().hex}.{self._ext(content_type, 'jpg')}"

    @staticmethod
    def looks_like_object_key(value: str) -> bool:
        if not value:
            return False
        return not value.startswith(("http://", "https://", "/uploads/"))

    @staticmethod
    def key_belongs_to_user(key: str, user_id: int) -> bool:
        return key.startswith(f"users/{user_id}/")

    # ── Presigning ──────────────────────────────────────────────────────
    def presigned_put(self, *, key: str, content_type: str, max_size: int) -> str:
        settings = get_settings()
        return self._s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self._bucket(),
                "Key": key,
                "ContentType": content_type,
                "ContentLength": max_size,
            },
            ExpiresIn=settings.S3_PRESIGN_TTL_PUT_SECONDS,
        )

    def presigned_get(self, key: str) -> str:
        cached = self._cache.get(key)
        if cached:
            return cached
        settings = get_settings()
        url = self._s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": self._bucket(), "Key": key},
            ExpiresIn=settings.S3_PRESIGN_TTL_GET_SECONDS,
        )
        self._cache[key] = url
        return url

    def resolve_url(self, value: str | None) -> str | None:
        """Resolve a stored value (object key OR full URL) to a usable URL."""
        if not value:
            return None
        if self.looks_like_object_key(value):
            try:
                return self.presigned_get(value)
            except Exception as exc:
                logger.warning("presign_failed key=%s err=%s", value, exc)
                return None
        return value

    # ── Lifecycle ───────────────────────────────────────────────────────
    def head_object(self, key: str) -> Optional[dict]:
        try:
            return self._s3.head_object(Bucket=self._bucket(), Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey", "NotFound"):
                return None
            raise

    def fetch_first_bytes(self, key: str, *, n: int = 1024) -> Optional[bytes]:
        """Download just the first N bytes of an S3 object via Range header.

        Used to magic-byte-validate an upload without downloading the full
        object. None means the object isn't there.
        """
        try:
            resp = self._s3.get_object(
                Bucket=self._bucket(), Key=key, Range=f"bytes=0-{n - 1}"
            )
            return resp["Body"].read()
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey", "NotFound"):
                return None
            raise

    def fetch_object(self, key: str) -> Optional[bytes]:
        """Download the full object body. Used by the image re-encode flow."""
        try:
            resp = self._s3.get_object(Bucket=self._bucket(), Key=key)
            return resp["Body"].read()
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("404", "NoSuchKey", "NotFound"):
                return None
            raise

    def put_bytes(self, *, key: str, data: bytes, content_type: str) -> None:
        self._s3.put_object(
            Bucket=self._bucket(),
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def delete_object(self, key: str) -> None:
        try:
            self._s3.delete_object(Bucket=self._bucket(), Key=key)
            # Evict the presign cache so no caller gets a stale URL pointing
            # at a now-deleted object.
            self._cache.pop(key, None)
        except ClientError as exc:
            logger.warning("s3_delete_failed key=%s err=%s", key, exc)


storage = S3Storage()
