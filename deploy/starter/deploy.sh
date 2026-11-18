#!/bin/bash
# Deploy one image tag on the starter box. Started by /usr/local/bin/hig-deploy <tag> (SSM document
# <name>-deploy, from .github/workflows/deploy-aws.yml), which has already unpacked this release's bundle into
# /opt/hig/releases/<tag>/.
#
#   1. read the runtime configuration (SSM) and, in bootstrap_mode, create missing generated secrets
#   2. render /opt/hig/.env (0600) from the configuration + Secrets Manager, and the nginx extras
#   3. pull the images of <tag> from ECR
#   4. bootstrap_mode: create / re-key the RDS roles (db-bootstrap.sh)
#   5. migrations: `alembic upgrade head` as the migrator role (one-off `migrate` container)
#   6. docker compose up -d, then wait until api, web, website and edge are healthy and
#      https://<domain>/health/ready answers through the edge
#   7. success: /opt/hig/current -> this release; first run: Let's Encrypt certificate; prune old images
#      failure after step 5: automatic rollback to the previous release + image tag (same .env as before)
#
# Migrations are not rolled back: keep them expand-only (old code must run on the new schema), as for ECS.
set -euo pipefail
TAG="${1:?usage: deploy.sh <image tag>}"
case "$TAG" in
  *[!A-Za-z0-9_.-]*) echo "invalid image tag" >&2; exit 2 ;;
esac
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/starter/common.sh
. "$here/common.sh"
REL="$(cd "$here/../.." && pwd)"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-600}"

install -d -m 0700 "$HIG_HOME" "$HIG_STATE"
exec 9>"$HIG_STATE/deploy.lock"
flock -n 9 || die "another deploy is running"

