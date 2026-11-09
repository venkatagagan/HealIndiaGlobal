#!/usr/bin/env bash
# Set one Secrets Manager value created empty by Terraform (see `terraform output secrets_to_populate`).
# The value is read from the terminal without echo (or from stdin when piped), so it never appears in the
# command line, shell history or process list.
#
#   deploy/scripts/set-secret.sh hig/production/RAZORPAY_KEY_SECRET
#   pass show razorpay/live/key_secret | deploy/scripts/set-secret.sh hig/production/RAZORPAY_KEY_SECRET
#
# Requires the AWS CLI v2 with credentials for the target account (region: AWS_REGION, default ap-south-1).
# Running tasks read secrets at start-up: after a change, force a new deployment of the api and worker services.
set -euo pipefail

name="${1:?usage: set-secret.sh <secret name>}"
region="${AWS_REGION:-ap-south-1}"

if [[ -t 0 ]]; then
  read -r -s -p "Value for $name: " value; echo
  read -r -s -p "Repeat: " again; echo
  [[ "$value" == "$again" ]] || { echo "values differ - nothing changed" >&2; exit 1; }
else
  value="$(cat)"
fi
[[ -n "$value" ]] || { echo "empty value - nothing changed" >&2; exit 1; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
chmod 600 "$tmp"
printf '%s' "$value" > "$tmp"
unset value again

aws secretsmanager put-secret-value --region "$region" --secret-id "$name" \
  --secret-string "file://$tmp" --query 'VersionId' --output text >/dev/null
echo "updated $name (region $region). Redeploy the api/worker services to pick it up."
