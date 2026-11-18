# Application secrets: two JSON secrets (USD 0.40/month each) instead of one secret per value.
#
#   <project>/<environment>/generated    JWT_SECRET, FIELD_ENCRYPTION_KEY, REDIS_PASSWORD, REVALIDATE_SECRET,
#                                        APP_DB_PASSWORD, MIGRATOR_DB_PASSWORD. Created ON THE BOX by
#                                        deploy/starter/init-secrets.sh at the first deploy (never in Terraform
#                                        state or git). FIELD_ENCRYPTION_KEY must never be lost or replaced.
#   <project>/<environment>/third-party  RAZORPAY_*, STRIPE_*, ANTHROPIC_API_KEY, APPLE_PRIVATE_KEY,
#                                        FCM_SERVICE_ACCOUNT_JSON, SENTRY_DSN, ... Set by the owner with
#                                        deploy/starter/set-secret.sh (merges one key, never echoes the value).
#   RDS master password                  managed by RDS (rds.tf).
#
# Terraform only writes the initial "{}" placeholder and then ignores the value.

resource "aws_secretsmanager_secret" "generated" {
  name                    = "${var.project}/${var.environment}/generated"
  description             = "Heal India Global ${var.environment}: secrets generated on the box at the first deploy"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = var.secrets_recovery_window_days
}

resource "aws_secretsmanager_secret_version" "generated" {
  secret_id     = aws_secretsmanager_secret.generated.id
  secret_string = "{}"

  lifecycle {
    ignore_changes = [secret_string, version_stages]
  }
}

resource "aws_secretsmanager_secret" "third_party" {
  name                    = "${var.project}/${var.environment}/third-party"
  description             = "Heal India Global ${var.environment}: third-party credentials (set with deploy/starter/set-secret.sh)"
  kms_key_id              = aws_kms_key.main.arn
  recovery_window_in_days = var.secrets_recovery_window_days
}

resource "aws_secretsmanager_secret_version" "third_party" {
  secret_id     = aws_secretsmanager_secret.third_party.id
  secret_string = "{}"

  lifecycle {
    ignore_changes = [secret_string, version_stages]
  }
}

