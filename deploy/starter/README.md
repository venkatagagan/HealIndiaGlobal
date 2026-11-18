# Heal India Global on AWS: starter runbook

**Target:** one Graviton EC2 box with the Docker Compose stack plus Amazon RDS PostgreSQL, in **US East (Ohio)
`us-east-2`**, with backups copied to **US West (Oregon) `us-west-2`**. Budget: about **USD 150/month**.
Domain: **healindiaglobal.ai** (public site, portals and API) and **ops.healindiaglobal.ai** (staff console).

Everything here can be prepared without an AWS account. Nothing in this repository calls AWS until you run
`terraform apply` yourself and set `AWS_DEPLOY_ENABLED=true` in GitHub.

| piece | where |
|---|---|
| Infrastructure (Terraform) | [`deploy/terraform/aws-starter/`](../terraform/aws-starter/) |
| First boot of the instance | [`user-data.sh.tftpl`](user-data.sh.tftpl) (Docker, Compose plugin, swap, CloudWatch agent, timers) |
| Deploy on the box | [`deploy.sh`](deploy.sh) (+ `init-secrets.sh`, `db-bootstrap.sh`, `certs.sh`, `common.sh`) |
| Production compose override | [`infra/docker-compose.aws.yml`](../../infra/docker-compose.aws.yml), staff console host [`infra/nginx/aws/`](../../infra/nginx/aws/) |
| CI/CD | [`.github/workflows/deploy-aws.yml`](../../.github/workflows/deploy-aws.yml) (arm64 images to ECR, SSM Run Command) |
| Third-party secrets | [`set-secret.sh`](set-secret.sh) |

```
 Internet ──► Route 53  healindiaglobal.ai, ops.healindiaglobal.ai ──► Elastic IP (80/443 only, no SSH)
                                                                         │
 ┌───────────── EC2 t4g.large (2 vCPU, 8 GiB, AL2023 ARM64, 60 GB gp3 + 4 GB swap) ──────────────────────┐
 │ edge nginx (Let's Encrypt) ─► website (Next.js) · web (4 SPAs) · api (gunicorn/uvicorn)               │
 │                               ops.<domain>: admin SPA + API only (strict auth limits)                 │
 │ worker (jobs, local Whisper speech-to-text) · Redis (cache, realtime, rate limits)                    │
 └────────────┬────────────────────────────┬───────────────────────────┬──────────────────────────────────┘
              │ TLS (sslmode=require)      │ instance role (no keys)   │
   RDS PostgreSQL 17 db.t4g.small     S3 documents (SSE-KMS)      SES e-mail · SNS SMS codes
   private subnets, PITR 7 days       Secrets Manager · ECR       CloudWatch alarms → SNS → e-mail
              └──────── AWS Backup: box + documents daily/weekly, RDS weekly ──► copies in us-west-2
 GitHub Actions ──OIDC──► ECR push + S3 bundle + SSM "hig-production-deploy" (no stored AWS keys)
```

## 1. Monthly cost (estimate)

