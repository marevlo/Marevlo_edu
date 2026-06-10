"""
File upload validation tests.

Covers:
  - Magic-byte detection works for the formats we accept.
  - validate_magic_bytes raises on lying Content-Type.
  - Pillow re-encode strips bytes (size shrinks) and rejects garbage.
"""
import io

import pytest

from app.core.exceptions import ValidationError
from app.core.file_validation import (
    detect_content_type,
    reencode_image,
    validate_magic_bytes,
)


# ── Magic-byte detection ────────────────────────────────────────────────
def test_detect_jpeg():
    # SOI (FF D8 FF) + APP0 marker
    assert detect_content_type(b"\xff\xd8\xff\xe0\x00\x10JFIF") == "image/jpeg"


def test_detect_png():
    assert detect_content_type(b"\x89PNG\r\n\x1a\n....") == "image/png"


def test_detect_webp():
    assert detect_content_type(b"RIFF\x00\x00\x00\x00WEBP....") == "image/webp"


def test_detect_riff_without_webp_is_unknown():
    """RIFF without WEBP at offset 8 is some other RIFF format (e.g. WAV)."""
    assert detect_content_type(b"RIFF\x00\x00\x00\x00WAVE") is None


def test_detect_pdf():
    assert detect_content_type(b"%PDF-1.7\n...") == "application/pdf"


def test_detect_unknown():
    assert detect_content_type(b"random garbage that is not a known format") is None


def test_detect_empty():
    assert detect_content_type(b"") is None
    assert detect_content_type(b"\x00\x00") is None


# ── validate_magic_bytes ────────────────────────────────────────────────
def test_validate_passes_for_matching_type():
    validate_magic_bytes(b"\xff\xd8\xff\xe0", declared_content_type="image/jpeg")


def test_validate_rejects_lying_content_type():
    """Bytes are PNG but client claimed JPEG. Must reject."""
    with pytest.raises(ValidationError) as exc:
        validate_magic_bytes(
            b"\x89PNG\r\n\x1a\n", declared_content_type="image/jpeg"
        )
    assert "image/png" in str(exc.value).lower() or "claims" in str(exc.value).lower()


def test_validate_rejects_unknown_format():
    """Random bytes claiming to be JPEG → reject."""
    with pytest.raises(ValidationError):
        validate_magic_bytes(
            b"\x00MZHELLO this is not an image",
            declared_content_type="image/jpeg",
        )


# ── Pillow re-encode ────────────────────────────────────────────────────
def _make_png(size=(100, 100), color=(255, 0, 0)) -> bytes:
    """Helper: produce a small PNG with metadata."""
    from PIL import Image, PngImagePlugin

    img = Image.new("RGB", size, color)
    out = io.BytesIO()
    # Inject a custom text chunk (metadata) we expect to be stripped.
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "this metadata should be stripped on re-encode")
    img.save(out, format="PNG", pnginfo=info)
    return out.getvalue()


def test_reencode_strips_metadata():
    """A PNG with a tEXt chunk should come out smaller (no chunk)."""
    src = _make_png()
    cleaned, ct = reencode_image(src, content_type="image/png")
    assert ct == "image/png"
    # The text chunk we injected is "this metadata should be stripped on re-encode";
    # a clean output must NOT contain that string.
    assert b"this metadata should be stripped" not in cleaned


def test_reencode_downsizes_huge_image():
    """An image larger than max_dimension on either axis is downsized."""
    src = _make_png(size=(4000, 3000))
    cleaned, ct = reencode_image(src, content_type="image/png", max_dimension=1024)
    # Verify the cleaned image's pixel dimensions are within budget.
    from PIL import Image

    out_img = Image.open(io.BytesIO(cleaned))
    assert max(out_img.size) <= 1024


def test_reencode_rejects_garbage():
    """Non-image bytes raise ValidationError."""
    with pytest.raises(ValidationError):
        reencode_image(b"this is not an image at all", content_type="image/png")


def test_reencode_jpeg_roundtrip():
    """A JPEG round-trips and stays a JPEG."""
    from PIL import Image

    img = Image.new("RGB", (200, 200), (0, 128, 0))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=95)
    src = out.getvalue()

    cleaned, ct = reencode_image(src, content_type="image/jpeg")
    assert ct == "image/jpeg"
    # Magic bytes still say JPEG.
    assert cleaned[:3] == b"\xff\xd8\xff"
