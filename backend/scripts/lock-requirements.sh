#!/bin/bash
# Regenerate the backend lock files with uv (https://docs.astral.sh/uv/). The locks are "universal": one file
# resolves for Linux (x86_64 and aarch64 - the Docker images), macOS and Windows (development), Python 3.13.
#
#   requirements.lock.txt        production: pyproject dependencies + the `server` extra (gunicorn, uvicorn-worker)
#   requirements-voice.lock.txt  production + the `voice` extra (faster-whisper / CTranslate2) - INSTALL_VOICE=true
#   requirements-dev.lock.txt    dependencies + the `dev` extra (pytest, ruff, mypy, ...) - CI and developers
#
#   backend/scripts/lock-requirements.sh                          # keep the current pins, apply pyproject changes
#   backend/scripts/lock-requirements.sh --upgrade-package anthropic
#   backend/scripts/lock-requirements.sh --upgrade                # everything to the latest allowed versions
#
# Install (development):  pip install -r requirements-dev.lock.txt && pip install --no-deps -e .
# Never edit the lock files by hand.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
UV="${UV:-uv}"
common=(--universal --python-version 3.13 --no-annotate --custom-compile-command "backend/scripts/lock-requirements.sh")

"$UV" pip compile pyproject.toml --extra server "${common[@]}" "$@" -o requirements.lock.txt
"$UV" pip compile pyproject.toml --extra server --extra voice -c requirements.lock.txt "${common[@]}" "$@" \
  -o requirements-voice.lock.txt
"$UV" pip compile pyproject.toml --extra dev -c requirements.lock.txt "${common[@]}" "$@" -o requirements-dev.lock.txt