On-demand list prices for `us-east-2` as remembered for 2026, excluding tax, the Claude API, SMS volume beyond the
limit and data transfer above the 100 GB/month free allowance. **Verify in the AWS Pricing Calculator
(<https://calculator.aws/>) before committing**; prices change.

| line item | size | approx. USD / month |
|---|---|---|
| EC2 t4g.large on-demand | 730 h | 49 |
| EBS gp3 root | 60 GB | 5 |
| Public IPv4 (Elastic IP, in use) | 1 | 4 |
| RDS PostgreSQL db.t4g.small single-AZ | 730 h | 24 |
| RDS gp3 storage + automated backups (PITR 7 days, backup ≤ DB size is free) | 50 GB | 6 |
| Performance Insights | free tier (7 days) | 0 |
| S3 documents + deploy bundles | a few GB at launch | 1-2 |
| AWS Backup (EBS + S3 + RDS snapshots, both regions, cross-region transfer) | incremental | 6-12 |
| KMS customer-managed key | 1 | 1 |
| Secrets Manager | 2 app secrets + the RDS-managed one | 1.2 |
| CloudWatch: ~12 alarms, ~8 agent metrics, logs (2-5 GB) | | 5-8 |
| Route 53: hosted zone (already exists) + HTTPS health check | | 1.5-3 |
| ECR (3 repos, 20 images each, arm64) | ~10-15 GB | 1-2 |
| SES e-mail | ~10,000 mails | 1 |
| SNS SMS one-time codes | capped by the spend limit (USD 1 until raised) | 1-20 |
| Data transfer out | first 100 GB free | 0-9 |
| AWS Budgets, SSM, GitHub OIDC | | 0 |
| **Total** | | **~USD 110-150** |

Levers: a 1-year Compute Savings Plan for EC2 (~30% off) and a 1-year RDS reserved instance (~35% off) once the
size is settled; `ship_container_logs = false` (keeps logs on the box only); `ecr_keep_images = 10`.

## 2. What you give up compared with the full stack (`deploy/terraform/aws`)

| full stack | starter | consequence |
|---|---|---|
| ECS Fargate, 2-10 API tasks over 3 AZs, rolling deploys | one EC2 box | a box or AZ failure means minutes of downtime (EC2 auto-recovery, then restore); deploys restart containers (seconds to ~1 min of errors) |
| RDS Multi-AZ | single-AZ | an AZ outage or RDS maintenance means downtime; PITR still gives ~5 min RPO |
| ElastiCache Redis (replicated) | Redis container on the box | cache/realtime state lost on box replacement (no business data in Redis) |
| CloudFront + WAF (managed rules, rate limits at the edge) | nginx on the box (rate limits, TLS) | no CDN caching close to patients abroad, no WAF managed rules; DDoS protection is AWS Shield Standard only |
| S3 cross-region replication + Secrets Manager replicas | AWS Backup copies (daily/weekly) | region loss: documents up to 24 h old, DB up to 1 week old (weekly snapshot) unless you restore PITR in-region |
| VPC flow logs, NAT, interface endpoints | public subnet with an EIP, SG 80/443 | simpler and cheaper; outbound traffic not filtered |
| Per-environment staging | none | test on a laptop / ngrok preview; add a second `environment` later (another ~USD 90/month) |

Upgrade when traffic, uptime targets or the hospitals' contracts need it (§12).

## 3. Before the account exists

Nothing to do in AWS. Keep CI green: the deploy workflow skips itself with a notice while the repository variable
`AWS_DEPLOY_ENABLED` is not `true`.

## 4. Create and secure the AWS account (day 1)

1. Sign up at <https://aws.amazon.com/> with a company mailbox (e.g. `aws@healindiaglobal.ai`), company card and
   the legal entity's address. TODO-BUSINESS: which entity holds the account (affects the AWS contracting entity in
   the privacy policy).
2. **Root user:** enable MFA (hardware key or authenticator app), do not create root access keys, store the
   recovery details offline. Set the alternate contacts (billing, operations, security → `contact@healindiaglobal.ai`).
3. **Admin access:** IAM Identity Center (or an IAM user with MFA) for the person who runs Terraform; never use root
   for daily work. Give it `AdministratorAccess` for the first apply; tighten later.
4. **Billing:** turn on "Receive Billing Alerts" and Cost Explorer. Terraform creates the USD 150 budget, but you
   may create one by hand on day 1 as a safety net.
5. **AWS Artifact → Agreements:** accept the **Business Associate Addendum (BAA)** (precaution; see
   `docs/legal/PRIVACY_POLICY.md` §19). The AWS GDPR Data Processing Addendum (with SCCs) is part of the AWS
   Service Terms automatically; download a copy for the records (`docs/legal/ROPA.md`).
6. Region: work in **US East (Ohio) `us-east-2`**. `us-west-2` needs no opt-in.

## 5. Domain: healindiaglobal.ai

- The hosted zone already exists in Route 53: Terraform looks it up by name (`create_hosted_zone = false`) and adds
  the apex `A`, `ops` `A`, SES DKIM (3 CNAMEs), `mail.` MX + SPF and `_dmarc` TXT records. It never touches the
  apex MX/SPF of the `contact@healindiaglobal.ai` mailbox.
- Check that the registrar points at that zone: `dig NS healindiaglobal.ai +short` must list the zone's four
  `awsdns` name servers.
