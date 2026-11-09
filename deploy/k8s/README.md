# Heal India Global on Kubernetes (alternative to ECS)

Kustomize base + overlays for running the same images on any conformant cluster (EKS in `ap-south-1`
recommended, so data stays in India). Managed PostgreSQL 17 (RDS), Redis 7 with TLS (ElastiCache) and the S3
documents bucket are expected outside the cluster - the Terraform in `deploy/terraform/aws` can provide them,
or use any equivalent.

```
k8s/
├── base/                              # environment-neutral
│   ├── kustomization.yaml             # labels, hig-config ConfigMap generator, image placeholders
│   ├── config.env                     # non-secret settings (backend/app/core/config.py names)
│   ├── serviceaccounts.yaml           # hig-api, hig-worker, hig-migrate, hig-web (no token automount)
│   ├── api-deployment.yaml            # 3 replicas, probes, non-root, read-only root fs, /tmp emptyDir
│   ├── api-service.yaml · api-hpa.yaml · api-pdb.yaml
│   ├── worker-deployment.yaml · worker-pdb.yaml
│   ├── web-deployment.yaml · web-service.yaml · web-pdb.yaml   # optional: SPAs from web/Dockerfile
│   ├── website-deployment.yaml        # public website (Next.js, 1 replica) + Service, SA, NetworkPolicies,
│   │                                  #   hig-noindex-headers (X-Robots-Tag for the portal Ingresses)
│   ├── website.env                    # hig-website-config (overlays merge NEXT_PUBLIC_SITE_URL, SITE_NOINDEX)
│   ├── migrate-job.yaml               # alembic upgrade head (pre-deploy phase / Argo CD Sync hook)
│   ├── networkpolicies.yaml           # default deny + DNS, ingress-nginx -> api/web, app egress
│   ├── secret.template.yaml           # NOT applied - placeholders for the hig-secrets keys
│   └── external-secret.example.yaml   # NOT applied - External Secrets Operator -> AWS Secrets Manager
├── overlays/
│   ├── staging/      kustomization.yaml · namespace.yaml · config.env · ingress.yaml · certificate.yaml
│   └── production/   kustomization.yaml · namespace.yaml · config.env · ingress.yaml · certificate.yaml
└── ingress-nginx/controller-config.example.yaml   # client-IP, HSTS, JSON logs, security headers
```

## Prerequisites

| Component | Why |
|---|---|
| ingress-nginx (IngressClass `nginx`) | routing, TLS, WebSocket timeouts for `/api/v1/ws`, 20 MB bodies, per-IP limits |
| cert-manager + `ClusterIssuer letsencrypt-prod` | `hig-tls` certificate for the five hostnames |
| metrics-server | HPA on CPU/memory |
| CNI enforcing NetworkPolicy | EKS VPC CNI with network policy enabled, Calico or Cilium |
| External Secrets Operator (recommended) | sync `hig-secrets` from AWS Secrets Manager |
| IRSA or EKS Pod Identity | S3 documents access for `hig-api` / `hig-worker` (no static keys) |
| Prometheus (namespace `monitoring`) | scrapes pods annotated `prometheus.io/scrape: "true"` (see `deploy/observability`) |

> The community **ingress-nginx** project is retired (best-effort maintenance ended in March 2026). The
> manifests use its annotations because they are still the most widely deployed; the routing (per-path
> timeouts, body size, rate limits) maps directly onto Gateway API `HTTPRoute`s or the F5 NGINX Ingress
> Controller when you migrate.

## Configure

1. Replace `healindia.example`, `123456789012` and the VPC CIDRs in `overlays/<env>/` (config.env,
   ingress.yaml, certificate.yaml, kustomization.yaml patches).
2. Create the IAM roles referenced by the ServiceAccount annotations with the same policy as the ECS task
   roles (`deploy/terraform/aws/iam.tf`, `task_app`: documents bucket + documents KMS key via S3), trusted by
   the cluster OIDC provider for `system:serviceaccount:hig-<env>:hig-api` / `hig-worker`.
3. Provide the Secret `hig-secrets` in the namespace (keys in `base/secret.template.yaml`):
   * **External Secrets Operator** - adapt `base/external-secret.example.yaml` (reads `hig/<env>/<KEY>` written
     by Terraform / `deploy/scripts/set-secret.sh`), or
   * manually: `kubectl -n hig-production create secret generic hig-secrets --from-env-file=<file outside git>`.
