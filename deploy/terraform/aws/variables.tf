# =====================================================================================================
# General
# =====================================================================================================
variable "project" {
  description = "Short project slug used in resource names (keep it short: names are length-limited)."
  type        = string
  default     = "hig"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,9}$", var.project))
    error_message = "project must be 2-10 lowercase alphanumeric characters starting with a letter."
  }
}

variable "environment" {
  description = "Environment name (e.g. staging, production). Selects hostnames and the application ENV."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 characters: lowercase letters, digits and dashes."
  }
}

variable "aws_region" {
  description = "Primary region. ap-south-1 (Mumbai) keeps patient data in India."
  type        = string
  default     = "ap-south-1"
}

variable "tags" {
  description = "Extra tags applied to every resource (e.g. Owner, CostCenter)."
  type        = map(string)
  default     = {}
}

# =====================================================================================================
# Network
# =====================================================================================================
variable "vpc_cidr" {
  description = "VPC CIDR. Must be a /16: public /24s, private /20s and isolated /24s are carved from it."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && try(tonumber(split("/", var.vpc_cidr)[1]) == 16, false)
    error_message = "vpc_cidr must be a valid IPv4 /16 CIDR block."
  }
}

variable "az_count" {
  description = "Number of availability zones (ap-south-1 has 3)."
  type        = number
  default     = 3

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "nat_gateway_mode" {
  description = "per_az: one NAT gateway per AZ (HA, production). single: one shared NAT gateway (cheaper, staging)."
  type        = string
  default     = "per_az"

  validation {
    condition     = contains(["per_az", "single"], var.nat_gateway_mode)
    error_message = "nat_gateway_mode must be per_az or single."
  }
}

variable "enable_vpc_flow_logs" {
  description = "Send VPC flow logs (ALL traffic) to CloudWatch Logs."
  type        = bool
  default     = true
}

variable "flow_logs_retention_days" {
  description = "Retention of the VPC flow log group."
  type        = number
  default     = 30
}

variable "enable_interface_endpoints" {
  description = "Create interface VPC endpoints (ECR, CloudWatch Logs, Secrets Manager, KMS, STS) so task start-up traffic avoids the NAT gateways. Costs roughly USD 7-8 per endpoint per AZ per month."
  type        = bool
  default     = false
}

# =====================================================================================================
# DNS / TLS
# =====================================================================================================
variable "domain_name" {
  description = "Base domain, e.g. healindia.example. Production uses it directly (patient site at the apex); other environments use <environment>.<domain_name>."
  type        = string
}

variable "hostnames" {
  description = "Optional explicit hostnames. Defaults: production -> <domain>, agent.<domain>, hospital.<domain>, admin.<domain>, api.<domain>, origin-api.<domain>; other environments insert the environment name (staging.<domain>, agent.staging.<domain>, ...). api_origin is the ALB name used only by CloudFront."
  type = object({
    patient    = optional(string)
    agent      = optional(string)
    hospital   = optional(string)
    admin      = optional(string)
    api        = optional(string)
    api_origin = optional(string)
  })
  default = {}
}

variable "route53_zone_id" {
  description = "Public Route 53 hosted zone for domain_name. When set, ACM DNS validation and alias records are managed here; when empty you must supply validated certificate ARNs and create the DNS records yourself (see the dns_records_to_create output)."
  type        = string
  default     = ""
}

variable "cloudfront_certificate_arn" {
  description = "Existing ISSUED ACM certificate in us-east-1 covering the four SPA hostnames and the api hostname. Empty = create one (DNS validated)."
  type        = string
  default     = ""
}

variable "alb_certificate_arn" {
  description = "Existing ISSUED ACM certificate in the primary region covering the api_origin hostname. Empty = create one (DNS validated)."
  type        = string
  default     = ""
}

# =====================================================================================================
# Edge: CloudFront + WAF
# =====================================================================================================
variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_All serves patients from every edge (Africa, Middle East, Oceania, South America)."
  type        = string
  default     = "PriceClass_All"

  validation {
    condition     = contains(["PriceClass_All", "PriceClass_200", "PriceClass_100"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_All, PriceClass_200 or PriceClass_100."
  }
}

variable "admin_allowed_cidrs" {
  description = "Optional IPv4 CIDRs (office/VPN) allowed to reach the admin portal hostname. Empty = no IP restriction (staff still need MFA)."
  type        = list(string)
  default     = []
}

variable "waf_auth_rate_limit" {
  description = "Max requests per client IP per 5 minutes to /api/v1/auth/* before WAF blocks (HTTP 429). The API applies its own per-route limits too (login 10/min/IP)."
  type        = number
  default     = 300

  validation {
    condition     = var.waf_auth_rate_limit >= 10
    error_message = "AWS WAF rate limits must be at least 10."
  }
}

variable "waf_global_rate_limit" {
  description = "Max requests per client IP per 5 minutes across the whole site (payment webhooks excluded). 0 disables the rule."
  type        = number
  default     = 6000
}

variable "waf_enable_anonymous_ip_list" {
  description = "Also block VPNs/Tor/hosting-provider IPs (AWSManagedRulesAnonymousIpList). Off by default: international patients often use VPNs."
  type        = bool
  default     = false
}

variable "waf_logging_enabled" {
  description = "Log BLOCK/COUNT decisions of the CloudFront WAF to CloudWatch Logs (us-east-1; auth headers, cookies and query strings are redacted)."
  type        = bool
  default     = true
}

# =====================================================================================================
# Containers (ECS Fargate)
# =====================================================================================================
variable "image_tag" {
  description = "Tag of the backend image in ECR (immutable tags: use the git SHA). Used by the api, worker and migrate task definitions."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "image_tag must be a valid Docker tag."
  }
}

variable "ecr_repositories" {
  description = "ECR repositories to create (<project>/<environment>/<name>). 'api' is required; 'web' is only used by the Kubernetes/compose variants."
  type        = list(string)
  default     = ["api", "web"]

  validation {
    condition     = contains(var.ecr_repositories, "api")
    error_message = "ecr_repositories must contain \"api\"."
  }
}

variable "ecr_keep_images" {
  description = "Number of images kept per ECR repository (older ones expire)."
  type        = number
  default     = 50
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture. ARM64 (Graviton) is ~20% cheaper but the image must be built for linux/arm64."
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}

variable "start_services" {
  description = "Run the api/worker services. Set false for the very first apply (before the database role exists and migrations have run), then true."
  type        = bool
  default     = true
}

variable "api_cpu" {
  description = "API task CPU units (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "API task memory (MiB)."
  type        = number
  default     = 1024
}

variable "api_min_count" {
  description = "Minimum API tasks (spread over AZs)."
  type        = number
  default     = 2
}

variable "api_max_count" {
  description = "Maximum API tasks for autoscaling."
  type        = number
  default     = 10
}

variable "api_cpu_target_percent" {
  description = "Target average CPU utilisation for API autoscaling."
  type        = number
  default     = 60
}

variable "api_memory_target_percent" {
  description = "Target average memory utilisation for API autoscaling."
  type        = number
  default     = 75
}

variable "api_requests_per_target" {
  description = "Target ALB requests per task per minute for API autoscaling."
  type        = number
  default     = 1500
}

variable "web_concurrency" {
  description = "Gunicorn worker processes per API task. Keep 1 until the app exposes Prometheus metrics in multiprocess mode (otherwise each scrape sees one random worker); scale out with more tasks instead."
  type        = number
  default     = 1
}

variable "worker_cpu" {
  description = "Worker task CPU units."
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Worker task memory (MiB)."
  type        = number
  default     = 1024
}

variable "worker_min_count" {
  description = "Minimum worker tasks (jobs are claimed with FOR UPDATE SKIP LOCKED, so several workers are safe)."
  type        = number
  default     = 1
}

variable "worker_max_count" {
  description = "Maximum worker tasks for autoscaling."
  type        = number
  default     = 4
}

variable "worker_concurrency" {
  description = "Parallel job consumers per worker task (python -m app.worker --concurrency N)."
  type        = number
  default     = 4
}

variable "worker_use_fargate_spot" {
  description = "Run worker tasks beyond the first on FARGATE_SPOT. Interrupted jobs are re-queued after the stale-lock timeout."
  type        = bool
  default     = false
}

variable "migrate_cpu" {
  description = "Migration / db-bootstrap task CPU units."
  type        = number
  default     = 512
}

variable "migrate_memory" {
  description = "Migration / db-bootstrap task memory (MiB)."
  type        = number
  default     = 1024
}

variable "postgres_client_image" {
  description = "Image providing psql for the one-off db-bootstrap task."
  type        = string
  default     = "public.ecr.aws/docker/library/postgres:17-alpine"
}

variable "enable_ecs_exec" {
  description = "Allow `aws ecs execute-command` into tasks (break-glass). Requires a writable root filesystem, so it disables readonlyRootFilesystem."
  type        = bool
  default     = false
}

variable "enable_container_insights" {
  description = "Enable ECS Container Insights (task-level CPU/memory/running-task metrics)."
  type        = bool
  default     = true
}

variable "wait_for_steady_state" {
  description = "Make terraform apply wait until ECS services reach a steady state."
  type        = bool
  default     = false
}

variable "alb_idle_timeout" {
  description = "ALB idle timeout (seconds). WebSockets stay open because uvicorn pings every 20 s; gunicorn keep-alive is set 10 s above this value."
  type        = number
  default     = 120
}

variable "alb_deletion_protection" {
  description = "Protect the ALB from accidental deletion."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Retention of application (ECS) log groups."
  type        = number
  default     = 90
}

variable "metrics_scrape_cidrs" {
  description = "CIDRs (inside the VPC or peered) allowed to scrape API tasks on :8000/metrics (Prometheus / ADOT collector)."
  type        = list(string)
  default     = []
}

# =====================================================================================================
# Application settings (non-secret; secrets live in Secrets Manager, see secrets.tf)
# =====================================================================================================
variable "payment_gateways" {
  description = "PAYMENT_GATEWAYS_ENABLED. Secrets are created for razorpay/stripe when listed. 'mock' is refused when the environment is production."
  type        = list(string)
  default     = ["razorpay", "bank_transfer"]

  validation {
    condition     = alltrue([for g in var.payment_gateways : contains(["razorpay", "stripe", "bank_transfer", "mock"], g)])
    error_message = "payment_gateways may only contain razorpay, stripe, bank_transfer and mock."
  }
}

variable "ai_enabled" {
  description = "Enable Claude-based AI screening (creates the ANTHROPIC_API_KEY secret). When false the deterministic rules engine is used."
  type        = bool
  default     = true
}

variable "ai_model" {
  description = "AI_MODEL for screening."
  type        = string
  default     = "claude-opus-5-5"
}

variable "ai_effort" {
  description = "AI_EFFORT for screening."
  type        = string
  default     = "medium"
}

variable "email_backend" {
  description = "EMAIL_BACKEND: smtp (creates SMTP_USER/SMTP_PASSWORD secrets) or console."
  type        = string
  default     = "smtp"

  validation {
    condition     = contains(["smtp", "console"], var.email_backend)
    error_message = "email_backend must be smtp or console."
  }
}

variable "smtp_host" {
  description = "SMTP_HOST (e.g. email-smtp.ap-south-1.amazonaws.com for Amazon SES)."
  type        = string
  default     = "email-smtp.ap-south-1.amazonaws.com"
}

variable "smtp_port" {
  description = "SMTP_PORT."
  type        = number
  default     = 587
}

variable "smtp_starttls" {
  description = "SMTP_STARTTLS."
  type        = bool
  default     = true
}

variable "email_from" {
  description = "EMAIL_FROM (verified sender identity)."
  type        = string
  default     = "Heal India Global <no-reply@healindia.example>"
}

variable "google_client_ids" {
  description = "GOOGLE_CLIENT_IDS accepted for Google sign-in (web, Android, iOS client ids; public values)."
  type        = list(string)
  default     = []
}

variable "apple_client_ids" {
  description = "APPLE_CLIENT_IDS accepted for Sign in with Apple (iOS bundle id, web Services ID; public values). Non-empty also creates the APPLE_PRIVATE_KEY secret."
  type        = list(string)
  default     = []
}

variable "apple_team_id" {
  description = "APPLE_TEAM_ID (Apple developer team id; public identifier)."
  type        = string
  default     = ""
}

variable "apple_key_id" {
  description = "APPLE_KEY_ID (Sign in with Apple key id; public identifier - the key itself is the APPLE_PRIVATE_KEY secret)."
  type        = string
  default     = ""
}

variable "staff_allowed_cidrs" {
  description = "STAFF_ALLOWED_IPS: CIDRs allowed to use the staff door (/auth/staff/*) and staff APIs (office / VPN egress). Empty = any address (MFA still required)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.staff_allowed_cidrs : can(cidrhost(c, 0))])
    error_message = "staff_allowed_cidrs must contain CIDR blocks such as 203.0.113.0/24."
  }
}

