# Heal India Global: production deployment

This directory holds the infrastructure-as-code for running Heal India Global in production. There are two
interchangeable compute targets:

| path | what |
|---|---|
| `terraform/aws/` | **Primary.** AWS `ap-south-1` (Mumbai, keeps patient data in India): VPC, ECS Fargate, RDS PostgreSQL 17 Multi-AZ, ElastiCache Redis 7, S3, CloudFront, WAF, Secrets Manager, CloudWatch alarms, AWS Backup and DR |
| `k8s/` | Alternative: kustomize base plus `staging` and `production` overlays for any Kubernetes cluster with ingress-nginx and cert-manager (see `k8s/README.md`) |
| `observability/` | Prometheus scrape config and rules, Alertmanager, SQL/Redis/blackbox exporters, the Grafana dashboard (see `observability/README.md`) |
| `scripts/set-secret.sh` | Sets a Secrets Manager value without echoing it |

The single-host, production-like stack (`infra/docker-compose.yml`) is a separate setup. It serves everything
from one domain behind nginx, as PLAN section 3.1 specifies. It is the reference for path routing, the
least-privilege database roles and client-IP handling.

## Architecture (AWS)

```
                           Internet (patients, agents, hospitals, staff, Razorpay/Stripe webhooks)
                                                 |
                                   Route 53 (optional) + ACM certificates
                                                 |
                     +------------------- CloudFront (WAF: managed rules, rate limit on /api/v1/auth/*) ---------+
                     |  patient / agent / hospital / admin distributions + api.<domain>                          |
                     |  /assets/* and SPA shell -> S3 (OAC, private)    /api/* -> ALB (secret origin header)    |
                     +---------------------------------------------+------------------------------------------------+
                                                                   |
  VPC 10.40.0.0/16, 3 AZ   public subnets: ALB (HTTPS, WebSocket, idle 120 s), NAT gateways
                           private subnets:  ECS Fargate
                                             +-- api     (gunicorn+uvicorn :8000, 2-10 tasks, /health/ready)
                                             +-- worker  (python -m app.worker, 1-4 tasks, no load balancer)
                                             +-- migrate / db-bootstrap (one-off tasks)
                           isolated subnets: RDS PostgreSQL 17 Multi-AZ (KMS, PITR 14 d, pg_stat_statements)
                                             ElastiCache Redis 7 (TLS + AUTH, 2 nodes)
                                                                   |
     S3 documents bucket (SSE-KMS, versioned, private, lifecycle)  |  Secrets Manager (KMS) -> task definitions
     CloudWatch logs + alarms -> SNS                               |  AWS Backup (daily/monthly) -> DR region (ap-south-2)
```

## Deploy step by step

Prerequisites:
- Terraform 1.6 or later
- AWS CLI v2
- Docker with buildx
- Node 22 (SPA builds)
- an AWS account with a deployment role
- a domain, either a Route 53 hosted zone or DNS that you manage

1. **Remote state (once per account).** Apply `terraform/aws/bootstrap/`, which creates an S3 state bucket and a
   DynamoDB lock table. Then copy `backend.tf.example` to `backend.tf` and `backend.hcl.example` to
   `backend.hcl`, and run:
   ```
   terraform init -backend-config=backend.hcl
   ```
2. **Variables.** Copy `terraform.tfvars.example` to `terraform.tfvars`. At minimum set:
   - `environment`, `domain_name`, `route53_zone_id` (or bring your own certificates)
   - `alarm_emails`, `payment_gateways`
   - `nat_gateway_mode`: `single` for staging, `per_az` for production

   Never put secrets in tfvars.
3. **First apply with services stopped:**
   ```
   terraform apply -var start_services=false -var image_tag=<git-sha>
   ```
   This creates the network, data stores, ECR repositories, secrets (generated ones filled in, third-party
   ones empty), CloudFront and WAF.
4. **Build and push images** to `terraform output ecr_repository_urls`:
   ```
   aws ecr get-login-password | docker login --username AWS --password-stdin <registry>
   docker buildx build --platform linux/amd64 -t <api repo>:<git-sha> --push backend
   ```
   Use immutable tags (the git SHA). Set `cpu_architecture = "ARM64"` and build `linux/arm64` for Graviton.
5. **Third-party secrets.** For each name in `terraform output secrets_to_populate`, run
   `deploy/scripts/set-secret.sh <name>`. These are the Razorpay, Stripe, Anthropic and SMTP credentials.
