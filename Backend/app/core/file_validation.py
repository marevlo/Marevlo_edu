"""
File upload type validation.

Two complementary defenses against "bad file disguised as good":

  1. Magic-byte sniffing. The first few bytes of every common file format
     are a stable signature. We sniff them server-side and reject if they
     don't match the declared Content-Type. This catches a .exe renamed
     to .jpg without us needing to trust the client.

  2. Image re-encoding. For images, the strongest defense is to re-encode
     the file via Pillow. Stripping all metadata + re-running pixels
     through libjpeg/libpng defeats the vast majority of polyglot/embedded
     payload attacks. Optional but recommended.

We do NOT do full antivirus scanning here. ClamAV is heavy and our threat
model — non-public-content uploads on a small EdTech platform — doesn't
warrant it. AWS S3 has optional Macie / GuardDuty Malware Protection that
can be enabled at the bucket level for ~$0.30/GB if we ever need it.
"""
from __future__ import annotations

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# Magic byte signatures. (offset, prefix_bytes) — prefix must match starting at offset.
# We keep this list narrow on purpose: any extension we accept must have an
# entry here so unknown types get rejected.
MAGIC_SIGNATURES: dict[str, list[tuple[int, bytes]]] = {
    "image/jpeg": [
        (0, b"\xff\xd8\xff"),  # SOI marker — covers JFIF, EXIF, raw
    ],
    "image/png": [
        (0, b"\x89PNG\r\n\x1a\n"),
    ],
    "image/webp": [
        (0, b"RIFF"),  # plus WEBP at offset 8 — checked below
    ],
    "image/gif": [
        (0, b"GIF87a"),
        (0, b"GIF89a"),
    ],
    "application/pdf": [
        (0, b"%PDF-"),
    ],
}


def detect_content_type(data: bytes) -> Optional[str]:
    """Best-effort sniffing of the actual content-type from the first bytes.

    Returns the matching MIME type, or None if no signature matched.
    Only the first 16 bytes need to be present.
    """
    if not data or len(data) < 4:
        return None

    for ctype, sigs in MAGIC_SIGNATURES.items():
        for offset, prefix in sigs:
            if data[offset : offset + len(prefix)] == prefix:
                # WebP needs a secondary check.
                if ctype == "image/webp":
                    if len(data) >= 12 and data[8:12] == b"WEBP":
                        return ctype
                    continue
                return ctype
    return None


def validate_magic_bytes(
    data: bytes,
    *,
    declared_content_type: str,
) -> None:
    """Raise ValidationError if the magic bytes don't match the declared type.

    `data` should be the first ≥12 bytes of the file. For S3 objects, fetch
    a small Range request rather than the entire file.
    """
    from app.core.exceptions import ValidationError

    detected = detect_content_type(data)
    if detected is None:
        raise ValidationError(
            "Uploaded file is not a recognised image or PDF format. "
            "Allowed: JPEG, PNG, WebP, GIF, PDF."
        )
    if detected != declared_content_type:
        raise ValidationError(
            f"Uploaded file claims to be {declared_content_type} but its contents are {detected}. "
            "Refusing — please re-upload as the correct file type."
        )


def reencode_image(
    data: bytes,
    *,
    content_type: str,
    max_dimension: int = 2048,
) -> tuple[bytes, str]:
    """Re-encode an image through Pillow to strip metadata and defeat
    polyglots. Returns (new_bytes, output_content_type).

    Conservative defaults: keeps the same format, downsizes if the image
    exceeds `max_dimension` on either axis, strips all metadata.

    Pillow is an optional dependency. If it isn't installed, this becomes
    a no-op (returns the input unchanged) and logs a warning.
    """
    try:
        from PIL import Image, ImageOps
    except ImportError:
        logger.warning("pillow_not_installed image_reencode_skipped")
        return data, content_type

    try:
        img = Image.open(io.BytesIO(data))
        # Apply EXIF orientation, then strip the EXIF.
        img = ImageOps.exif_transpose(img)
        # Downsize if huge.
        if max(img.size) > max_dimension:
            img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        if content_type == "image/jpeg":
            # Convert to RGB if needed (JPEG can't store alpha).
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(out, format="JPEG", quality=88, optimize=True)
        elif content_type == "image/png":
            img.save(out, format="PNG", optimize=True)
        elif content_type == "image/webp":
            img.save(out, format="WEBP", quality=88, method=4)
        elif content_type == "image/gif":
            img.save(out, format="GIF", optimize=True)
        else:
            return data, content_type
        return out.getvalue(), content_type
    except Exception as exc:
        # Any decoding failure means the file isn't really an image.
        logger.warning("image_reencode_failed err=%s", exc)
        from app.core.exceptions import ValidationError

        raise ValidationError(
            "Uploaded file could not be decoded as an image. Please try a different file."
        ) from exc
