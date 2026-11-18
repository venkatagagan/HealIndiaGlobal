# =====================================================================================================
# General
# =====================================================================================================
variable "project" {
  description = "Short project slug used in resource names."
  type        = string
  default     = "hig"

  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,9}$", var.project))
    error_message = "project must be 2-10 lowercase alphanumeric characters starting with a letter."
  }
}

variable "environment" {
  description = "Environment name. \"production\" runs the app with ENV=production (strict settings checks)."
  type        = string
  default     = "production"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,15}$", var.environment))
    error_message = "environment must be 2-16 characters: lowercase letters, digits and dashes."
  }
}

variable "aws_region" {
  description = "Primary region (all personal data). US East (Ohio)."
  type        = string
  default     = "us-east-2"
}

variable "dr_region" {
  description = "Region that receives the cross-region backup copies. US West (Oregon)."
  type        = string
  default     = "us-west-2"
}

variable "tags" {
  description = "Extra tags for every resource (e.g. Owner, CostCenter)."
  type        = map(string)
  default     = {}
}

# =====================================================================================================
# Domain and DNS
# =====================================================================================================
variable "domain_name" {
  description = "Public domain. The website, the portals (/app/, /agent/, /hospital/) and the API (/api/) are served on it; the staff console on <staff_console_subdomain>.<domain_name>."
  type        = string
  default     = "healindiaglobal.ai"
}

variable "manage_dns" {
  description = "Create the DNS records (apex, staff console, SES DKIM/MAIL FROM/DMARC) in Route 53. false = DNS is hosted elsewhere: create the records from the dns_records_to_create output yourself."
  type        = bool
  default     = true
}

variable "create_hosted_zone" {
  description = "Create a new public hosted zone for domain_name (then point the registrar at the name_servers output). false = use the existing zone (looked up by name, or route53_zone_id)."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Optional id of the existing public hosted zone. Empty = look the zone up by domain_name."
  type        = string
  default     = ""
}

variable "staff_console_subdomain" {
  description = "Host label of the staff console (SEC-022: its own origin, STAFF_CONSOLE_ORIGIN=https://<label>.<domain>). The main domain then redirects /gahi/ there."
  type        = string
  default     = "ops"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$", var.staff_console_subdomain))
    error_message = "staff_console_subdomain must be a single DNS label such as ops."
  }
}

variable "allowed_staff_cidrs" {
  description = "Optional office / VPN egress CIDRs for the staff console. Empty = no IP restriction (staff still need MFA, and the console has its own origin). When set: STAFF_ALLOWED_IPS in the API and an nginx allow-list on the console host."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.allowed_staff_cidrs : can(cidrhost(c, 0))])
    error_message = "allowed_staff_cidrs must contain CIDR blocks such as 203.0.113.0/24."
  }
}

# =====================================================================================================
# Alerts and cost
# =====================================================================================================
variable "alert_email" {
  description = "Receives CloudWatch alarms (SNS - confirm the subscription e-mail AWS sends, twice: us-east-2 and us-east-1), AWS Budgets alerts and the Let's Encrypt expiry notices."
  type        = string
  default     = "contact@healindiaglobal.ai"

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$", var.alert_email))
    error_message = "alert_email must be an e-mail address."
  }
}

variable "monthly_budget_usd" {
  description = "AWS Budgets monthly cost budget. Alerts at 80% forecast, 80% actual and 100% actual."
  type        = number
  default     = 150
}

variable "log_retention_days" {
  description = "Retention of the CloudWatch log groups (containers, system, RDS)."
  type        = number
  default     = 30
}

variable "ship_container_logs" {
  description = "Ship the Docker container logs to CloudWatch Logs (about USD 0.50 per GB ingested). false = logs stay on the box only (json-file, rotated)."
  type        = bool
  default     = true
}

# =====================================================================================================
# Network and the EC2 box
# =====================================================================================================
variable "vpc_cidr" {
  description = "VPC CIDR (a /16): two public /24 subnets for the box and two private /24 subnets for RDS."
  type        = string
  default     = "10.60.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && try(tonumber(split("/", var.vpc_cidr)[1]) == 16, false)
    error_message = "vpc_cidr must be a valid IPv4 /16 CIDR block."
  }
}

variable "instance_type" {
  description = "EC2 instance type (Graviton / ARM64: the images are built for linux/arm64)."
  type        = string
  default     = "t4g.large"
}

variable "root_volume_gb" {
  description = "Encrypted gp3 root volume (GiB): Docker images, Redis data, Whisper model, logs, swap."
  type        = number
  default     = 60
}

variable "swap_gb" {
  description = "Swap file size (GiB). Headroom for local Whisper speech-to-text bursts."
  type        = number
  default     = 4
}

variable "instance_termination_protection" {
  description = "Protect the instance from API termination (terraform destroy needs this set false first)."
  type        = bool
  default     = true
}