- If an `A` record for the apex or `ops` already exists (parking page, preview), delete it or import it first:
  `terraform import 'aws_route53_record.site[0]' <ZONEID>_healindiaglobal.ai_A`. If a `_dmarc` record already
  exists, set `create_dmarc_record = false`.
- **`.ai` specifics:** `.ai` is the ccTLD of Anguilla. Some registrars sell it only with a **minimum 2-year
  registration** and renewal, and prices are higher than `.com` (budget roughly USD 70-160 per year - check your
  registrar). Route 53 can register and host `.ai` domains. Keep **auto-renew on** and the registrar account
  under company control (an expired domain takes the site, e-mail and DKIM down at once). Optionally enable DNSSEC
  signing in Route 53 after launch.

## 6. Apply the infrastructure

Tools on the admin workstation: Terraform ≥ 1.6 (the project pins 1.17.2 under `.devtools/terraform`), AWS CLI v2,
`jq`.

```bash
cd deploy/terraform/aws-starter
cp terraform.tfvars.example terraform.tfvars      # defaults are the owner's decisions; review them
#   alert_email = "contact@healindiaglobal.ai", allowed_staff_cidrs = [], bootstrap_mode = true
# optional remote state: see backend.tf.example (S3 + DynamoDB lock, created by ../aws/bootstrap)
terraform init
terraform plan -out tfplan
terraform apply tfplan            # ~15 minutes (RDS)
terraform output                  # keep this: instance id, EIP, endpoints, GitHub variables
```

Then:

1. **Confirm the alert e-mails.** AWS sends **two** "AWS Notification - Subscription Confirmation" e-mails to
   `contact@healindiaglobal.ai` (one per SNS topic: us-east-2 alarms and the us-east-1 site health check). Click both
   links, or no alarm will ever arrive. Budget alerts need no confirmation.
2. The site health-check alarm is red until the first deploy - expected.
3. The box boots and prepares itself (5-10 minutes: Docker, Compose, swap, CloudWatch agent). Check with
   `aws ssm start-session --target <instance_id>` then `sudo tail /var/log/hig-bootstrap.log`.

## 7. E-mail (SES) and SMS (SNS)

**SES** (identity, DKIM, MAIL FROM `mail.healindiaglobal.ai`, DMARC and a configuration set with bounce/complaint
suppression are created by Terraform):

1. SES console → Identities → `healindiaglobal.ai`: DKIM "Successful" and MAIL FROM "Success" within ~1 hour.
2. **Request production access** (SES → Account dashboard). New accounts are in the SES sandbox: mail reaches only
   verified addresses. Describe the use: transactional mail only (verification, password reset, booking and case
   updates), opt-in marketing separately, bounce/complaint handling through the configuration set. Approval usually
   takes about a day.
3. Sender: `Heal India Global <no-reply@healindiaglobal.ai>` (`email_from`). The app sends through the SES API with
   the instance role: there is no SMTP password.

**SMS one-time codes** (`SMS_PROVIDER=sns`, guests verifying a phone number; text in the guest's language from
`sms.verification_code`):

- New accounts are in the **SNS SMS sandbox**: only verified destination numbers receive messages (SNS → Text
  messaging → Sandbox destination phone numbers). Add your own phones for testing, then request production access
  (SNS → Text messaging → "Exit SMS sandbox" support case).
- The account **spend limit starts at USD 1/month**. Ask AWS Support for a higher SMS spend quota (state the expected
  monthly volume and destination countries), then set `sms_monthly_spend_limit_usd` and apply.
- **United States destinations** require a registered origination identity: register a **toll-free number** (or 10DLC
  campaign) in AWS End User Messaging SMS (registration takes days to weeks), then set
  `sms_origination_number = "+1..."`.
- **India** destinations require **DLT** registration (TRAI) of the entity, sender ID and template; Gulf states,
  Nigeria, Kenya and others have their own sender-ID registration rules. Some countries show a generic number instead
  of a sender ID. Until registrations are done, keep `sms_allowed_country_codes` to the countries that work - other
  numbers get "please use your email address instead" (also the SMS-pumping guard).
