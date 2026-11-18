#!/bin/bash
# Shared helpers for the starter box scripts (deploy.sh, init-secrets.sh, db-bootstrap.sh, certs.sh).
# Sourced, never executed. Requires: bash, aws (CLI v2), jq, docker with the compose plugin.
#
# Layout on the box:
#   /etc/hig/hig.env            region, deployment name, SSM parameter name (written by the bootstrap)
#   /opt/hig/releases/<tag>/    deploy bundle of a tag (infra/ + deploy/starter/), fetched by hig-deploy
#   /opt/hig/current            symlink to the release that is running (last successful deploy)
#   /opt/hig/.env               compose env file: settings + secrets, mode 0600, rewritten at every deploy
#   /opt/hig/certs/             TLS certificate used by the edge (Let's Encrypt, self-signed until issued)
#   /opt/hig/nginx-extra/       rendered staff-console server + main-domain redirect (infra/nginx/aws/*.conf.in)
#   /opt/hig/state/             deploy lock, current tag, markers

# shellcheck disable=SC2034 # the variables below are used by the scripts that source this file
HIG_HOME=/opt/hig
HIG_ENV_FILE="$HIG_HOME/.env"
HIG_STATE="$HIG_HOME/state"
HIG_CERTS_DIR="$HIG_HOME/certs"
HIG_NGINX_EXTRA_DIR="$HIG_HOME/nginx-extra"
HIG_PROJECT=hig

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

load_host_env() {
  [ -r /etc/hig/hig.env ] || die "/etc/hig/hig.env missing (the instance bootstrap did not finish?)"
  # shellcheck disable=SC1091
  . /etc/hig/hig.env
  export AWS_REGION="$HIG_REGION" AWS_DEFAULT_REGION="$HIG_REGION"
}

# Non-secret runtime configuration (Terraform -> SSM Parameter Store) into $HIG_CONFIG.
load_config() {
  load_host_env
  HIG_CONFIG="$(aws ssm get-parameter --name "$HIG_CONFIG_PARAMETER" --query Parameter.Value --output text)"
  [ -n "$HIG_CONFIG" ] || die "empty configuration parameter $HIG_CONFIG_PARAMETER"
  export HIG_CONFIG
}

# cfg '<jq filter>'  - read one value of the configuration ("" for null).
cfg() { jq -r "$1 // empty" <<<"$HIG_CONFIG"; }

# secret_json <secret id> - SecretString of a JSON secret ("{}" when it has no value yet).
secret_json() {
  local value
  if ! value="$(aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text 2>/dev/null)"; then
    die "cannot read secret $1 (instance role / bootstrap_mode?)"
  fi
  if [ -z "$value" ] || [ "$value" = "None" ]; then value='{}'; fi
  jq -e 'type == "object"' >/dev/null <<<"$value" || die "secret $1 is not a JSON object"
  printf '%s' "$value"
}

# compose <release dir> <args...>
compose() {
  local rel="$1"
  shift
  docker compose -p "$HIG_PROJECT" \
    -f "$rel/infra/docker-compose.yml" -f "$rel/infra/docker-compose.aws.yml" \
    --env-file "$HIG_ENV_FILE" "$@"
}

ecr_login() {
  local registry
  registry="$(cfg .ecr_registry)"
  aws ecr get-login-password | docker login --username AWS --password-stdin "$registry" >/dev/null
}