variable "compose_version" {
  description = "Docker Compose plugin release installed on the box (linux-aarch64 binary from github.com/docker/compose)."
  type        = string
  default     = "v5.6.1"
}

variable "compose_sha256" {
  description = "SHA-256 of docker-compose-linux-aarch64 for compose_version (from the release's .sha256 file). The bootstrap refuses a binary that does not match."
  type        = string
  default     = "42cfa75f51ad0ccf290bad37899e0038a8c10a0069e85233ecc1d53e3ff1347d"

  validation {
    condition     = can(regex("^[0-9a-f]{64}$", var.compose_sha256))
    error_message = "compose_sha256 must be a lowercase hex SHA-256."
  }
}

# =====================================================================================================
# Database: RDS PostgreSQL 17
# =====================================================================================================
variable "rds_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.small"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version (major version: RDS picks the latest minor and auto-upgrades minors)."
  type        = string
  default     = "17"
}

variable "rds_allocated_storage" {
  description = "Initial gp3 storage (GiB)."
  type        = number
  default     = 50
}

variable "rds_max_allocated_storage" {
  description = "Storage autoscaling ceiling (GiB)."
  type        = number
  default     = 200
}

variable "rds_backup_retention_days" {
  description = "Automated backups / point-in-time-recovery window (days)."
  type        = number
  default     = 7
}

variable "rds_deletion_protection" {
  description = "RDS deletion protection."
  type        = bool
  default     = true
}

variable "rds_snapshot_identifier" {
  description = "Restore the database from this snapshot (restore drill / DR). null = new, empty database."
  type        = string
  default     = null
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "healindia"
}

variable "db_master_username" {
  description = "RDS master user (password managed and rotated by RDS in Secrets Manager; bootstrap and break-glass only)."
  type        = string
  default     = "hig_master"
}

variable "db_migrator_username" {
  description = "Schema-owner role used only by the migrations (created by deploy/starter/db-bootstrap.sh)."
  type        = string
  default     = "healindia_migrator"
}

variable "db_app_username" {
  description = "DML-only application role used by api and worker (created by deploy/starter/db-bootstrap.sh)."
  type        = string
  default     = "healindia_app"
}

variable "bootstrap_mode" {
  description = "First-deploy permissions for the box: read the RDS master secret (to create the migrator/app roles) and write the generated-secrets secret (to create JWT/encryption/DB/Redis secrets once). Set false and re-apply after the first successful deploy."
  type        = bool
  default     = true
}

# =====================================================================================================
# Storage and backups
# =====================================================================================================
variable "documents_noncurrent_expiration_days" {
  description = "Overwritten / deleted document versions are kept this many days, then purged."
  type        = number
  default     = 30
}

variable "backup_daily_retention_days" {
  description = "Daily AWS Backup recovery points of the EC2 box (and documents bucket), in both regions."
  type        = number
  default     = 7
}

variable "backup_weekly_retention_days" {
  description = "Weekly AWS Backup recovery points (EC2 box, RDS snapshot, documents bucket), in both regions."
  type        = number
  default     = 28
}

variable "backup_documents_bucket" {
  description = "Include the S3 documents bucket in AWS Backup (with the cross-region copy). Without it the documents exist in one region only."
  type        = bool
  default     = true
}

variable "secrets_recovery_window_days" {
  description = "Secrets Manager recovery window when a secret is deleted."
  type        = number
  default     = 30
}

# =====================================================================================================
# Email (SES) and SMS (SNS)
# =====================================================================================================
variable "email_from" {
  description = "EMAIL_FROM. The address must be on domain_name (the SES identity)."
  type        = string
  default     = "Heal India Global <no-reply@healindiaglobal.ai>"
}

variable "mail_from_subdomain" {
  description = "Custom MAIL FROM subdomain for SES (SPF alignment): <label>.<domain_name>."
  type        = string
  default     = "mail"
}

variable "create_dmarc_record" {
  description = "Create _dmarc.<domain> (TXT). Set false when the domain already publishes a DMARC record (e.g. set up with the mailbox provider)."
  type        = bool
  default     = true
}

variable "dmarc_policy" {
  description = "DMARC policy (p=): none, quarantine or reject. Aggregate reports go to alert_email."
  type        = string
  default     = "quarantine"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be none, quarantine or reject."
  }
}

variable "enable_sms" {
  description = "SMS_PROVIDER=sns for guest phone-verification codes (instance role may sns:Publish to phone numbers). false = SMS_PROVIDER=none (guests verify by e-mail)."
  type        = bool
  default     = true
}

variable "sms_monthly_spend_limit_usd" {
  description = "Account-wide SNS SMS monthly spend limit (USD). New accounts are capped at 1; raise the quota with an AWS support case first, then this value."
  type        = number
  default     = 1
}