- `enable_sms = false` switches SMS off (`SMS_PROVIDER=none`): guests verify by e-mail.

## 8. Secrets

Generated secrets (JWT, field-encryption key, DB and Redis passwords, revalidation secret) are created **on the box**
at the first deploy and stored in `hig/production/generated` - never in Terraform state or git. Never replace
`FIELD_ENCRYPTION_KEY` (rotation needs the re-encryption job, `docs/OPERATIONS.md`).

Third-party credentials go into `hig/production/third-party`, one key at a time, without echo:

```bash
deploy/starter/set-secret.sh ANTHROPIC_API_KEY
deploy/starter/set-secret.sh RAZORPAY_KEY_ID
deploy/starter/set-secret.sh RAZORPAY_KEY_SECRET
deploy/starter/set-secret.sh RAZORPAY_WEBHOOK_SECRET
deploy/starter/set-secret.sh APPLE_PRIVATE_KEY --file AuthKey_XXXX.p8      # if Sign in with Apple is used
deploy/starter/set-secret.sh FCM_SERVICE_ACCOUNT_JSON --file firebase-sa.json   # push notifications
deploy/starter/set-secret.sh SENTRY_DSN                                     # optional
deploy/starter/set-secret.sh --list
```

Public identifiers (Google client ids, Apple team/key id, FCM project id, payment gateways, AI model, privacy
contacts) are Terraform variables (`terraform.tfvars`). Changes apply at the next deploy.

## 9. GitHub and the first deploy

1. Repository → Settings → Secrets and variables → Actions → **Variables**: set every entry of
   `terraform output github_repository_variables` (no secrets are needed - OIDC):

   ```bash
   terraform output -json github_repository_variables | jq -r 'to_entries[] | "\(.key)\t\(.value)"' |
     while IFS=$'\t' read -r k v; do gh variable set "$k" --body "$v"; done
   ```

   Set `AWS_DEPLOY_ENABLED=true` last. Optional: `AWS_BUILD_RUNNER=ubuntu-24.04-arm` for native arm64 builds.
2. Actions → **Deploy (AWS starter)** → Run workflow (branch `main`). It builds the three linux/arm64 images (QEMU:
   30-60 minutes the first time, cached afterwards), pushes them to ECR, uploads the deploy bundle and runs the
   `hig-production-deploy` SSM document. From then on every green CI run on `main` deploys automatically.
3. On the box, `deploy.sh` (log: `/var/log/hig-deploy.log`, also in CloudWatch `/hig/production/system`):
   generated secrets → `.env` (0600) → image pull → RDS roles (`db-bootstrap.sh`: migrator owner + DML-only app
   role, extensions) → `alembic upgrade head` as the migrator → `docker compose up` → health gate → Let's Encrypt
   certificate for `healindiaglobal.ai` + `ops.healindiaglobal.ai` → Whisper model download → website refresh.
   A failed health gate rolls back to the previous release automatically.
4. Check: <https://healindiaglobal.ai/health/ready>, <https://healindiaglobal.ai/>,
   <https://ops.healindiaglobal.ai/gahi/>; the site-down alarm turns OK within a few minutes.
5. **Turn off the bootstrap permissions:** set `bootstrap_mode = false` in `terraform.tfvars` and
   `terraform apply` (the box can then no longer read the RDS master secret or write the generated secret).

## 10. First accounts

In an SSM session on the box (`aws ssm start-session --target <instance_id>`, then `sudo -i`):

```bash
# First super admin (password typed twice, never on the command line; prints a one-time MFA enrolment code)
hig-compose exec api python -m scripts.create_superadmin --email ops.lead@healindiaglobal.ai --name "Ops Lead"
```

Sign in at <https://ops.healindiaglobal.ai/gahi/> with the enrolment code and set up the authenticator (staff MFA
is mandatory in production).

**App Store / Google Play review accounts** (`scripts/seed_review_accounts.py`; passwords only from the environment):

