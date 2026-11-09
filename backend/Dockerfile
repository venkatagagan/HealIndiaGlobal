# syntax=docker/dockerfile:1.7
# Heal India Global - API / worker image (FastAPI + gunicorn/uvicorn, Python 3.13).
#
#   docker build -t healindia/api ./backend
#   docker run --env-file infra/.env -e RUN_MIGRATIONS=1 -p 8000:8000 healindia/api          # API
#   docker run --env-file infra/.env healindia/api python -m app.worker                       # worker
#
# Environment knobs: WEB_CONCURRENCY (gunicorn workers, default 2), GUNICORN_TIMEOUT (60),
# RUN_MIGRATIONS=1 (run `alembic upgrade head` before starting), FORWARDED_ALLOW_IPS (trusted proxies).

ARG PYTHON_IMAGE=python:3.13-slim-bookworm

# ------------------------------------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv && pip install --upgrade pip setuptools wheel

WORKDIR /app

# 1) Pinned third-party dependencies (cached layer). The lock is a `pip freeze` of the Windows dev venv, so
#    drop Windows-only distributions, local/editable references and dev-only tools (tests, linters).
COPY requirements.lock.txt ./
RUN grep -v -i -E '^(-e |pywin32|pywin32-ctypes|pywinpty|win32-setctime|win32_setctime|winloop|wmi)|@ file:' \
        requirements.lock.txt \
  | grep -v -i -E '^(pytest|pytest-[a-z0-9-]+|ruff|mypy|mypy_extensions|respx|time-machine|coverage)==' \
        > /tmp/requirements.linux.txt \
 && pip install -r /tmp/requirements.linux.txt

# 2) Linux-only production server extras (not part of the Windows dev lock).
#    gunicorn: process manager; uvloop: faster event loop; uvicorn-worker only if uvicorn.workers is gone.
RUN pip install "gunicorn==23.0.0" "uvloop==0.21.0" \
 && (python -c "import uvicorn.workers" 2>/dev/null || pip install "uvicorn-worker==0.3.0")

# 3) The application itself (editable install keeps BACKEND_DIR == /app, same layout as development).
COPY . .
RUN mkdir -p scripts storage \
 && pip install --no-deps -e . \
 && python -m compileall -q app

# ------------------------------------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime

LABEL org.opencontainers.image.title="heal-india-api" \
      org.opencontainers.image.description="Heal India Global API and background worker" \
      org.opencontainers.image.source="https://github.com/heal-india-global/heal-india-global"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    ENV=production \
    STORAGE_LOCAL_DIR=/app/storage \
    WEB_CONCURRENCY=2 \
    GUNICORN_TIMEOUT=60 \
    RUN_MIGRATIONS=0 \
    TZ=UTC

# libmagic/fonts are not needed (filetype is pure Python, fpdf2 embeds its core fonts); curl-free image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
# Source stays root-owned (read-only for the app user); only the local storage dir is writable.
COPY --from=builder /app /app
RUN mkdir -p /app/storage && chown app:app /app/storage

# Gunicorn configuration (workers/timeouts from the environment).
COPY <<'EOF' /etc/gunicorn/gunicorn.conf.py
import importlib.util
import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")
workers = int(os.getenv("WEB_CONCURRENCY", str(min(4, multiprocessing.cpu_count() * 2 + 1))))
worker_class = (
    "uvicorn.workers.UvicornWorker"
    if importlib.util.find_spec("uvicorn.workers") is not None
    else "uvicorn_worker.UvicornWorker"
)
timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "5000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "500"))
forwarded_allow_ips = os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1")
worker_tmp_dir = "/dev/shm"
preload_app = False          # each worker builds its own async engine / event loop
accesslog = None             # request logging is done by the app (structlog, request ids)
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
proc_name = "heal-india-api"
EOF

# Entrypoint: optional migrations, then exec the command (gunicorn or `python -m app.worker`).
COPY --chmod=0755 <<'EOF' /usr/local/bin/docker-entrypoint.sh
#!/bin/sh
set -eu
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] alembic upgrade head"
  alembic -c /app/alembic.ini upgrade head
fi
exec "$@"
EOF

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["python", "-c", "import sys, urllib.request; r = urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=4); sys.exit(0 if r.status == 200 else 1)"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["gunicorn", "app.main:app", "--config", "/etc/gunicorn/gunicorn.conf.py"]