variable "sms_origination_number" {
  description = "SNS_SMS_ORIGINATION_NUMBER: E.164 toll-free or 10DLC number registered in AWS End User Messaging (required for US destinations). Empty = SNS chooses."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^(\\+[1-9][0-9]{6,14})?$", var.sms_origination_number))
    error_message = "sms_origination_number must be empty or an E.164 number such as +18885550100."
  }
}

variable "sms_sender_id" {
  description = "SNS_SMS_SENDER_ID (alphanumeric, max 11). Only countries that support sender IDs show it; some require registration."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^([A-Za-z0-9]{1,11})?$", var.sms_sender_id))
    error_message = "sms_sender_id must be up to 11 letters/digits."
  }
}

variable "sms_allowed_country_codes" {
  description = "SMS_ALLOWED_COUNTRY_CODES: country calling codes (no +) that may receive codes, e.g. [\"1\", \"44\", \"234\"]. Empty = all (higher SMS pumping risk)."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.sms_allowed_country_codes : can(regex("^[1-9][0-9]{0,3}$", c))])
    error_message = "sms_allowed_country_codes must contain calling codes such as 1, 44 or 234 (no +)."
  }
}

# =====================================================================================================
# Application (non-secret settings; secrets live in Secrets Manager - see secrets.tf)
# =====================================================================================================
variable "payment_gateways" {
  description = "PAYMENT_GATEWAYS_ENABLED. Never \"mock\" in production."
  type        = list(string)
  default     = ["razorpay", "bank_transfer"]

  validation {
    condition     = alltrue([for g in var.payment_gateways : contains(["razorpay", "stripe", "bank_transfer", "mock"], g)])
    error_message = "payment_gateways may only contain razorpay, stripe, bank_transfer and mock."
  }
}

variable "ai_enabled" {
  description = "AI_ENABLED (Claude screening, document AI). Needs ANTHROPIC_API_KEY in the third-party secret."
  type        = bool
  default     = true
}

variable "ai_model" {
  description = "AI_MODEL."
  type        = string
  default     = "claude-opus-5-5"
}

variable "ai_effort" {
  description = "AI_EFFORT."
  type        = string
  default     = "medium"
}

variable "whisper_model" {
  description = "WHISPER_MODEL for local speech-to-text in the worker (small ~0.5 GB RAM int8; medium ~1.5 GB, slower on 2 vCPU)."
  type        = string
  default     = "small"
}

variable "web_concurrency" {
  description = "Gunicorn worker processes in the api container."
  type        = number
  default     = 3
}

variable "worker_concurrency" {
  description = "Parallel job consumers in the worker container (python -m app.worker --concurrency N)."
  type        = number
  default     = 2
}

variable "db_pool_size" {
  description = "DB_POOL_SIZE per process. db.t4g.small allows ~200 connections: (pool + overflow) x (web_concurrency + 1 worker) must stay well below."
  type        = number
  default     = 5
}

variable "db_max_overflow" {
  description = "DB_MAX_OVERFLOW per process."
  type        = number
  default     = 10
}

variable "google_client_ids" {
  description = "GOOGLE_CLIENT_IDS (public OAuth client ids: web, Android, iOS). The first one is also baked into the web/website builds."
  type        = list(string)
  default     = []
}

variable "apple_client_ids" {
  description = "APPLE_CLIENT_IDS (Sign in with Apple audiences; public)."
  type        = list(string)
  default     = []
}

variable "apple_team_id" {
  description = "APPLE_TEAM_ID (public identifier; the key itself goes into the third-party secret as APPLE_PRIVATE_KEY)."
  type        = string
  default     = ""
}

variable "apple_key_id" {
  description = "APPLE_KEY_ID (public identifier)."
  type        = string
  default     = ""
}

variable "fcm_project_id" {
  description = "FCM_PROJECT_ID for push notifications (the service account JSON goes into the third-party secret as FCM_SERVICE_ACCOUNT_JSON). Empty = push off."
  type        = string
  default     = ""
}

variable "extra_app_environment" {
  description = "Extra / overriding NON-secret environment variables for api, worker and migrate (e.g. GRIEVANCE_OFFICER_EMAIL, DPO_EMAIL, LOG_LEVEL). Never put secrets here: this ends up in SSM Parameter Store as plain text."
  type        = map(string)
  default     = {}
}

# =====================================================================================================
# CI/CD: GitHub Actions -> ECR -> SSM Run Command
# =====================================================================================================
variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy (OIDC)."
  type        = string
  default     = "venkatagagan/HealIndiaGlobal"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must look like owner/name."
  }
}

variable "github_deploy_branch" {
  description = "Only workflow runs on this branch may assume the deploy role."
  type        = string
  default     = "main"
}

variable "create_github_oidc_provider" {
  description = "Create the token.actions.githubusercontent.com OIDC provider (only one per account: false if it already exists)."
  type        = bool
  default     = true
}

variable "ecr_keep_images" {
  description = "Images kept per ECR repository."
  type        = number
  default     = 20
}