```bash
read -rsp 'patient password: ' REVIEW_PATIENT_PASSWORD; echo
read -rsp 'agent password: ' REVIEW_AGENT_PASSWORD; echo
read -rsp 'hospital password: ' REVIEW_HOSPITAL_PASSWORD; echo
export REVIEW_PATIENT_PASSWORD REVIEW_AGENT_PASSWORD REVIEW_HOSPITAL_PASSWORD
hig-compose exec -e REVIEW_PATIENT_PASSWORD -e REVIEW_AGENT_PASSWORD -e REVIEW_HOSPITAL_PASSWORD \
  api python -m scripts.seed_review_accounts
unset REVIEW_PATIENT_PASSWORD REVIEW_AGENT_PASSWORD REVIEW_HOSPITAL_PASSWORD
```

Add `-e REVIEW_PATIENT_EMAIL=...` (and agent/hospital) to use your own addresses; rotate the passwords after every
store review. Demo data (`scripts.seed`) refuses to run with `ENV=production`.

**Visa rules:** the seeded visa guidance was researched on 2026-11-09 while the official e-Visa portal refused
automated access. Before launch, re-verify every rule on <https://indianvisaonline.gov.in/> (reviewer notes:
`REVIEWER_CAVEATS` in `backend/app/modules/travel/visa_data.py`) and correct it in Admin → Visa rules.

## 11. Day-2 operations

| task | how |
|---|---|
| Deploy | merge to `main` (CI green → deploy), or run the workflow by hand |
| Redeploy / roll back to a commit | `aws ssm send-command --document-name hig-production-deploy --instance-ids <id> --parameters ImageTag=<git sha>` (admin credentials), or on the box `sudo hig-deploy <git sha>`. Images and bundles of the last 20 builds are kept. Migrations are never rolled back: keep them expand-only |
| Logs | CloudWatch Logs `/hig/production/containers` and `/hig/production/system`; on the box `sudo hig-compose logs -f api worker` |
| Shell on the box | `aws ssm start-session --target <id>` (no SSH, no open port 22) |
| Database shell | on the box: `docker run --rm -it --network host -e PGPASSWORD public.ecr.aws/docker/library/postgres:17-alpine psql "host=<rds endpoint> dbname=healindia user=healindia_migrator sslmode=require"` after `read -rs PGPASSWORD; export PGPASSWORD` (migrator password from the `hig/production/generated` secret). Prefer read-only checks; changes go through migrations |
| Certificates | automatic (timer twice a day); force: SSM document `hig-production-certs` or `sudo /opt/hig/current/deploy/starter/certs.sh` |
| OS patches | security updates install automatically (dnf-automatic, no reboot). Monthly: `sudo dnf upgrade --releasever=latest -y && sudo reboot` in a quiet hour (containers restart by themselves) |
| Rotate a third-party secret | `set-secret.sh KEY`, redeploy, revoke the old credential at the provider |
| Rotate DB passwords | delete the key from the generated secret with the console, set `bootstrap_mode = true`, apply, redeploy (new password + `ALTER ROLE`), set it back to false |
| Staff IP allow-list (later) | set `allowed_staff_cidrs = ["203.0.113.0/24", ...]`, `terraform apply`, redeploy: the API enforces `STAFF_ALLOWED_IPS` and nginx adds an allow-list on `ops.healindiaglobal.ai` |
| Better speech recognition | `whisper_model = "medium"` and raise the worker `mem_limit` to 4g in `infra/docker-compose.aws.yml` (or move to t4g.xlarge) |
| Bigger box | change `instance_type` (e.g. `t4g.xlarge`) and apply: the instance stops/starts (~2 min downtime); same EBS, EIP |
| Bigger database | change `rds_instance_class`, apply (applied in the maintenance window; `apply_immediately` is off) |

**Alarms** (e-mail to `contact@healindiaglobal.ai`): CPU > 80% for 15 min, memory > 85%, root disk > 80%
(`docker image prune -af`), status checks (system → automatic recovery; instance → reboot), RDS CPU > 80%, RDS free
storage < 10 GiB, RDS freeable memory low, site down (Route 53 HTTPS check of `/health/ready`), budget 80%
forecast / 80% / 100% actual.

### Restore drill (do it before launch, then every quarter)

1. **Database, point in time** (accidental change/delete): RDS → `hig-production-pg` → Actions → Restore to point in
   time → new instance `hig-production-pg-drill` in the same subnet group and security group. Connect from the box
   (see "Database shell"), check row counts / the affected rows, copy back what is needed, then delete the drill
   instance. Record the time it took.
