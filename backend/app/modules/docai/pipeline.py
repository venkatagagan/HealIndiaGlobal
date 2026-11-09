"""Page preparation for the Claude call (PLAN 7.1).

Every page is identified by its magic bytes (never by the stored content type or file name):

* images (JPEG/PNG/WebP/HEIC/HEIF) -> decoded with Pillow (+ pillow-heif), EXIF orientation applied, converted
  to RGB, re-built from raw pixels so that NO metadata survives (EXIF, GPS, XMP, ICC, comments), downscaled to
  at most ``MAX_LONG_EDGE`` px on the long edge and re-encoded as JPEG q85; cheap quality heuristics (dark,
  low contrast, blurry, low resolution) produce human-readable ``issues``;
* PDFs -> passed through unchanged as ``document`` blocks (at most 32 MB, not password-protected);
* DICOM -> :class:`PageError` with ``unsupported=True`` (the radiologist's report must be uploaded instead).

All functions here are synchronous and CPU-bound; callers run :func:`prepare_page` in a worker thread.
"""

from __future__ import annotations

import io
import re
import uuid
from dataclasses import dataclass, field
from typing import Literal

import structlog
from PIL import Image, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError

from app.modules.documents.validation import detect_type

logger = structlog.get_logger(__name__)

try:  # HEIC/HEIF photos from iPhones; the opener registration is idempotent.
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_SUPPORTED = True
except ImportError:  # pragma: no cover - pillow-heif is a declared dependency
    HEIF_SUPPORTED = False

MAX_LONG_EDGE = 1568
JPEG_QUALITY = 85
MAX_PDF_BYTES = 32 * 1024 * 1024
MAX_PDF_PAGES = 100
# Claude API request limit is 32 MB; base64 inflates by 4/3 and the prompt needs a little room.
MAX_ENCODED_REQUEST_BYTES = 31 * 1024 * 1024
MAX_SOURCE_PIXELS = 80_000_000  # refuse absurd images before decoding them (decompression bombs)

# Quality heuristics on the 8-bit grayscale of the prepared image (calibrated on synthetic document photos).
DARK_MEAN_MAX = 60.0
LOW_CONTRAST_STDDEV_MAX = 18.0
BLUR_EDGE_VARIANCE_MAX = 40.0
LOW_RESOLUTION_LONG_EDGE = 640

IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"})
PDF_TYPE = "application/pdf"
DICOM_TYPE = "application/dicom"

DICOM_MESSAGE = (
    "DICOM scan files (CT/MRI/X-ray image data) cannot be read automatically. Please upload the "
    "radiologist's report instead (a PDF or a photo of the printed report)."
)

_PDF_PAGE_RE = re.compile(rb"/Type\s*/Page(?![A-Za-z])")
_LAPLACIAN = ImageFilter.Kernel((3, 3), (0, 1, 0, 1, -4, 1, 0, 1, 0), scale=1, offset=128)


class PageError(Exception):
    """A page that cannot be sent to the model. ``str(exc)`` is safe to show to the patient."""

    def __init__(self, message: str, *, unsupported: bool = False) -> None:
        super().__init__(message)
        self.unsupported = unsupported


@dataclass(slots=True)
class PreparedPage:
    """One uploaded file, ready to become a Claude ``image`` or ``document`` block."""

    number: int  # 1-based position in the report
    document_id: uuid.UUID
    kind: Literal["image", "pdf"]
    media_type: str  # "image/jpeg" or "application/pdf"
    data: bytes
    page_count: int = 1  # PDFs: estimated number of pages (at least 1)
    width: int | None = None
    height: int | None = None
    issues: list[str] = field(default_factory=list)

    @property
    def encoded_size(self) -> int:
        return (len(self.data) + 2) // 3 * 4


# ------------------------------------------------------------------------------------------- detection
def detect_kind(data: bytes) -> Literal["image", "pdf", "dicom"] | None:
    """Classify by magic bytes using the same allowlist as uploads (``documents.validation``)."""
    detected = detect_type(data)
    if detected is None:
        return None
    mime = detected[0]
    if mime == DICOM_TYPE:
        return "dicom"
    if mime == PDF_TYPE:
        return "pdf"
    if mime in IMAGE_TYPES:
        return "image"
    return None


# ------------------------------------------------------------------------------------------- images
def _to_rgb(img: Image.Image) -> Image.Image:
    """RGB with transparency flattened onto white (screenshots/PNGs with alpha)."""
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def _strip_metadata(img: Image.Image) -> Image.Image:
    """A brand-new image built from the raw pixels only: nothing from ``img.info`` (EXIF/GPS/XMP/ICC/...)."""
    return Image.frombytes("RGB", img.size, img.tobytes())


