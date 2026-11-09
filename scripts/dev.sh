#!/usr/bin/env bash
# Heal India Global - development environment for Git Bash (Windows) or any POSIX shell.
#
# Uses ONLY the shared toolchain under C:/NewProjects (scripts/env.sh) - never C:/laragon.
# Unlike dev.ps1 (one window per server) this runs everything in the current terminal, prefixes each
# server's output, and stops all of them on Ctrl+C. PostgreSQL (shared cluster) is left running.
#
# Usage:
#   scripts/dev.sh                                 # API + website + all four web apps
#   scripts/dev.sh --apps website,patient,admin    # API + selected (website|patient|agent|hospital|admin|none)
#   scripts/dev.sh --worker --skip-migrate --no-api
# URLs (PLAN section 3.1): website http://localhost:3000/ (login door /login), patient :5173/app/,
# agent :5174/agent/, hospital :5175/hospital/, admin (staff door) :5176/gahi/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
WEB="$ROOT/web"
WEBSITE="$ROOT/website"
LOG_DIR="$ROOT/logs"

APPS="website,patient,agent,hospital,admin"
WORKER=0
MIGRATE=1
API=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apps)          APPS="${2:?--apps needs a value}"; shift 2 ;;
    --apps=*)        APPS="${1#*=}"; shift ;;
    --worker)        WORKER=1; shift ;;
    --skip-migrate)  MIGRATE=0; shift ;;
    --no-api)        API=0; shift ;;
    -h|--help)       sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

step() { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m    %s\033[0m\n' "$*"; }
warn() { printf '\033[33m    %s\033[0m\n' "$*"; }

# ---- 0. Toolchain ----------------------------------------------------------------------------------------
step "Activating shared toolchain (C:/NewProjects)"
# shellcheck source=/dev/null
source "$ROOT/scripts/env.sh"
# Drop any laragon entries so they can never shadow the shared tools in this session.
PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v -i '/laragon/' | paste -sd ':' -)"
export PATH

if [[ -x "$BACKEND/.venv/Scripts/python.exe" ]]; then
  PY="$BACKEND/.venv/Scripts/python.exe"
elif [[ -x "$BACKEND/.venv/bin/python" ]]; then
  PY="$BACKEND/.venv/bin/python"
else
  echo "backend/.venv not found. Create it with:" >&2
  echo "  /c/NewProjects/python313/python.exe -m venv backend/.venv" >&2
  echo "  backend/.venv/Scripts/python -m pip install -e \"backend[dev]\"" >&2
  exit 1
fi
[[ -f "$BACKEND/.env" ]] || { echo "backend/.env not found (see README Quickstart)" >&2; exit 1; }

# ---- 1. PostgreSQL (this project's dedicated cluster; never the shared 5432 one) --------------------------
PGDATA_DIR="${HIG_PGDATA:-C:/NewProjects/pgdata-healindia}"
PGPORT_DEV="${HIG_PGPORT:-5433}"
[[ "$PGPORT_DEV" != "5432" ]] || { echo "Refusing port 5432: that cluster belongs to other projects." >&2; exit 1; }
# Safety net: DATABASE_URL must target this project's cluster (127.0.0.1:$PGPORT_DEV). Only host/port are
# inspected; credentials are never printed.
db_line="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$BACKEND/.env" | tail -n 1 || true)"
[[ -n "$db_line" ]] || { echo "backend/.env has no DATABASE_URL. Run scripts/setup-db.ps1 once." >&2; exit 1; }
if [[ ! "$db_line" =~ @(127\.0\.0\.1|localhost):([0-9]+)/ ]] || [[ "${BASH_REMATCH[2]}" != "$PGPORT_DEV" ]]; then
  echo "backend/.env DATABASE_URL must point at 127.0.0.1:$PGPORT_DEV (this project's own cluster)." >&2
  exit 1
fi
[[ -f "$PGDATA_DIR/PG_VERSION" ]] || { echo "Dedicated cluster not initialised. Run once: powershell -ExecutionPolicy Bypass -File scripts/setup-db.ps1" >&2; exit 1; }
step "Checking PostgreSQL cluster ($PGDATA_DIR)"
if pg_ctl status -D "$PGDATA_DIR" >/dev/null 2>&1; then
  ok "PostgreSQL is running"
else
  warn "PostgreSQL is stopped - starting it (detached)"
  mkdir -p "$LOG_DIR"
  # -W: do not wait inside pg_ctl; we poll below so this shell never blocks on the postmaster.
  pg_ctl start -D "$PGDATA_DIR" -l "$LOG_DIR/postgres.log" -W >/dev/null
  ready=0
  for _ in $(seq 1 80); do
    if pg_ctl status -D "$PGDATA_DIR" >/dev/null 2>&1 && pg_isready -h 127.0.0.1 -p "$PGPORT_DEV" -q; then
      ready=1; break
    fi
    sleep 0.75
  done
  [[ $ready -eq 1 ]] || { echo "PostgreSQL did not become ready within 60s - see $LOG_DIR/postgres.log" >&2; exit 1; }
  ok "PostgreSQL started"
