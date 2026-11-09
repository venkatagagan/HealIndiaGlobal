"""Upload validation: magic-byte allowlist, safe display names and ``Content-Disposition`` values.

The client-declared content type and file extension are never trusted; the stored ``content_type`` is the one
detected from the file's leading bytes.
"""

from __future__ import annotations

import re
import unicodedata
from pathlib import PurePosixPath
from urllib.parse import quote

import filetype

# detected MIME type -> canonical extension
ALLOWED_TYPES: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heic",
    "application/dicom": "dcm",
}
_EXTENSION_ALIASES: dict[str, frozenset[str]] = {
    "pdf": frozenset({"pdf"}),
    "jpg": frozenset({"jpg", "jpeg", "jpe", "jfif"}),
    "png": frozenset({"png"}),
    "webp": frozenset({"webp"}),
    "heic": frozenset({"heic", "heif"}),
    "dcm": frozenset({"dcm", "dicom"}),
}
SNIFF_BYTES = 8192
_FORBIDDEN_NAME_CHARS = set('<>:"/\\|?*')


def detect_type(data: bytes) -> tuple[str, str] | None:
    """Return ``(mime, extension)`` for an allowed file type, else ``None``."""
    head = data[:SNIFF_BYTES]
    # DICOM Part 10: 128-byte preamble followed by the "DICM" prefix.
    if len(head) >= 132 and head[128:132] == b"DICM":
        return "application/dicom", "dcm"
    kind = filetype.guess(head)
    if kind is None:
        return None
    mime = str(kind.mime)
    ext = ALLOWED_TYPES.get(mime)
    if ext is None:
        return None
    return ("image/heic" if ext == "heic" else mime), ext


def safe_file_name(original: str | None, extension: str) -> str:
    """A display name derived from the client's file name: no directories, control or reserved characters,
    at most 255 chars, and always ending in an extension that matches the detected type."""
    raw = (original or "").replace("\\", "/")
    base = PurePosixPath(raw).name if raw else ""
    base = unicodedata.normalize("NFC", base)
    base = "".join(ch for ch in base if ch.isprintable() and ch not in _FORBIDDEN_NAME_CHARS)
    base = re.sub(r"\s+", " ", base).strip(" .")
    if not base:
        base = "document"
    stem, dot, ext = base.rpartition(".")
    if not dot or not stem or ext.lower() not in _EXTENSION_ALIASES.get(extension, frozenset({extension})):
        stem = base
        ext = extension
    stem = stem[: 255 - len(ext) - 1].rstrip(" .") or "document"
    return f"{stem}.{ext}"


def content_disposition(file_name: str, disposition: str = "attachment") -> str:
    """RFC 6266 header value with an ASCII fallback and an RFC 5987 UTF-8 ``filename*``."""
    ascii_name = unicodedata.normalize("NFKD", file_name).encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^A-Za-z0-9._ ()-]", "_", ascii_name).strip() or "download"
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file_name, safe='')}"
