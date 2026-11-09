"""Speech-to-text providers for voice intake (PLAN 7.2).

* ``local_whisper`` (default): open-source Whisper via ``faster-whisper`` running on our own servers, so the
  patient's audio never leaves our infrastructure. The model is loaded lazily once per process (thread-safe)
  and inference runs in a worker thread.
* ``none``: disabled -> :class:`STTNotConfigured` with a clear message.

The interface (:class:`STTProvider`) is ready for cloud engines later. Tests install a fake provider with
:func:`set_provider`.
"""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import structlog

from app.core.config import settings
from app.modules.voice.audio import AudioFormat, decode_to_mono_16k

logger = structlog.get_logger(__name__)

__all__ = [
    "LocalWhisperProvider",
    "NoneProvider",
    "STTError",
    "STTNotConfigured",
    "STTProvider",
    "TranscriptionResult",
    "get_provider",
    "set_provider",
]


@dataclass(slots=True)
class TranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float
    segments: list[dict[str, Any]] = field(default_factory=list)
    model: str | None = None
    latency_ms: int = 0


class STTError(Exception):
    """Speech-to-text failed; ``str(exc)`` is safe to show to the user."""


class STTNotConfigured(STTError):
    pass


class STTProvider(Protocol):
    name: str
    model: str | None

    async def transcribe(
        self, data: bytes, audio_format: AudioFormat, *, language: str | None, max_seconds: float
    ) -> TranscriptionResult: ...


class NoneProvider:
    name = "none"
    model: str | None = None

    def __init__(self, reason: str = "Speech-to-text is not configured on this server.") -> None:
        self.reason = reason

    async def transcribe(
        self, data: bytes, audio_format: AudioFormat, *, language: str | None, max_seconds: float
    ) -> TranscriptionResult:
        raise STTNotConfigured(f"{self.reason} Please type your answers instead.")


class LocalWhisperProvider:
    name = "local_whisper"

    def __init__(
        self,
        model: str | None = None,
        *,
        device: str | None = None,
        compute_type: str | None = None,
        download_root: str | None = None,
    ) -> None:
        self.model = model or settings.WHISPER_MODEL
        self.device = device or settings.WHISPER_DEVICE
        self.compute_type = compute_type or settings.WHISPER_COMPUTE_TYPE
        self.download_root = download_root or settings.WHISPER_MODEL_DIR
        self._whisper: Any = None
        self._lock = threading.Lock()

    @staticmethod
    def available() -> bool:
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            return False
        return True

    def _load(self) -> Any:
        if self._whisper is None:
            with self._lock:
                if self._whisper is None:
                    from faster_whisper import WhisperModel

                    started = time.perf_counter()
                    self._whisper = WhisperModel(
                        self.model,
                        device=self.device,
                        compute_type=self.compute_type,
                        download_root=self.download_root,
                    )
                    logger.info(
                        "voice.whisper_loaded",
                        model=self.model,
                        seconds=round(time.perf_counter() - started, 1),
                    )
        return self._whisper

    def _run(
        self, data: bytes, audio_format: AudioFormat, language: str | None, max_seconds: float
    ) -> TranscriptionResult:
        started = time.perf_counter()
        audio = decode_to_mono_16k(data, audio_format, max_seconds=max_seconds)
        model = self._load()
        segments_iter, info = model.transcribe(
            audio, language=language, vad_filter=True, beam_size=5, condition_on_previous_text=False
        )
        segments = [
            {"start": round(float(s.start), 2), "end": round(float(s.end), 2), "text": s.text.strip()}
            for s in segments_iter
        ]
        text = " ".join(s["text"] for s in segments if s["text"]).strip()
        return TranscriptionResult(
            text=text,
            language=getattr(info, "language", None) or language,
            duration_seconds=round(float(getattr(info, "duration", 0.0) or audio.size / 16000), 2),
            segments=segments,
            model=self.model,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )

    async def transcribe(
        self, data: bytes, audio_format: AudioFormat, *, language: str | None, max_seconds: float
    ) -> TranscriptionResult:
        return await asyncio.to_thread(self._run, data, audio_format, language, max_seconds)


_override: STTProvider | None = None
_cached: STTProvider | None = None
_cached_key: tuple[str, ...] | None = None


def set_provider(provider: STTProvider | None) -> None:
    """Install a provider (tests) or ``None`` to go back to the configured one."""
    global _override
    _override = provider


def get_provider() -> STTProvider:
    """The configured provider (one process-wide instance per configuration)."""
    global _cached, _cached_key
    if _override is not None:
        return _override
    key = (
        settings.STT_PROVIDER,
        settings.WHISPER_MODEL,
        settings.WHISPER_DEVICE,
        settings.WHISPER_COMPUTE_TYPE,
        settings.WHISPER_MODEL_DIR,
    )
    if _cached is not None and _cached_key == key:
        return _cached
    provider: STTProvider
    if settings.STT_PROVIDER == "local_whisper":
        if LocalWhisperProvider.available():
            provider = LocalWhisperProvider()
        else:
            logger.warning("voice.faster_whisper_missing")
            provider = NoneProvider(
                "Speech-to-text is unavailable (install the backend 'voice' extra: faster-whisper)."
            )
    else:
        provider = NoneProvider()
    _cached, _cached_key = provider, key
    return provider
