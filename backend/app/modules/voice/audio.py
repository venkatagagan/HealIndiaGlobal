"""Audio upload helpers for voice intake (PLAN 7.2).

* :func:`sniff_audio_format` - magic-byte / container check (the client's content type and file name are never
  trusted). Allowed: WebM/Matroska, Ogg (Opus/Vorbis), MP4/M4A, AAC (ADTS), MP3, WAV.
* :func:`normalize_language` - ISO 639-1 hint (or ``auto``) -> a Whisper language code or ``None``.
* :func:`decode_to_mono_16k` - bounded decoding with PyAV (16 kHz mono float32, what Whisper expects). The
  demuxer is forced to the sniffed container (FFmpeg never probes arbitrary formats such as playlists), and
  decoding stops as soon as the audio is longer than the allowed duration, so memory stays bounded whatever
  the container metadata claims.

``av``/``numpy`` are imported lazily: they come with the optional ``voice`` extra (faster-whisper).
"""

from __future__ import annotations

import io
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Final

if TYPE_CHECKING:
    import numpy as np

__all__ = [
    "AUDIO_FORMATS",
    "SAMPLE_RATE",
    "WHISPER_LANGUAGES",
    "AudioDecodeError",
    "AudioFormat",
    "AudioTooLong",
    "decode_to_mono_16k",
    "normalize_language",
    "sniff_audio_format",
]

SAMPLE_RATE: Final = 16_000
SNIFF_BYTES: Final = 4096


@dataclass(frozen=True, slots=True)
class AudioFormat:
    name: str  # webm | ogg | mp4 | aac | mp3 | wav
    extension: str
    content_type: str
    demuxer: str  # FFmpeg demuxer short name


AUDIO_FORMATS: Final[dict[str, AudioFormat]] = {
    "webm": AudioFormat("webm", "webm", "audio/webm", "matroska"),
    "ogg": AudioFormat("ogg", "ogg", "audio/ogg", "ogg"),
    "mp4": AudioFormat("mp4", "m4a", "audio/mp4", "mp4"),
    "aac": AudioFormat("aac", "aac", "audio/aac", "aac"),
    "mp3": AudioFormat("mp3", "mp3", "audio/mpeg", "mp3"),
    "wav": AudioFormat("wav", "wav", "audio/wav", "wav"),
}

