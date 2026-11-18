#!/bin/bash
# Obtain (first run) or renew (later runs) the Let's Encrypt certificate for <domain> + <staff host> and reload
# the edge. HTTP-01 through the edge's /.well-known/acme-challenge/ (port 80), so DNS must already point at the
# Elastic IP. Run by deploy.sh after the first deploy, by the hig-certs.timer twice a day and by the
# <name>-certs SSM document. Exit code != 0 when certbot fails; the edge keeps the previous certificate.
#
#   CERTBOT_STAGING=true certs.sh     # test against the Let's Encrypt staging CA (no rate limits)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/starter/common.sh
. "$here/common.sh"

rel="$(cd "$here/../.." && pwd)"
[ -f "$HIG_ENV_FILE" ] || die "no $HIG_ENV_FILE yet: deploy first"
load_host_env

if [ -z "$(compose "$rel" ps -q edge 2>/dev/null)" ]; then
  log "certs: the edge is not running - nothing to do"
  exit 0
fi

before="$(sha256sum "$HIG_CERTS_DIR/fullchain.pem" 2>/dev/null | cut -d' ' -f1 || true)"
if [ -n "${CERTBOT_STAGING:-}" ]; then
  compose "$rel" --profile certbot run --rm -e CERTBOT_STAGING="$CERTBOT_STAGING" certbot
else
  compose "$rel" --profile certbot run --rm certbot
fi
after="$(sha256sum "$HIG_CERTS_DIR/fullchain.pem" | cut -d' ' -f1)"

if [ "$before" != "$after" ]; then
  compose "$rel" exec -T edge nginx -s reload
  log "certs: new certificate installed, edge reloaded"
else
  log "certs: certificate unchanged"
fi