# ---------------------------------------------------------------------------------------------------
# Non-secret runtime configuration read by deploy.sh at every deploy (SSM Parameter Store, standard tier: free).
# Changing a setting = terraform apply + a redeploy; the instance is never replaced for it.
# ---------------------------------------------------------------------------------------------------
locals {
  # Environment of api / worker / migrate (merged over the defaults of infra/docker-compose.yml). Security-
  # critical values (ENV, COOKIE_SECURE, ADMIN_MFA_REQUIRED, STORAGE_BACKEND, DATABASE_SSLMODE) are pinned in
  # infra/docker-compose.aws.yml as well.
  app_environment = merge(
    {
      ENV                 = local.app_env
      APP_NAME            = "Heal India Global"
      SITE_DOMAIN         = local.site_host
      API_BASE_URL        = local.site_url
      PATIENT_WEB_URL     = local.site_url
      PUBLIC_SITE_URL     = local.site_url
      AGENT_PORTAL_URL    = "${local.site_url}/agent"
      HOSPITAL_PORTAL_URL = "${local.site_url}/hospital"
      ADMIN_PORTAL_URL    = "${local.staff_url}/gahi"
      # SEC-022: the staff door accepts browser requests only from the console's own origin.
      STAFF_CONSOLE_ORIGIN = local.staff_url
      STAFF_ALLOWED_IPS    = join(",", var.allowed_staff_cidrs)
      ADMIN_MFA_REQUIRED   = "true"
      COOKIE_SECURE        = "true"
      # Public hosts + the in-network names: website SSR calls http://api:8000, container health checks 127.0.0.1.
      TRUSTED_HOSTS = "${local.site_host},${local.staff_host},api,127.0.0.1,localhost"
      LOG_LEVEL     = "INFO"
      LOG_JSON      = "true"
      ENABLE_DOCS   = "false"

      AWS_REGION         = var.aws_region
      AWS_DEFAULT_REGION = var.aws_region

      STORAGE_BACKEND   = "s3"
      S3_BUCKET         = aws_s3_bucket.documents.bucket
      S3_REGION         = var.aws_region
      S3_SSE            = "aws:kms"
      S3_SSE_KMS_KEY_ID = aws_kms_key.main.arn

      EMAIL_BACKEND         = "ses"
      SES_REGION            = var.aws_region
      SES_CONFIGURATION_SET = aws_sesv2_configuration_set.this.configuration_set_name
      EMAIL_FROM            = var.email_from

      SMS_PROVIDER               = var.enable_sms ? "sns" : "none"
      SNS_REGION                 = var.aws_region
      SNS_SMS_SENDER_ID          = var.sms_sender_id
      SNS_SMS_ORIGINATION_NUMBER = var.sms_origination_number
      SNS_SMS_TYPE               = "Transactional"
      SMS_ALLOWED_COUNTRY_CODES  = join(",", var.sms_allowed_country_codes)

      PAYMENT_GATEWAYS_ENABLED = join(",", var.payment_gateways)
      AI_ENABLED               = tostring(var.ai_enabled)
      AI_MODEL                 = var.ai_model
      AI_EFFORT                = var.ai_effort
      STT_PROVIDER             = "local_whisper"
      VOICE_RETAIN_AUDIO       = "false"
      WHISPER_MODEL            = var.whisper_model
      GOOGLE_CLIENT_IDS        = join(",", var.google_client_ids)
      APPLE_CLIENT_IDS         = join(",", var.apple_client_ids)
      APPLE_TEAM_ID            = var.apple_team_id
      APPLE_KEY_ID             = var.apple_key_id
      FCM_PROJECT_ID           = var.fcm_project_id

      WEB_CONCURRENCY    = tostring(var.web_concurrency)
      WORKER_CONCURRENCY = tostring(var.worker_concurrency)
      DB_POOL_SIZE       = tostring(var.db_pool_size)
      DB_MAX_OVERFLOW    = tostring(var.db_max_overflow)
      RUN_WORKER_IN_API  = "false"

      NEXT_PUBLIC_SITE_URL = local.site_url
      WEBSITE_NOINDEX      = "false"
    },
    var.extra_app_environment,
  )

  runtime_config = {
    region                = var.aws_region
    name                  = local.name
    domain                = local.site_host
    staff_host            = local.staff_host
    staff_allowed_cidrs   = var.allowed_staff_cidrs
    certbot_email         = var.alert_email
    db_host               = aws_db_instance.postgres.address
    db_port               = aws_db_instance.postgres.port
    db_name               = var.db_name
    db_app_user           = var.db_app_username
    db_migrator_user      = var.db_migrator_username
    db_master_secret_arn  = aws_db_instance.postgres.master_user_secret[0].secret_arn
    generated_secret_id   = aws_secretsmanager_secret.generated.arn
    third_party_secret_id = aws_secretsmanager_secret.third_party.arn
    bootstrap_mode        = var.bootstrap_mode
    ecr_registry          = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
    api_image             = aws_ecr_repository.this["api"].repository_url
    web_image             = aws_ecr_repository.this["web"].repository_url
    website_image         = aws_ecr_repository.this["website"].repository_url
    artifacts_bucket      = aws_s3_bucket.artifacts.bucket
    container_log_group   = var.ship_container_logs ? local.log_group_containers : ""
    app_environment       = local.app_environment
  }
}

resource "aws_ssm_parameter" "config" {
  name        = local.config_parameter_name
  description = "Heal India Global ${var.environment}: non-secret runtime configuration for deploy/starter/deploy.sh"
  type        = "String"
  tier        = "Intelligent-Tiering" # standard (free) while the JSON fits in 4 KB
  value       = jsonencode(local.runtime_config)
}