fi

# ---- 2. Migrations ---------------------------------------------------------------------------------------
if [[ $MIGRATE -eq 1 ]]; then
  step "alembic upgrade head"
  if ! (cd "$BACKEND" && "$PY" -m alembic upgrade head); then
    echo "alembic upgrade head failed. If the database/role does not exist yet run scripts/setup-db.ps1 once." >&2
    exit 1
  fi
  ok "database schema is up to date"
fi

# ---- 3. Process management -------------------------------------------------------------------------------
PIDS=()
cleanup() {
  trap - INT TERM EXIT
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    echo
    step "Stopping dev servers"
    for pid in "${PIDS[@]}"; do
      kill "$pid" 2>/dev/null || true
      # Windows: make sure child node/python processes die with their process group.
      if command -v taskkill >/dev/null 2>&1; then
        winpid="$(cat "/proc/$pid/winpid" 2>/dev/null || true)"
        [[ -n "$winpid" ]] && taskkill //PID "$winpid" //T //F >/dev/null 2>&1 || true
      fi
    done
    wait 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

run_prefixed() {  # run_prefixed <label> <color> <dir> <cmd...>
  local label="$1" color="$2" dir="$3"; shift 3
  (
    cd "$dir"
    "$@" 2>&1 | while IFS= read -r line; do printf '\033[%sm[%s]\033[0m %s\n' "$color" "$label" "$line"; done
  ) &
  PIDS+=("$!")
}

URLS=()

# ---- 4. API / worker -------------------------------------------------------------------------------------
if [[ $API -eq 1 ]]; then
  step "Starting API (uvicorn --reload :8000)"
  run_prefixed api 35 "$BACKEND" "$PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
  URLS+=("API           http://127.0.0.1:8000   (docs: http://127.0.0.1:8000/api/docs)")
fi
if [[ $WORKER -eq 1 ]]; then
  step "Starting worker (python -m app.worker)"
  run_prefixed worker 34 "$BACKEND" "$PY" -m app.worker
fi

# ---- 5. Website + web apps -------------------------------------------------------------------------------
# website = Next.js project of its own (website/); the rest are npm workspaces of web/.
declare -A WS=( [website]=. [patient]=apps/patient-web [agent]=apps/agent-portal [hospital]=apps/hospital-portal [admin]=apps/admin-portal )
declare -A PORT=( [website]=3000 [patient]=5173 [agent]=5174 [hospital]=5175 [admin]=5176 )
declare -A BASE=( [website]=/ [patient]=/app/ [agent]=/agent/ [hospital]=/hospital/ [admin]=/gahi/ )
declare -A COLOR=( [website]=37 [patient]=32 [agent]=33 [hospital]=36 [admin]=31 )

IFS=',' read -r -a SELECTED <<< "$APPS"
want_web=0
want_site=0
for a in "${SELECTED[@]}"; do
  a="${a// /}"
  [[ -z "$a" || "$a" == "none" ]] && continue
  [[ -n "${WS[$a]:-}" ]] || { echo "unknown app '$a' (website|patient|agent|hospital|admin|none)" >&2; exit 2; }
  if [[ "$a" == "website" ]]; then want_site=1; else want_web=1; fi
done
if [[ $want_web -eq 1 && ! -d "$WEB/node_modules" ]]; then
  step "Installing web dependencies (npm ci, first run only)"
  (cd "$WEB" && npm ci --no-audit --no-fund)
fi
if [[ $want_site -eq 1 && ! -d "$WEBSITE/node_modules" ]]; then
  step "Installing website dependencies (npm ci, first run only)"
  (cd "$WEBSITE" && npm ci --no-audit --no-fund)
fi
for a in "${SELECTED[@]}"; do
  a="${a// /}"
  [[ -z "$a" || "$a" == "none" ]] && continue
  if [[ "$a" == "website" ]]; then
    step "Starting website (Next.js :${PORT[$a]})"
    run_prefixed "$a" "${COLOR[$a]}" "$WEBSITE" npm run dev
  else
    step "Starting ${WS[$a]} (:${PORT[$a]})"
    run_prefixed "$a" "${COLOR[$a]}" "$WEB" npm run dev -w "${WS[$a]}"
  fi
  URLS+=("$(printf '%-13s http://localhost:%s%s' "$a" "${PORT[$a]}" "${BASE[$a]}")")
  [[ "$a" == "website" ]] && URLS+=("login door    http://localhost:3000/login   (staff door: http://localhost:5176/gahi/)")
done

# ---- 6. Summary ------------------------------------------------------------------------------------------
echo
if [[ ${#PIDS[@]} -eq 0 ]]; then
  ok "Checks complete - no servers were requested."
  exit 0
fi
printf '\033[32mHeal India Global - development servers:\033[0m\n'
for u in "${URLS[@]}"; do echo "  $u"; done
echo "Press Ctrl+C to stop everything (PostgreSQL on 127.0.0.1:$PGPORT_DEV keeps running)."
wait