log "deploy $TAG from $REL"
load_config
bootstrap="$(cfg .bootstrap_mode)"
site="$(cfg .domain)"
staff_host="$(cfg .staff_host)"
for host in "$site" "$staff_host"; do
  [[ "$host" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "invalid host name in configuration: $host"
done

# ---- 1. generated secrets ------------------------------------------------------------------------
if [ "$bootstrap" = "true" ]; then
  bash "$here/init-secrets.sh"
fi

# ---- 2. env file -----------------------------------------------------------------------------------
render_env() {
  local generated third_party
  generated="$(secret_json "$(cfg .generated_secret_id)")"
  third_party="$(secret_json "$(cfg .third_party_secret_id)")"
  jq -e 'has("JWT_SECRET") and has("FIELD_ENCRYPTION_KEY") and has("APP_DB_PASSWORD")' >/dev/null <<<"$generated" \
    || die "generated secrets missing: deploy once with bootstrap_mode = true"
  # Secrets travel to jq through the environment (not argv). Precedence: computed < app_environment (Terraform)
  # < generated < third-party (third-party may not override a generated key).
  HIG_GENERATED="$generated" HIG_THIRD_PARTY="$third_party" HIG_TAG="$TAG" \
  HIG_CERTS="$HIG_CERTS_DIR" HIG_EXTRA="$HIG_NGINX_EXTRA_DIR" \
    jq -r '
      (env.HIG_GENERATED | fromjson) as $gen
      | (env.HIG_THIRD_PARTY | fromjson | with_entries(select(.key as $k | $gen | has($k) | not))) as $tp
      | {
          COMPOSE_PROJECT_NAME: "hig",
          IMAGE_TAG: env.HIG_TAG,
          API_IMAGE: .api_image,
          WEB_IMAGE: .web_image,
          WEBSITE_IMAGE: .website_image,
          SITE_DOMAIN: .domain,
          SELF_SIGNED_CN: .domain,
          STAFF_HOST: .staff_host,
          CERTBOT_EMAIL: .certbot_email,
          HIG_CERTS_DIR: env.HIG_CERTS,
          HIG_NGINX_EXTRA_DIR: env.HIG_EXTRA,
          DB_HOST: .db_host,
          DB_PORT: (.db_port | tostring),
          POSTGRES_DB: .db_name,
          APP_DB_USER: .db_app_user,
          MIGRATOR_DB_USER: .db_migrator_user,
          POSTGRES_PASSWORD: "unused-postgres-runs-on-rds"
        }
      + .app_environment + $gen + $tp
      | to_entries[]
      | if (.key | test("^[A-Z][A-Z0-9_]*$")) then . else error("invalid variable name: \(.key)") end
      | .value |= (
          (if type == "string" then . else tojson end) as $v
          # JSON documents stored as text (e.g. FCM_SERVICE_ACCOUNT_JSON) are compacted onto one line.
          | (try ($v | fromjson | if type == "object" or type == "array" then tojson else error("scalar") end) catch $v)
          | gsub("\r"; "") | gsub("\n"; "\\n")
        )
      | ([39] | implode) as $q
      | if (.value | contains($q)) then error("value of \(.key) contains a single quote") else . end
      | "\(.key)=\($q)\(.value)\($q)"
    ' <<<"$HIG_CONFIG"
}

new_env="$(umask 077 && mktemp "$HIG_HOME/.env.XXXXXX")"
trap 'rm -f "$new_env"' EXIT
render_env > "$new_env"
chmod 0600 "$new_env"
if [ -f "$HIG_ENV_FILE" ]; then
  cp -p "$HIG_ENV_FILE" "$HIG_STATE/env.rollback"
fi
mv "$new_env" "$HIG_ENV_FILE"
trap - EXIT

render_nginx_extra() {
  local tmpdir allow=""
  tmpdir="$(mktemp -d)"
  while IFS= read -r cidr; do
    [ -n "$cidr" ] || continue
    [[ "$cidr" =~ ^[0-9a-fA-F:./]+$ ]] || die "invalid CIDR in staff_allowed_cidrs: $cidr"
    allow+="    allow $cidr;"$'\n'
  done < <(cfg '.staff_allowed_cidrs[]?')
  [ -z "$allow" ] || allow+="    deny all;"
  for name in server-ops-console main-staff-redirect; do
    HIG_ALLOW="$allow" awk -v host="$staff_host" '
      /^__STAFF_ALLOW__$/ { printf "%s\n", ENVIRON["HIG_ALLOW"]; next }
      { gsub(/__STAFF_HOST__/, host); print }
    ' "$REL/infra/nginx/aws/$name.conf.in" > "$tmpdir/$name.conf"
  done
  install -d -m 0755 "$HIG_NGINX_EXTRA_DIR"
  cp "$tmpdir"/*.conf "$HIG_NGINX_EXTRA_DIR/"
  rm -rf "$tmpdir"
}
render_nginx_extra
install -d -m 0755 "$HIG_CERTS_DIR"

restore_env() {
  if [ -f "$HIG_STATE/env.rollback" ]; then
    cp -p "$HIG_STATE/env.rollback" "$HIG_ENV_FILE"
  fi
}

# ---- 3. images ---------------------------------------------------------------------------------------
ecr_login
if ! compose "$REL" pull --quiet; then
  restore_env
  die "image pull failed for $TAG (nothing was changed)"
fi

# ---- 4. database roles (first deploy) ----------------------------------------------------------------
if [ "$bootstrap" = "true" ]; then
  bash "$here/db-bootstrap.sh"
fi

# ---- 5. migrations -------------------------------------------------------------------------------------
log "migrations (alembic upgrade head, migrator role)"
if ! compose "$REL" run --rm --no-deps migrate; then
  restore_env
  die "migrations failed: the running release was left untouched"
fi

# ---- 6. start + health ---------------------------------------------------------------------------------
wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) svc cid state all_ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    all_ok=true
    for svc in api web website edge redis; do
      cid="$(compose "$1" ps -q "$svc" 2>/dev/null | head -n1)"
      state="$( [ -n "$cid" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo missing)"
      if [ "$state" != "healthy" ]; then
        all_ok=false
        [ "$state" = "unhealthy" ] && { log "$svc is unhealthy"; return 1; }
      fi
    done
    worker="$(compose "$1" ps -q worker 2>/dev/null | head -n1)"
    if [ -z "$worker" ] || [ "$(docker inspect -f '{{.State.Running}}' "$worker" 2>/dev/null)" != "true" ]; then
      all_ok=false
    fi
    if $all_ok && curl -fsk --max-time 10 --resolve "$site:443:127.0.0.1" "https://$site/health/ready" >/dev/null; then
      return 0
    fi
    sleep 5
  done
  log "health check timed out after ${HEALTH_TIMEOUT}s"
  return 1
}

log "starting $TAG"
if compose "$REL" up -d --remove-orphans && wait_healthy "$REL"; then
  ln -sfn "$REL" "$HIG_HOME/current"
  echo "$TAG" > "$HIG_STATE/current_tag"
  log "deploy $TAG healthy"
else
  compose "$REL" ps || true
  compose "$REL" logs --tail 80 api worker website edge || true
  prev_rel="$(readlink -f "$HIG_HOME/current" 2>/dev/null || true)"
  if [ -n "$prev_rel" ] && [ "$prev_rel" != "$REL" ] && [ -f "$HIG_STATE/env.rollback" ]; then
    log "ROLLING BACK to $(cat "$HIG_STATE/current_tag" 2>/dev/null || echo previous) ($prev_rel)"
    restore_env
    compose "$prev_rel" up -d --remove-orphans || true
    if wait_healthy "$prev_rel"; then
      die "deploy $TAG failed health checks; rolled back to the previous release"
    fi
    die "deploy $TAG failed and the rollback is not healthy either: investigate now (SSM session)"
  fi
  die "deploy $TAG failed health checks (no previous release to roll back to)"
fi

# ---- 7. after a successful deploy ------------------------------------------------------------------------
# First deploy (or self-signed / missing certificate): get the real certificate now. Never fails the deploy.
if [ ! -s "$HIG_CERTS_DIR/fullchain.pem" ] \
  || ! openssl x509 -in "$HIG_CERTS_DIR/fullchain.pem" -noout -issuer 2>/dev/null | grep -qi "let's encrypt"; then
  bash "$here/certs.sh" || log "WARNING: certificate not issued yet (DNS not pointing here?); the timer retries"
fi

# Website: refresh the ISR pages built without API access (best effort).
compose "$REL" exec -T website node -e "fetch('http://127.0.0.1:3000/api/revalidate',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.REVALIDATE_SECRET},body:JSON.stringify({tags:['catalog']})}).then(r=>console.log('revalidate',r.status)).catch(()=>{})" || true

# Keep a week of images (rollback) and the five newest releases.
docker image prune -af --filter "until=168h" >/dev/null || true
find "$HIG_HOME/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +6 \
  | cut -d' ' -f2- | while read -r old; do
      [ "$(readlink -f "$HIG_HOME/current")" = "$old" ] || rm -rf "$old"
    done
log "deploy $TAG done"