2. **Database, from the weekly copy in us-west-2** (region loss): AWS Backup → us-west-2 → vault
   `hig-production-dr-vault` → the RDS recovery point → Restore. For a full regional rebuild, apply this Terraform in
   us-west-2 with `rds_snapshot_identifier` set to a snapshot shared/copied there.
3. **Box:** AWS Backup → the EC2 recovery point → Restore (launches a new instance from the AMI). Or simply rebuild:
   `terraform apply -replace=aws_instance.app` (needs `instance_termination_protection = false` first) and redeploy
   the current tag - the box holds no unique data (certificates are re-issued, Redis is a cache).
4. **A deleted or overwritten document:** S3 → documents bucket → "Show versions" → restore the previous version
   (kept 30 days), or AWS Backup S3 recovery point (daily 7 / weekly 28 days, also in us-west-2).
5. Write down RPO/RTO achieved; targets: PITR ~5 min RPO / 1-2 h RTO; region loss ≤ 1 week DB RPO (weekly copy) /
   4-8 h RTO.

## 12. Upgrade path to the full stack (`deploy/terraform/aws`)

When uptime or scale needs it: Multi-AZ, Fargate autoscaling, CloudFront + WAF, ElastiCache, cross-region
replication.

1. Apply `deploy/terraform/aws` in the same account and region (defaults are already us-east-2 / us-west-2; separate
   state and VPC). Use `rds_snapshot_identifier` = a fresh manual snapshot of `hig-production-pg` to start with the
   current data, and copy the documents bucket (`aws s3 sync` or point `S3_BUCKET` at the existing bucket and grant
   the task role).
2. Carry the secrets over: the same `FIELD_ENCRYPTION_KEY` and `JWT_SECRET` (copy values from
   `hig/production/generated` into the full stack's secrets with `deploy/scripts/set-secret.sh`; never generate new
   ones for existing data).
3. The full stack still serves the SPAs on separate hosts and needs the website ECS service and the
   single-domain/`ops.` layout (deploy/README.md "Known gaps"); plan that work first.
4. Freeze writes (maintenance page), take the final snapshot, restore, switch DNS, verify, then
   `terraform destroy` the starter (disable deletion protection and termination protection first; keep the final
   snapshots and the backup vault copies until the retention ends).

Optional in between: **CloudFront in front of the box** (cheap: 1 TB/month free tier) for static assets close to
patients abroad. Not enabled now because TLS would terminate twice and the API would have to trust
`CloudFront-Viewer-Address` only when the box is reachable solely through CloudFront (`TRUST_CLOUDFRONT_VIEWER_ADDRESS`,
a prefix-list security group and an origin certificate) - see deploy/README.md "Client IP behind CloudFront".

## 13. Troubleshooting

| symptom | check |
|---|---|
| Workflow says "AWS deploy skipped" | `AWS_DEPLOY_ENABLED` must be exactly `true`; manual runs only from `main` |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | `github_repository` / `github_deploy_branch` in tfvars match the repo; `AWS_DEPLOY_ROLE_ARN` correct; OIDC provider exists (`create_github_oidc_provider`) |
| Deploy fails at "migrations" | `/var/log/hig-deploy.log`; first deploy needs `bootstrap_mode = true` (roles); RDS reachable (security group) |
| API refuses to start: "Invalid production settings" | the message lists the setting; most come from Terraform (`extra_app_environment`) or the secrets |
| Certificate still self-signed | DNS must resolve to the EIP (`dig +short healindiaglobal.ai`); then SSM document `hig-production-certs`. Let's Encrypt rate limits: test with `CERTBOT_STAGING=true certs.sh` |
| E-mails not arriving | SES sandbox (production access), DKIM status, suppression list (SES → Configuration → Suppression list) |
| SMS not arriving | SNS sandbox / spend limit (CloudWatch metric `SMSMonthToDateSpentUSD`), origination number for US numbers, `sms_allowed_country_codes` |
| Voice notes fail | worker log `voice.*`; model download (`hig-compose exec worker python -m scripts.prefetch_whisper_model`) |