6. **Database bootstrap, then migrations.** Each is a one-off Fargate task. Read the network configuration from
   `terraform output -raw one_off_task_network_configuration`:
   ```
   aws ecs run-task --cluster <cluster> --launch-type FARGATE \
     --task-definition <db_bootstrap_task_definition_arn> --network-configuration '<json>'
   aws ecs run-task ... --task-definition <migrate_task_definition_arn>   # alembic upgrade head
   ```
   Wait for exit code 0 (`aws ecs wait tasks-stopped`, then `describe-tasks`).
7. **Start the services:**
   ```
   terraform apply -var start_services=true -var image_tag=<git-sha>
   ```
   ECS rolls the API with a circuit breaker and rollback. `/health/ready` gates ALB registration.
8. **Publish the SPAs.**
   1. Build each app with the values from `terraform output spa_build_env`:
      ```
      npm ci && npm run build -w apps/<app>
      ```
   2. Upload and invalidate:
      ```
      aws s3 sync apps/<app>/dist s3://<bucket>/ --delete --cache-control "public,max-age=31536000,immutable" --exclude index.html
      aws s3 cp apps/<app>/dist/index.html s3://<bucket>/index.html --cache-control "no-cache"
      aws cloudfront create-invalidation --distribution-id <id> --paths /index.html "/"
      ```
   Bucket names and distribution ids are in `spa_buckets` and `cloudfront_distribution_ids`.
9. **Payment webhooks.** Register `terraform output webhook_urls` in the Razorpay and Stripe dashboards, and put
   the signing secrets in `RAZORPAY_WEBHOOK_SECRET` and `STRIPE_WEBHOOK_SECRET` (step 5). Both endpoints are on
   the API domain and are never rate-limited by IP. The API verifies signatures over the raw body.
10. **DNS.** Without Route 53, create the records listed in `terraform output dns_records_to_create`.
11. **Monitoring.** Confirm the SNS e-mail subscriptions, then deploy `observability/` (see its README).

**Every later release:**
1. Build and push the new image tag.
2. Run the migrate task with the new task definition. Use expand/contract migrations only, because old tasks
   keep running during the rollout.
3. Run `terraform apply -var image_tag=<sha>`.
4. Publish the SPAs.

### Secrets rotation

| secret | how |
|---|---|
| `JWT_SECRET` | Write a new value, then redeploy the api and worker. Access tokens last 15 minutes. Users must sign in again only if their refresh tokens are signed with it (they are opaque, DB-backed rows, so they are not). |
| DB app password | `terraform apply -replace=random_password.db_app`, run the db-bootstrap task (it resets the role password), then redeploy. |
| `FIELD_ENCRYPTION_KEY` | **Do not simply replace it.** Data encrypted with it becomes unreadable. Rotate with a re-encryption job (decrypt with the old key, encrypt with the new key) and back the key up offline. |
| Razorpay / Stripe / SMTP / Anthropic | Create the new credential at the provider, run `set-secret.sh`, redeploy, then revoke the old credential. For webhook secrets, both gateways let you roll the secret with an overlap window. |
| Redis AUTH | ElastiCache supports a rotation window (`auth_token_update_strategy = ROTATE`, then `SET`). |

## Launch sizing and rough monthly cost

**These are estimates only.** They use on-demand `ap-south-1` list prices as of 2026, exclude tax, data transfer
beyond a modest amount, Support plans and the Claude API. Check the AWS Pricing Calculator before committing.

| component | launch default | approx. USD / month |
|---|---|---|
| ECS Fargate api | 2 x (0.5 vCPU, 1 GB), auto-scales to 10 | 35-45 |
| ECS Fargate worker | 1 x (0.5 vCPU, 1 GB) | 15-25 |
| RDS PostgreSQL 17 | db.t4g.medium Multi-AZ, 50 GB gp3, PITR 14 d | 190-240 |
| ElastiCache Redis 7 | 2 x cache.t4g.small | 45-60 |
| NAT gateways | 3 (per AZ), plus processing | 110-150 |
| ALB | 1, low LCU | 20-30 |
| CloudFront + WAF | 5 distributions, 1 web ACL, managed rules | 25-60 |
| S3, KMS, Secrets Manager, CloudWatch logs and alarms, AWS Backup | | 40-80 |
| **Total, production launch** | | **~500-700** |
| Staging | `nat_gateway_mode=single`, single-AZ db.t4g.small, 1 Redis node, 1 api task | ~150-250 |
| Growth (about 10x traffic) | db.r7g.large Multi-AZ, 4-6 api tasks (1 vCPU), cache.r7g.large x2 | ~1,500-2,500 |

Cost levers:
- Graviton (`cpu_architecture = "ARM64"`)
- Fargate Spot for the worker (`worker_use_fargate_spot`)
- a single NAT gateway outside production
- VPC interface endpoints (`enable_interface_endpoints`) when NAT data processing dominates

