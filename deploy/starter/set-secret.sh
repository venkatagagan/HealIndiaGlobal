#!/bin/bash
# Set ONE key of the third-party secret (<project>/<environment>/third-party) without echoing the value, from an
# admin workstation (AWS CLI v2 + jq, credentials of an admin / deploy operator) or an SSM session on the box.
#
#   deploy/starter/set-secret.sh ANTHROPIC_API_KEY                  # prompts (hidden input)
#   deploy/starter/set-secret.sh APPLE_PRIVATE_KEY --file key.p8     # multi-line values from a file
#   deploy/starter/set-secret.sh FCM_SERVICE_ACCOUNT_JSON --file sa.json
#   deploy/starter/set-secret.sh RAZORPAY_KEY_SECRET --delete
#   deploy/starter/set-secret.sh --list                              # key names only, never values
#
# Options: --secret-id <id> (default hig/production/third-party), --region <region> (default us-east-2).
# Values take effect at the next deploy (re-run the deploy workflow or `hig-deploy <current tag>` on the box).
# Keys: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY,
# STRIPE_WEBHOOK_SECRET, ANTHROPIC_API_KEY, APPLE_PRIVATE_KEY, FCM_SERVICE_ACCOUNT_JSON, SENTRY_DSN, ...
# Values may not contain a single quote (') - the deploy refuses them.
set -euo pipefail

secret_id="hig/production/third-party"
region="${AWS_REGION:-us-east-2}"
key="" file="" action=set

while [ $# -gt 0 ]; do
  case "$1" in
    --secret-id) secret_id="$2"; shift 2 ;;
    --region) region="$2"; shift 2 ;;
    --file) file="$2"; shift 2 ;;
    --delete) action=delete; shift ;;
    --list) action=list; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) key="$1"; shift ;;
  esac
done

if ! command -v aws >/dev/null || ! command -v jq >/dev/null; then
  echo "needs the AWS CLI v2 and jq" >&2
  exit 1
fi
current="$(aws secretsmanager get-secret-value --region "$region" --secret-id "$secret_id" \
  --query SecretString --output text 2>/dev/null || echo '{}')"
[ -n "$current" ] && [ "$current" != "None" ] || current='{}'

if [ "$action" = list ]; then
  jq -r 'keys[]' <<<"$current"
  exit 0
fi

[[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "usage: set-secret.sh KEY [--file path | --delete]" >&2; exit 2; }

if [ "$action" = delete ]; then
  updated="$(jq --arg k "$key" 'del(.[$k])' <<<"$current")"
else
  if [ -n "$file" ]; then
    value="$(cat "$file")"
  else
    read -rsp "Value for $key (hidden): " value
    echo
  fi
  [ -n "$value" ] || { echo "empty value" >&2; exit 1; }
  case "$value" in *"'"*) echo "values may not contain a single quote" >&2; exit 1 ;; esac
  updated="$(HIG_VALUE="$value" jq --arg k "$key" '.[$k] = env.HIG_VALUE' <<<"$current")"
  unset value
fi

tmp="$(umask 077 && mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '%s' "$updated" > "$tmp"
aws secretsmanager put-secret-value --region "$region" --secret-id "$secret_id" \
  --secret-string "file://$tmp" >/dev/null
echo "$key: ${action/set/stored} in $secret_id (applies at the next deploy)"
