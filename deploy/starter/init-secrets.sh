#!/bin/bash
# Create the generated application secrets ONCE, on the box, so they never pass through Terraform state, git or
# a laptop. Existing values are never replaced (FIELD_ENCRYPTION_KEY in particular: data encrypted with it would
# become unreadable - rotate it only with the re-encryption job, docs/OPERATIONS.md).
#
#   JWT_SECRET            64 url-safe characters
#   FIELD_ENCRYPTION_KEY  32 random bytes, url-safe base64 (AES-256-GCM)
#   REDIS_PASSWORD, APP_DB_PASSWORD, MIGRATOR_DB_PASSWORD, REVALIDATE_SECRET  hex (URL-safe in connection URLs)
#
# Needs secretsmanager:PutSecretValue on the generated secret (Terraform bootstrap_mode = true).
# Called by deploy.sh; safe to run again (does nothing when every value exists). Never prints a value.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/starter/common.sh
. "$here/common.sh"

[ -n "${HIG_CONFIG:-}" ] || load_config
secret_id="$(cfg .generated_secret_id)"
current="$(secret_json "$secret_id")"

gen_hex() { openssl rand -hex "$1"; }
gen_urlsafe() { openssl rand -base64 "$1" | tr -d '\n=' | tr '+/' '-_'; }
gen_key32() { openssl rand 32 | base64 | tr -d '\n' | tr '+/' '-_'; }

updated="$current"
created=()
add_if_missing() {
  local key="$1" value="$2"
  if ! jq -e --arg k "$key" 'has($k) and (.[$k] | type == "string") and (.[$k] | length > 0)' >/dev/null <<<"$updated"; then
    # The value travels in the environment, not in jq's argv (process lists are world-readable).
    updated="$(HIG_NEW_VALUE="$value" jq --arg k "$key" '.[$k] = env.HIG_NEW_VALUE' <<<"$updated")"
    created+=("$key")
  fi
}

add_if_missing JWT_SECRET "$(gen_urlsafe 48)"
add_if_missing FIELD_ENCRYPTION_KEY "$(gen_key32)"
add_if_missing REDIS_PASSWORD "$(gen_hex 24)"
add_if_missing APP_DB_PASSWORD "$(gen_hex 24)"
add_if_missing MIGRATOR_DB_PASSWORD "$(gen_hex 24)"
add_if_missing REVALIDATE_SECRET "$(gen_hex 32)"

if [ "${#created[@]}" -eq 0 ]; then
  log "generated secrets: all present"
  exit 0
fi

tmp="$(umask 077 && mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '%s' "$updated" > "$tmp"
aws secretsmanager put-secret-value --secret-id "$secret_id" --secret-string "file://$tmp" >/dev/null \
  || die "cannot write $secret_id (set bootstrap_mode = true in Terraform and apply)"
log "generated secrets created: ${created[*]}"