variable "admin_mfa_required" {
  description = "ADMIN_MFA_REQUIRED."
  type        = bool
  default     = true
}

variable "require_email_verification" {
  description = "REQUIRE_EMAIL_VERIFICATION."
  type        = bool
  default     = true
}

variable "max_upload_mb" {
  description = "MAX_UPLOAD_MB (keep below 20: CloudFront/WAF and the ingress allow 20 MB bodies)."
  type        = number
  default     = 15
}

variable "log_level" {
  description = "LOG_LEVEL."
  type        = string
  default     = "INFO"
}

variable "sentry_dsn" {
  description = "Optional SENTRY_DSN (PII scrubbing stays on in the app)."
  type        = string
  default     = ""
}

variable "db_pool_size" {
  description = "DB_POOL_SIZE per gunicorn worker. Budget: (pool + overflow) x WEB_CONCURRENCY x (api_max_count + worker_max_count) must stay well below max_connections."
  type        = number
  default     = 5
}

variable "db_max_overflow" {
  description = "DB_MAX_OVERFLOW per gunicorn worker."
  type        = number
  default     = 10
}

variable "extra_environment" {
  description = "Additional/overriding plain environment variables for api, worker and migrate containers (never put secrets here)."
  type        = map(string)
  default     = {}
}

# =====================================================================================================
# Data: RDS PostgreSQL 17 and ElastiCache Redis 7
# =====================================================================================================
variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "healindia"
}

