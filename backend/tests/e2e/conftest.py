"""Local configuration for the end-to-end suite.

The shared fixtures (``client``, ``db``, ``make_user``, ``auth_headers``, ``run_jobs`` ...) come from
``tests/conftest.py``. This file only registers the ``e2e`` marker so ``pytest -m e2e`` / ``-m "not e2e"``
work without touching the shared configuration.
"""

from __future__ import annotations

import pytest


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers", "e2e: end-to-end journeys that drive the whole platform through the HTTP API (slow)"
    )