def quality_issues(img: Image.Image, *, original_long_edge: int) -> list[str]:
    """Heuristic photo-quality hints (never blocking). ``img`` is the prepared RGB image."""
    gray = img.convert("L")
    stat = ImageStat.Stat(gray)
    mean, stddev = float(stat.mean[0]), float(stat.stddev[0])
    issues: list[str] = []
    if mean < DARK_MEAN_MAX:
        issues.append("The photo is very dark - retake it in good light.")
    if stddev < LOW_CONTRAST_STDDEV_MAX:
        issues.append("The photo has very low contrast (faded or washed out) - parts may be unreadable.")
    else:
        edge_variance = float(ImageStat.Stat(gray.filter(_LAPLACIAN)).var[0])
        if edge_variance < BLUR_EDGE_VARIANCE_MAX:
            issues.append(
                "The photo looks blurry - hold the phone steady and make sure the text is in focus."
            )
    if original_long_edge < LOW_RESOLUTION_LONG_EDGE:
        issues.append("The image resolution is low - small print may not be readable.")
    return issues


def prepare_image(data: bytes, number: int, document_id: uuid.UUID) -> PreparedPage:
    """Decode, orient, strip metadata, downscale and re-encode one image page as JPEG."""
    try:
        with Image.open(io.BytesIO(data)) as opened:  # raises DecompressionBombError for absurd sizes
            width, height = opened.size
            if width * height > MAX_SOURCE_PIXELS:
                raise PageError(f"Page {number} is an unusually large image. Please upload a smaller photo.")
            opened.seek(0)  # multi-image HEIC/WebP: the primary image
            oriented = ImageOps.exif_transpose(opened) or opened
            rgb = _to_rgb(oriented)
            original_long_edge = max(rgb.size)
            if original_long_edge > MAX_LONG_EDGE:
                scale = MAX_LONG_EDGE / original_long_edge
                target = (max(1, round(rgb.width * scale)), max(1, round(rgb.height * scale)))
                rgb = rgb.resize(target, Image.Resampling.LANCZOS)
            clean = _strip_metadata(rgb)
    except PageError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise PageError(f"Page {number} could not be opened as an image. Please upload it again.") from exc
    except (OSError, ValueError, SyntaxError) as exc:  # truncated/corrupt files raise OSError/SyntaxError
        logger.info("docai.image_decode_failed", page=number, error=type(exc).__name__)
        raise PageError(f"Page {number} could not be opened as an image. Please upload it again.") from exc

    issues = [
        f"Page {number}: {issue}" for issue in quality_issues(clean, original_long_edge=original_long_edge)
    ]
    out = io.BytesIO()
    clean.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return PreparedPage(
        number=number,
        document_id=document_id,
        kind="image",
        media_type="image/jpeg",
        data=out.getvalue(),
        width=clean.width,
        height=clean.height,
        issues=issues,
    )


# ------------------------------------------------------------------------------------------- PDFs
def count_pdf_pages(data: bytes) -> int:
    """Best-effort page count (page objects in compressed object streams are not visible: returns 0)."""
    return len(_PDF_PAGE_RE.findall(data))


def prepare_pdf(data: bytes, number: int, document_id: uuid.UUID) -> PreparedPage:
    if len(data) > MAX_PDF_BYTES:
        raise PageError(f"Page {number} is a PDF larger than 32 MB. Please upload a smaller file.")
    if b"/Encrypt" in data[-65536:] or b"/Encrypt" in data[:65536]:  # trailer / linearized first-page trailer
        raise PageError(f"Page {number} is a password-protected PDF. Please upload an unprotected copy.")
    pages = count_pdf_pages(data)
    if pages > MAX_PDF_PAGES:
        raise PageError(
            f"Page {number} is a PDF with {pages} pages. Please upload only the relevant pages "
            f"(at most {MAX_PDF_PAGES})."
        )
    return PreparedPage(
        number=number,
        document_id=document_id,
        kind="pdf",
        media_type=PDF_TYPE,
        data=data,
        page_count=max(1, pages),
    )


# ------------------------------------------------------------------------------------------- entry point
def prepare_page(data: bytes, number: int, document_id: uuid.UUID) -> PreparedPage:
    """Prepare one uploaded file. Raises :class:`PageError` (``unsupported=True`` for DICOM/unknown types)."""
    kind = detect_kind(data)
    if kind == "dicom":
        raise PageError(DICOM_MESSAGE, unsupported=True)
    if kind == "pdf":
        return prepare_pdf(data, number, document_id)
    if kind == "image":
        return prepare_image(data, number, document_id)
    raise PageError(
        f"Page {number} is not a supported file type. Upload a PDF or a photo (JPEG, PNG, WebP or HEIC).",
        unsupported=True,
    )


def check_request_size(pages: list[PreparedPage]) -> None:
    """The whole request (base64 content) must stay under the API's 32 MB limit."""
    total = sum(p.encoded_size for p in pages)
    if total > MAX_ENCODED_REQUEST_BYTES:
        raise PageError(
            "This report is too large to read in one go (over 32 MB). Upload fewer pages or smaller files."
        )