# ISO-BMFF major/compatible brands of audio/video files (M4A from iOS/Android recorders, MP4 from Safari's
# MediaRecorder, 3GP from older Android devices, QuickTime from iOS) ...
_MP4_BRANDS: Final = frozenset(
    {
        "M4A ",
        "M4B ",
        "M4P ",
        "M4V ",
        "mp41",
        "mp42",
        "isom",
        "iso2",
        "iso3",
        "iso4",
        "iso5",
        "iso6",
        "iso8",
        "iso9",
        "avc1",
        "3gp4",
        "3gp5",
        "3gp6",
        "3gp7",
        "3ge6",
        "3g2a",
        "3g2b",
        "qt  ",
        "dash",
        "MSNV",
        "f4a ",
        "f4v ",
        "mmp4",
    }
)
# ... and the brands of still images that share the container (HEIC/AVIF photos are not audio).
_IMAGE_BRANDS: Final = frozenset(
    {"heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "miaf", "avif", "avis", "crx "}
)


def _mp4_brands(head: bytes) -> tuple[str, list[str]] | None:
    if len(head) < 16 or head[4:8] != b"ftyp":
        return None
    box_size = int.from_bytes(head[0:4], "big")
    if box_size < 16 or box_size > 1024:
        return None
    major = head[8:12].decode("latin-1")
    end = min(box_size, len(head))
    compatible = [head[i : i + 4].decode("latin-1") for i in range(16, end - 3, 4)]
    return major, compatible


def _is_adts(b0: int, b1: int) -> bool:
    """AAC ADTS: 12-bit syncword 0xFFF, layer bits ``00``."""
    return b0 == 0xFF and (b1 & 0xF6) == 0xF0


def _is_mpeg_audio_frame(head: bytes, offset: int = 0) -> bool:
    """MPEG-1/2/2.5 Layer I-III frame header (MP3): sync 11 bits, valid version/layer/bitrate/sample rate."""
    if len(head) < offset + 4:
        return False
    b0, b1, b2 = head[offset], head[offset + 1], head[offset + 2]
    if b0 != 0xFF or (b1 & 0xE0) != 0xE0:
        return False
    version = (b1 >> 3) & 0x3
    layer = (b1 >> 1) & 0x3
    bitrate = b2 >> 4
    sample_rate = (b2 >> 2) & 0x3
    return version != 0x1 and layer != 0x0 and bitrate != 0xF and sample_rate != 0x3


def _id3_end(head: bytes) -> int:
    """Byte offset right after an ID3v2 tag (``ID3`` + 10-byte header + synchsafe size [+ footer])."""
    size = 0
    for byte in head[6:10]:
        size = (size << 7) | (byte & 0x7F)
    footer = 10 if head[5] & 0x10 else 0
    return 10 + size + footer


def sniff_audio_format(data: bytes) -> AudioFormat | None:
    """Detect an allowed audio container from the leading bytes; ``None`` when it is not one of them."""
    head = data[:SNIFF_BYTES]
    if len(head) < 12:
        return None
    if head[:4] == b"\x1a\x45\xdf\xa3":  # EBML -> Matroska family; require the webm/matroska DocType
        return AUDIO_FORMATS["webm"] if (b"webm" in head or b"matroska" in head) else None
    if head[:4] == b"OggS":
        return AUDIO_FORMATS["ogg"]
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return AUDIO_FORMATS["wav"]
    brands = _mp4_brands(head)
    if brands is not None:
        major, compatible = brands
        if major in _IMAGE_BRANDS:
            return None
        if major in _MP4_BRANDS:
            return AUDIO_FORMATS["mp4"]
        if any(b in _MP4_BRANDS for b in compatible) and not any(b in _IMAGE_BRANDS for b in compatible):
            return AUDIO_FORMATS["mp4"]
        return None
    if head[:3] == b"ID3" and len(head) >= 10:
        # An ID3v2 tag almost always precedes MP3 frames; occasionally AAC (ADTS) frames.
        end = _id3_end(head)
        if end + 2 <= len(data) and _is_adts(data[end], data[end + 1]):
            return AUDIO_FORMATS["aac"]
        return AUDIO_FORMATS["mp3"]
    if _is_adts(head[0], head[1]):
        return AUDIO_FORMATS["aac"]
    if _is_mpeg_audio_frame(head):
        return AUDIO_FORMATS["mp3"]
    return None


# ------------------------------------------------------------------------------------------- languages
#: Language codes understood by Whisper (faster-whisper ``_LANGUAGE_CODES``): 99 languages + Cantonese.
WHISPER_LANGUAGES: Final[frozenset[str]] = frozenset(
    (
        "af am ar as az ba be bg bn bo br bs ca cs cy da de el en es et eu fa fi fo fr gl gu ha haw he hi hr "
        "ht hu hy id is it ja jw ka kk km kn ko la lb ln lo lt lv mg mi mk ml mn mr ms mt my ne nl nn no oc "
        "pa pl ps pt ro ru sa sd si sk sl sn so sq sr su sv sw ta te tg th tk tl tr tt uk ur uz vi yi yo zh "
        "yue"
    ).split()
)
_LANGUAGE_ALIASES: Final = {
    "iw": "he",
    "jv": "jw",
    "nb": "no",
    "in": "id",
    "ji": "yi",
    "fil": "tl",
    "mo": "ro",
}
_AUTO_VALUES: Final = frozenset({"", "auto", "detect", "automatic"})


def normalize_language(value: str | None) -> str | None:
    """``None``/``"auto"`` -> ``None`` (auto-detect); ``"ar"``, ``"AR"``, ``"ar-SA"`` -> ``"ar"``.

    Raises ``ValueError`` for anything Whisper does not support."""
    if value is None:
        return None
    raw = value.strip().lower()
    if raw in _AUTO_VALUES:
        return None
    primary = raw.replace("_", "-").split("-", 1)[0]
    code = _LANGUAGE_ALIASES.get(primary, primary)
    if code not in WHISPER_LANGUAGES:
        raise ValueError(
            f"Unsupported language {value[:20]!r}: use an ISO 639-1 code (e.g. en, ar, fr) or 'auto'"
        )
    return code


# ------------------------------------------------------------------------------------------- decoding
class AudioDecodeError(Exception):
    """The upload is not a readable audio recording."""


class AudioTooLong(Exception):
    """The recording exceeds the allowed duration."""

    def __init__(self, max_seconds: float) -> None:
        self.max_seconds = max_seconds
        super().__init__(f"Recording longer than {max_seconds:g} seconds")


#: Recorders stop a little after the nominal cap; accept this much extra audio.
DURATION_TOLERANCE_SECONDS: Final = 2.0


def _decoded_frames(frames: Iterator[Any], invalid_data_error: type[BaseException]) -> Iterator[Any]:
    """Skip individual corrupt frames instead of failing the whole recording (as faster-whisper does)."""
    while True:
        try:
            yield next(frames)
        except StopIteration:
            return
        except invalid_data_error:
            continue


def decode_to_mono_16k(data: bytes, audio_format: AudioFormat, *, max_seconds: float) -> np.ndarray:
    """Decode ``data`` (already sniffed as ``audio_format``) to 16 kHz mono float32 samples in [-1, 1].

    Raises :class:`AudioTooLong` when the audio exceeds ``max_seconds`` (+ a small tolerance) and
    :class:`AudioDecodeError` when it cannot be decoded or holds no sound."""
    import av
    import numpy as np

    max_samples = int((max_seconds + DURATION_TOLERANCE_SECONDS) * SAMPLE_RATE)
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=SAMPLE_RATE)
    parts: list[np.ndarray] = []
    total = 0

    def _take(frames: list[Any]) -> None:
        nonlocal total
        for out in frames:
            samples = np.array(out.to_ndarray(), dtype=np.int16, copy=True).reshape(-1)
            total += samples.size
            if total > max_samples:
                raise AudioTooLong(max_seconds)
            parts.append(samples)

    try:
        with av.open(io.BytesIO(data), mode="r", format=audio_format.demuxer) as container:
            if not container.streams.audio:
                raise AudioDecodeError("The file has no audio track")
            stream = container.streams.audio[0]
            for frame in _decoded_frames(iter(container.decode(stream)), av.error.InvalidDataError):
                _take(resampler.resample(frame))
            _take(resampler.resample(None))
    except (AudioTooLong, AudioDecodeError):
        raise
    except (av.error.FFmpegError, ValueError, OSError, EOFError, RuntimeError) as exc:
        raise AudioDecodeError(f"Unreadable audio ({type(exc).__name__})") from exc

    if total == 0:
        raise AudioDecodeError("The recording is empty")
    return np.concatenate(parts).astype(np.float32) / 32768.0