4. Ingress controller settings: `ingress-nginx/controller-config.example.yaml` (preserve client IPs, keep
   `use-forwarded-headers: "false"`, security headers via `add-headers`).

## Deploy (kubectl)

Migrations must finish before new pods roll out, so a release is applied in two phases. Objects needed by the
migration (namespace, ConfigMap, `hig-migrate` ServiceAccount, the Job) carry `hig.io/phase=pre-deploy`.

```bash
ENV=production NS=hig-production TAG=$(git rev-parse --short=12 HEAD)
REG=123456789012.dkr.ecr.ap-south-1.amazonaws.com

# 0) pin the release (CI does this in a throw-away checkout)
(cd deploy/k8s/overlays/$ENV && \
  kustomize edit set image hig-api=$REG/hig/$ENV/api:$TAG hig-web=$REG/hig/$ENV/web:$TAG)

# 1) migrations
kubectl -n $NS delete job hig-migrate --ignore-not-found
kubectl apply -k deploy/k8s/overlays/$ENV -l hig.io/phase=pre-deploy
kubectl -n $NS wait --for=condition=complete job/hig-migrate --timeout=15m \
  || { kubectl -n $NS logs job/hig-migrate; exit 1; }

# 2) everything else (api, worker, web, services, HPA, PDBs, policies, ingresses, certificate)
kubectl apply -k deploy/k8s/overlays/$ENV
kubectl -n $NS rollout status deploy/hig-api --timeout=10m
kubectl -n $NS rollout status deploy/hig-worker --timeout=10m
```

Rollback: re-pin the previous tag and repeat step 2 (migrations must be backward compatible - expand/contract,
see `docs/DEPLOYMENT.md` section 5).

**Argo CD**: the manifests carry sync waves (namespace -2, ConfigMap -1, migration Job = `Sync` hook in wave 0,
Deployments wave 1), so a single sync runs the migration first. Flux: put the Job in its own `Kustomization`
and make the app `dependsOn` it (with `force: true` to recreate the immutable Job).

## Behaviour notes

* **Health**: startup/liveness `GET /health/live`, readiness `GET /health/ready` (database + Redis). The app's
  `TRUSTED_HOSTS` stays `*` because kubelet probes use the pod IP as Host header.
* **Graceful shutdown**: `preStop: sleep 5` lets ingress-nginx drop the endpoint, gunicorn drains for 30 s
  (grace period 45 s); workers get 120 s to finish jobs.
* **Metrics**: `WEB_CONCURRENCY=1` - each pod runs a single gunicorn worker so `/metrics` (in-process
  registry) is consistent; scale with replicas. Raise it only after the app adopts Prometheus multiprocess
  mode. `/metrics` is never routed by the ingresses (only `/api` and `/health`).
* **Replicas vs HPA**: `replicas: 3` is the initial size and the HPA minimum; if your tooling resets replicas on
  every apply, delete the field from the Deployment and let the HPA own it.
* **Pod Security**: namespaces enforce the `restricted` profile; all pods run non-root with
  `readOnlyRootFilesystem`, all capabilities dropped and `RuntimeDefault` seccomp.
* **Network policy**: default deny; DNS to kube-dns; ingress-nginx -> api:8000 and web:8081-8084; Prometheus
  (`monitoring`) -> api:8000; api/worker/migrate -> PostgreSQL 5432 + Redis 6379 (VPC CIDR) and HTTPS/SMTP to
  the internet (instance metadata blocked).
* **Public website** (`hig-website`): the main domain's `/` (Ingress `hig-website`); the patient portal is at
  `/app/` (`hig-web-patient`, prefix stripped). Agent, hospital and admin portals and `/app/` send
  `X-Robots-Tag: noindex, nofollow` through the `custom-headers` annotation (ingress-nginx >= 1.11 with
  `global-allowed-response-headers: "X-Robots-Tag"`, see `ingress-nginx/controller-config.example.yaml`). The
  worker POSTs catalogue changes to `http://hig-website:3000/api/revalidate` with `REVALIDATE_SECRET` from
  `hig-secrets` (also mounted into the website). Keep `replicas: 1` until the website has a shared Next.js cache
  handler (deploy/README.md "CDN and caching"). Staging sets `SITE_NOINDEX=true`.