## Scaling

- **API:**
  - Target tracking on CPU (60%), memory (75%) and ALB requests per target (1500/min).
  - Range is `api_min_count` to `api_max_count`.
  - Each task holds `DB_POOL_SIZE + DB_MAX_OVERFLOW` connections per gunicorn worker. Keep
    `max tasks x WEB_CONCURRENCY x (pool + overflow)` below RDS `max_connections` minus a reserve, or add RDS
    Proxy.
- **Worker:** CPU target tracking, 1-4 tasks. Jobs are claimed with `SKIP LOCKED`, so more tasks increase
  throughput safely. The queue-depth alerts in `observability/` say when to raise `worker_max_count`.
- **WebSocket:** fan-out goes through Redis pub/sub, so any API task can serve any client. The ALB idle
  timeout is 120 s. Clients must send a keep-alive message more often than that, or reconnect.
- **Database:**
  - Scale vertically: change `rds_instance_class` (Multi-AZ fails over in about 1-2 minutes).
  - Add a read replica for reporting before splitting traffic in the app.
  - Ledger balance rows are a write hot spot under heavy concurrent payments (INTEGRATION_BACKLOG #35). Watch
    lock waits in `pg_stat_statements` and `pg_stat_activity`.
- **Rate limits:**
  - WAF limits per IP at the edge: `waf_auth_rate_limit` on `/api/v1/auth/*` and `waf_global_rate_limit`.
  - Offices behind one NAT share an IP. The API's own limiter should key authenticated traffic per user, not per
    IP (INTEGRATION_BACKLOG #35; the compose nginx already keys authenticated calls per session).

## Backup and disaster recovery

| scenario | mechanism | RPO target | RTO target |
|---|---|---|---|
| Bad deploy or bad migration | ECS rollback. Migrations are expand-only; PITR restore to a new instance if data was damaged | 0 for code; about 5 min for data (PITR) | 15-60 min |
| Accidental data change or delete | RDS PITR (14 days) to a new instance, then copy the affected rows back | about 5 min | 1-2 h |
| AZ failure | RDS Multi-AZ failover, Redis replica promotion, ECS tasks spread over 3 AZs | 0 | 1-5 min (automatic) |
| Document deleted or overwritten | S3 versioning (noncurrent versions kept `documents_noncurrent_expiration_days`) | 0 | minutes |
| Region loss (`enable_dr = true`) | AWS Backup copies daily snapshots to `dr_region` (ap-south-2 Hyderabad, still in India). Documents replicated by CRR. Secrets and ECR images replicated | 24 h for the DB (daily copy); minutes for documents | 4-8 h (apply the stack in the DR region from the copied snapshot with `rds_snapshot_identifier`) |
| Long-term retention | AWS Backup monthly snapshots kept 365 days | n/a | n/a |

Practise a restore every quarter: restore PITR into a scratch instance, run the app's smoke tests against it, and
record the timings. To get a database RPO under 24 h for region loss, add RDS cross-region automated backup
replication. It replicates transaction logs as well, so the RPO drops to minutes.

## CDN and caching (provider-neutral)

The production domain and the CDN provider are **not decided yet**. Everything below is expressed as origin
headers plus path rules, so it maps onto CloudFront, Cloudflare or any other CDN. The origin is the edge nginx
(`infra/nginx`), the k8s ingress, or the CloudFront origins in `terraform/aws`.

### What the origin sends

| path | origin `Cache-Control` | CDN rule |
|---|---|---|
| `/_next/static/*` (website build output, content-hashed) | `public, max-age=31536000, immutable` (errors: `no-store`) | cache, honour origin |
| `/app/assets/*`, `/agent/assets/*`, `/hospital/assets/*`, `/gahi/assets/*` (Vite, content-hashed) | same | cache, honour origin |
| `/app/`, `/agent/`, `/hospital/`, `/gahi/` SPA shells | `no-cache` (from the web image) | honour origin |
| website HTML (`/`, `/hospitals/...`, `/treatments/...`, guides) | set by Next.js: ISR pages `s-maxage=<revalidate>, stale-while-revalidate=...`; dynamic and auth-door pages (`/login`, `/register`, ...) `private, no-cache, no-store` | honour origin (`s-maxage` is the CDN TTL) |
| `/_next/image` | set by Next.js (image TTL) | honour origin, query string in the key |
| public catalogue `GET /api/v1/{specialties,procedures,hospitals,doctors,cost-comparison,search,content/*,...}` | `public, max-age=300, stale-while-revalidate=3600` + `ETag` (304 on `If-None-Match`); `private, no-cache` when the request carries `Authorization` | optional: honour origin, query string in the key, **bypass when `Authorization` is present** |
| every other `/api/*` response | the API's value, or `no-store` when it sets none (edge default); always `private, no-store` with `Authorization` | **never cache**; forward all headers, cookies and query strings |

Rules for every provider:
- Never cache a response that sets a cookie, nor a request that carries `Authorization` or a session cookie
  (`hig_refresh`, `hig_staff_refresh`; both scoped to `/api/v1/auth`, which is never cached).
- Portals are never indexed: `/app/`, `/agent/`, `/hospital/`, `/gahi/` (assets included) and all of `/api/`
  answer with `X-Robots-Tag: noindex, nofollow` (edge nginx, k8s `hig-noindex-headers`, CloudFront response
  headers policies). With the header in place `robots.txt` needs no `Disallow` for them (a `Disallow` would stop
  crawlers from fetching the page and seeing the `noindex`). Only the website at `/` is indexable.
- Compression: the edge nginx sends gzip (the official image has no Brotli module); let the CDN negotiate Brotli
  with browsers. `Vary: Accept-Encoding` is sent.
- The website's server-side fetches go to the API directly (compose `http://api:8000`, k8s `hig-api:8000`),
  never through the CDN; otherwise an on-demand revalidation re-reads a catalogue copy up to 5 minutes old.
- A deploy changes the `/_next/static/` file names, so old and new pages never mix assets. Do not purge the CDN
  on catalogue changes; on-demand revalidation plus `s-maxage` handle that.

### CloudFront mapping

| behavior (path pattern) | cache policy | origin request policy | response headers policy |
|---|---|---|---|
| `/_next/static/*`, `/*/assets/*` | Managed-CachingOptimized | none | security headers |
| `/api/*` (and `/api/v1/auth/*`) | Managed-CachingDisabled | Managed-AllViewerExceptHostHeader (forwards `CloudFront-Viewer-Address`) | HSTS + `X-Robots-Tag` (`terraform/aws/cloudfront.tf`) |
| optional, ordered before `/api/*`: public catalogue GET paths | Managed-UseOriginCacheControlHeaders-QueryStrings | Managed-AllViewerExceptHostHeader | as API |
| `/app/*`, `/agent/*`, `/hospital/*`, `/gahi/*` | SPA HTML policy (`spa_html`) | none | portal policy with `X-Robots-Tag` |
| default `/*` (website) | Managed-UseOriginCacheControlHeaders-QueryStrings | Managed-AllViewerExceptHostHeader | website policy **without** `X-Robots-Tag` (Next.js sets its own security headers) |

Turn on "Compress objects automatically" (gzip + Brotli). CloudFront honours `s-maxage` and
`stale-while-revalidate`. Keep authenticated calls on CachingDisabled behaviors (a cache policy that does not
include `Authorization` in the key must never serve authenticated requests).

### Cloudflare mapping

- Cache Rules, in order: (1) path starts with `/api/` and (header `Authorization` exists or cookie contains
  `hig_`) -> Bypass cache; (2) `/api/` except the public catalogue GET paths -> Bypass cache; (3) public
  catalogue paths -> Eligible for cache, Edge TTL "use cache-control header if present"; (4) `/_next/static/*` and
  `/*/assets/*` -> Eligible, respect origin; (5) the rest of the website -> Eligible for cache, Edge TTL "use
  cache-control header if present, bypass if not" (Cloudflare does not cache HTML without a rule; it uses
  `s-maxage` as the edge TTL).
- Brotli is on by default. Keep "Respect strong ETags" on so the API's `ETag` / 304 survive.
- No Transform Rule is needed for `X-Robots-Tag`: the origin already sends it.

### On-demand revalidation (catalogue changes reach the website in seconds)

The API records catalogue writes (hospital / doctor / procedure / specialty / benchmark / package create,
update, approve, suspend, doctor verification) in the same transaction, and the worker calls the website
(contract in `website/README.md`):

```http
POST ${WEBSITE_REVALIDATE_URL}
Authorization: Bearer ${REVALIDATE_SECRET}
Content-Type: application/json

{"tags": ["hospital:<slug>", "doctor:<slug>", "procedure:<slug>", "specialty:<slug>", "catalog"]}
```

Transport errors, 408/425/429 and 5xx are retried with exponential backoff (6 attempts over about 15 minutes);
other 4xx fail the job (wrong secret). The ISR period (`REVALIDATE_SECONDS`) is the safety net. The call goes
container-to-container (compose `http://website:3000/api/revalidate`, k8s `http://hig-website:3000/api/revalidate`):
on the public domain `/api/` belongs to FastAPI, so the website's route is not reachable from outside.

After a deploy (the image is built without API access, so it ships fallback pages until ISR replaces them),
force a full refresh without printing the secret:

```
docker compose -f infra/docker-compose.yml --env-file infra/.env exec website node -e "fetch('http://127.0.0.1:3000/api/revalidate',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.REVALIDATE_SECRET},body:JSON.stringify({tags:['catalog']})}).then(r=>console.log(r.status))"
```

(k8s: the same `node -e` through `kubectl exec deploy/hig-website --`.)

| variable | where | value |
|---|---|---|
| `REVALIDATE_SECRET` | api, worker **and** website: one value (`infra/.env`, k8s `hig-secrets`, Secrets Manager `hig/<env>/REVALIDATE_SECRET`) | at least 32 random characters; empty = off |
| `WEBSITE_REVALIDATE_URL` | api, worker | the website's internal `/api/revalidate` URL |
| `WEBSITE_SERVER_IPS` | api | website server IPs / CIDRs (generous catalogue rate limit) |
| `CATALOG_RATE_LIMIT_PUBLIC` / `CATALOG_RATE_LIMIT_WEBSITE` | api | requests per minute per IP (300 / 6000) |
| `NEXT_PUBLIC_SITE_URL` | website build + runtime | `https://<production domain>` |
| `SITE_REQUIRE_LIVE_DATA` | website runtime | `true` in production (forced `false` during the image build, which has no API) |
| `CONTENT_INCLUDE_DRAFTS` | website build + runtime | `false` in production |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | website build + runtime | search-console tokens |
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` (+ `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`) | website build args | empty (off), `plausible` or `ga4` |

### Several website instances (shared Next.js cache)

The ISR / data cache lives in `.next/cache` of each Next.js process. Options:

1. **One instance with a persistent cache volume** (current default: compose `website-cache` volume, k8s
   `replicas: 1`). Simplest; the CDN absorbs read traffic and a restart only costs re-renders. Scale up first.
2. **Several instances with a shared cache handler**: a Next.js `cacheHandler` (with `cacheMaxMemorySize: 0`)
   backed by Redis (the existing Redis with its own key prefix / DB index, or a small separate one). Every
   instance then serves the same page version, and one revalidation POST (to any instance) invalidates a tag
   everywhere. This is a change in `website/next.config.ts`, owned by the website (none configured as of
   2026-10-22). All instances must run the same image (same build ID).
3. A shared ReadWriteMany volume for `.next/cache` works but is not recommended (locking, latency).

Without option 2, do not run more than one website replica: pods would disagree, and a revalidation would reach
only the pod that received the POST (the website's revalidation rate limiter is also per process).

## Known gaps and alignment notes (for the integration phase)

- **One domain with path routing (PLAN section 3.1).** The compose edge (`infra/nginx`) implements it.
  `terraform/aws` and `k8s/` still use one host per SPA plus `api.<domain>`. To align them:
  - one CloudFront distribution on `<domain>`: `/api/*` to the ALB; `/app/*`, `/agent/*`, `/hospital/*` and
    `/gahi/*` to the SPA buckets, with a path-prefix rewrite in `functions/spa-rewrite.js`; default `/*` to the
    website
  - k8s Ingress: equivalent path rules
- **Public website (`website/`, Next.js).** k8s runs it (`k8s/base/website-deployment.yaml`; Ingress
  `hig-website` on the main domain, patient portal moved to `/app/`). It is not yet part of the AWS target: add an
  ECS service (image `infra/website/Dockerfile`, no database access, egress to the API only, `REVALIDATE_SECRET`
  from Secrets Manager), make it the CloudFront default behavior (see "CDN and caching"), then set
  `website_revalidate_url` and `website_server_cidrs`.
- **Least-privilege database roles.** Compose splits migrator (schema owner) from the app (DML only). On AWS and
  k8s the app role still owns the database. Mirror `infra/postgres/init/02-roles.sh`: a migrator secret for the
  migrate task, and a DML-only app role through default privileges.
- **Client IP behind CloudFront.** The API trusts proxy headers only from the VPC (ECS) or cluster ranges
  (k8s), never `*`. Behind CloudFront the nearest untrusted hop is a CloudFront edge, so the ECS task sets
  `TRUST_CLOUDFRONT_VIEWER_ADDRESS=true` and the backend reads `CloudFront-Viewer-Address` (forwarded by the
  origin request policy) for rate limiting, audit IPs and `STAFF_ALLOWED_IPS`. Keep it `false` anywhere the API
  can be reached without passing through CloudFront.