variable "db_app_username" {
  description = "Application role (owner of the database, not a superuser). Created by the db-bootstrap task."
  type        = string
  default     = "healindia"
}

variable "db_master_username" {
  description = "RDS master user (password generated and rotated by RDS in Secrets Manager; break-glass and bootstrap only)."
  type        = string
  default     = "hig_master"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version. A major version (\"17\") lets RDS pick the latest minor and auto-upgrade minors."
  type        = string
  default     = "17"
}

variable "rds_instance_class" {
  description = "RDS instance class (db.t4g.medium for launch; db.m7g.large+ once traffic grows)."
  type        = string
  default     = "db.t4g.medium"
}

variable "rds_allocated_storage" {
  description = "Initial gp3 storage (GiB)."
  type        = number
  default     = 50
}

variable "rds_max_allocated_storage" {
  description = "Storage autoscaling ceiling (GiB)."
  type        = number
  default     = 500
}

variable "rds_multi_az" {
  description = "Multi-AZ standby (automatic failover)."
  type        = bool
  default     = true
}

variable "rds_backup_retention_days" {
  description = "Automated backup / point-in-time-recovery window (days)."
  type        = number
  default     = 14
}

variable "rds_deletion_protection" {
  description = "RDS deletion protection."
  type        = bool
  default     = true
}

variable "rds_apply_immediately" {
  description = "Apply RDS modifications immediately instead of in the maintenance window."
  type        = bool
  default     = false
}

variable "rds_snapshot_identifier" {
  description = "Restore the database from this snapshot (DR / environment cloning). Leave null for a new database."
  type        = string
  default     = null
}

variable "redis_engine_version" {
  description = "ElastiCache Redis OSS engine version."
  type        = string
  default     = "7.1"
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t4g.small"
}

variable "redis_num_cache_clusters" {
  description = "Redis nodes (1 = no replica; 2+ = primary + replicas with automatic failover across AZs)."
  type        = number
  default     = 2
}

variable "redis_snapshot_retention_days" {
  description = "Redis daily snapshot retention (cache data only; 0 disables)."
  type        = number
  default     = 3
}

# =====================================================================================================
# Object storage
# =====================================================================================================
variable "documents_ia_transition_days" {
  description = "Move current document versions to STANDARD_IA after N days (0 disables)."
  type        = number
  default     = 90
}

variable "documents_glacier_ir_transition_days" {
  description = "Move current document versions to GLACIER_IR (millisecond access) after N days (0 disables)."
  type        = number
  default     = 365
}

variable "documents_noncurrent_expiration_days" {
  description = "Permanently delete overwritten/deleted document versions after N days (recovery window for accidental deletes)."
  type        = number
  default     = 90
}

variable "access_logs_retention_days" {
  description = "Retention of ALB and S3 access logs in the logs bucket."
  type        = number
  default     = 90
}

variable "secrets_recovery_window_days" {
  description = "Secrets Manager recovery window when a secret is deleted (0 = immediate, only for throw-away environments)."
  type        = number
  default     = 30
}

# =====================================================================================================
# Backup / disaster recovery
# =====================================================================================================
variable "enable_dr" {
  description = "Cross-region protection into dr_region: AWS Backup copies of RDS snapshots, S3 documents replication, Secrets Manager replicas and ECR replication."
  type        = bool
  default     = false
}

variable "dr_region" {
  description = "DR region. ap-south-2 (Hyderabad) keeps copies in India; it is an opt-in region."
  type        = string
  default     = "ap-south-2"
}

variable "backup_daily_retention_days" {
  description = "AWS Backup daily RDS snapshot retention (in addition to the RDS PITR window)."
  type        = number
  default     = 35
}

variable "backup_monthly_retention_days" {
  description = "AWS Backup monthly RDS snapshot retention."
  type        = number
  default     = 365
}

variable "dr_backup_retention_days" {
  description = "Retention of the cross-region copies in the DR vault."
  type        = number
  default     = 35
}

# =====================================================================================================
# Alerting
# =====================================================================================================
variable "alarm_emails" {
  description = "E-mail addresses subscribed to the alerts SNS topic (each must confirm the subscription)."
  type        = list(string)
  default     = []
}

variable "alarm_5xx_ratio_percent" {
  description = "Alarm when 5xx responses exceed this percentage of ALB requests (3 of 5 minutes)."
  type        = number
  default     = 2
}

variable "alarm_min_requests_per_minute" {
  description = "Ignore the 5xx ratio when traffic is below this many requests per minute (avoids noise at night)."
  type        = number
  default     = 20
}

variable "alarm_p95_latency_seconds" {
  description = "Alarm when ALB TargetResponseTime p95 exceeds this many seconds (3 of 5 minutes)."
  type        = number
  default     = 2
}

variable "alarm_ecs_cpu_percent" {
  description = "Alarm threshold for average service CPU utilisation."
  type        = number
  default     = 85
}

variable "alarm_ecs_memory_percent" {
  description = "Alarm threshold for average service memory utilisation."
  type        = number
  default     = 85
}

variable "alarm_rds_cpu_percent" {
  description = "Alarm threshold for RDS CPU utilisation."
  type        = number
  default     = 80
}

variable "alarm_rds_free_storage_gb" {
  description = "Alarm when RDS free storage drops below this many GiB."
  type        = number
  default     = 10
}

variable "alarm_rds_connections" {
  description = "Alarm when RDS DatabaseConnections exceeds this value (db.t4g.medium allows roughly 400)."
  type        = number
  default     = 300
}

variable "alarm_rds_freeable_memory_mb" {
  description = "Alarm when RDS freeable memory drops below this many MiB."
  type        = number
  default     = 256
}

variable "alarm_redis_memory_percent" {
  description = "Alarm threshold for Redis DatabaseMemoryUsagePercentage."
  type        = number
  default     = 80
}

variable "alarm_error_logs_per_5min" {
  description = "Alarm when api or worker emit more than this many error/critical log lines in 5 minutes."
  type        = number
  default     = 25
}

# =====================================================================================================
# Public website integration (on-demand ISR revalidation, public catalogue rate limits)
# =====================================================================================================
variable "website_revalidate_url" {
  description = "URL the worker POSTs changed catalogue tags to (the website's /api/revalidate, reached privately, e.g. via Cloud Map: http://website.<namespace>:3000/api/revalidate). Empty = revalidation off; the website is not part of this stack yet."
  type        = string
  default     = ""
}

variable "website_server_cidrs" {
  description = "CIDRs of the website's server tasks as the API sees them; they get catalog_rate_limit_website instead of the public budget."
  type        = list(string)
  default     = []
}

variable "catalog_rate_limit_public" {
  description = "Public catalogue requests per minute per client IP."
  type        = number
  default     = 300
}

variable "catalog_rate_limit_website" {
  description = "Public catalogue requests per minute for each website server IP (SSR / ISR fetches)."
  type        = number
  default     = 6000
}
