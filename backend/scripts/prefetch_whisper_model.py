"""Download the Whisper model for local speech-to-text into ``WHISPER_MODEL_DIR`` (no-op when it is there).

The worker would otherwise download it on the first voice note (several hundred MB: "small" ~0.5 GB,
"medium" ~1.5 GB), delaying that transcription. Deploys run this once in the worker container
(deploy/starter/deploy.sh), so the model lands in the persistent ``whisper-models`` volume::

    python -m scripts.prefetch_whisper_model            # WHISPER_MODEL (default small)
    python -m scripts.prefetch_whisper_model medium

Exit codes: 0 = model ready, 1 = download failed, 2 = faster-whisper not installed (image built with
INSTALL_VOICE=false).
"""

from __future__ import annotations

import sys
import time

from app.core.config import settings


def main(argv: list[str]) -> int:
    model = argv[1] if len(argv) > 1 else settings.WHISPER_MODEL
    try:
        from faster_whisper.utils import download_model
    except ImportError:
        print("faster-whisper is not installed (build the image with INSTALL_VOICE=true)", file=sys.stderr)
        return 2
    started = time.perf_counter()
    try:
        path = download_model(model, cache_dir=settings.WHISPER_MODEL_DIR)
    except Exception as exc:  # network / hub errors: the worker retries on the first voice note
        print(f"whisper model {model!r} download failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(f"whisper model {model!r} ready in {path} ({time.perf_counter() - started:.0f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
