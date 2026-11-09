# ECS on Fargate
#   api           gunicorn+uvicorn (backend/Dockerfile CMD) behind the ALB, autoscaled, health check /health/ready
#   worker        python -m app.worker (no load balancer)
#   migrate       one-off: alembic upgrade head          (deploy/scripts/run-task.sh migrate)
#   db-bootstrap  one-off: creates/re-keys the app role   (deploy/scripts/run-task.sh db-bootstrap)
# All containers run as non-root users with a read-only root filesystem and a memory-backed /tmp (tmpfs).

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = var.enable_container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 0
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  for_each = toset(["api", "worker", "migrate", "db-bootstrap"])

  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

# ---------------------------------------------------------------------------------------------------
# Container configuration
# ---------------------------------------------------------------------------------------------------
locals {
  api_image = "${aws_ecr_repository.this["api"].repository_url}:${var.image_tag}"

  # Non-secret settings shared by api, worker and migrate (names match backend/app/core/config.py).
  app_environment = merge(
    {
      ENV                          = local.app_env
      APP_NAME                     = "Heal India Global"
      API_BASE_URL                 = "https://${local.hosts.api}"
      PATIENT_WEB_URL              = "https://${local.hosts.patient}"
      AGENT_PORTAL_URL             = "https://${local.hosts.agent}"
      HOSPITAL_PORTAL_URL          = "https://${local.hosts.hospital}"
      ADMIN_PORTAL_URL             = "https://${local.hosts.admin}"
      PUBLIC_SITE_URL              = "https://${local.hosts.patient}"
      LOG_LEVEL                    = var.log_level
      LOG_JSON                     = "true"
      ENABLE_DOCS                  = "false"
      SENTRY_DSN                   = var.sentry_dsn
      DB_POOL_SIZE                 = tostring(var.db_pool_size)
      DB_MAX_OVERFLOW              = tostring(var.db_max_overflow)
      CORS_ORIGINS                 = join(",", local.spa_origins)
      COOKIE_SECURE                = "true"
      # Host validation happens at CloudFront/ALB; ALB health checks use the task IP as Host header.
      TRUSTED_HOSTS                = "*"

      # The ALB admits only CloudFront (origin-facing prefix list + secret X-Origin-Verify header) and CloudFront
      # always overwrites CloudFront-Viewer-Address, so the API keys rate limits, audit IPs and STAFF_ALLOWED_IPS
      # on it; without it every viewer behind one CloudFront edge shares a single "client IP" (SEC-058).
      TRUST_CLOUDFRONT_VIEWER_ADDRESS = "true"
      # Proxies whose X-Forwarded-For hops are skipped: the ALB nodes inside the VPC.
      TRUSTED_PROXIES   = var.vpc_cidr
      STAFF_ALLOWED_IPS = join(",", var.staff_allowed_cidrs)

      # Production refuses to start without staff MFA, so it is forced on there.
      ADMIN_MFA_REQUIRED           = local.app_env == "production" ? "true" : tostring(var.admin_mfa_required)
      REQUIRE_EMAIL_VERIFICATION   = tostring(var.require_email_verification)
      GOOGLE_CLIENT_IDS            = join(",", var.google_client_ids)
      APPLE_CLIENT_IDS             = join(",", var.apple_client_ids)
      APPLE_TEAM_ID                = var.apple_team_id
      APPLE_KEY_ID                 = var.apple_key_id
      AI_ENABLED                   = tostring(var.ai_enabled)
      AI_MODEL                     = var.ai_model
      AI_EFFORT                    = var.ai_effort
      AI_TIMEOUT_SECONDS           = "90"
      # Voice intake: production requires local speech-to-text and never retains audio.
      STT_PROVIDER                 = "local_whisper"
      VOICE_RETAIN_AUDIO           = "false"
      STORAGE_BACKEND              = "s3"
      S3_BUCKET                    = aws_s3_bucket.documents.bucket
      S3_REGION                    = var.aws_region
      MAX_UPLOAD_MB                = tostring(var.max_upload_mb)
      EMAIL_BACKEND                = var.email_backend
      SMTP_HOST                    = var.smtp_host
      SMTP_PORT                    = tostring(var.smtp_port)
      SMTP_STARTTLS                = tostring(var.smtp_starttls)
      EMAIL_FROM                   = var.email_from
      PAYMENT_GATEWAYS_ENABLED     = join(",", var.payment_gateways)
      BASE_CURRENCY                = "INR"
      DEFAULT_PATIENT_CURRENCY     = "USD"
      RUN_WORKER_IN_API            = "false"
      WORKER_POLL_INTERVAL_SECONDS = "2"
      RATE_LIMIT_ENABLED           = "true"
      TZ                           = "UTC"
      # Public website integration (backend/app/modules/catalog/settings.py): on-demand ISR revalidation target
      # (empty = off; REVALIDATE_SECRET is injected only when set) and the website tasks' rate-limit budget.
      WEBSITE_REVALIDATE_URL     = var.website_revalidate_url
      WEBSITE_SERVER_IPS         = join(",", var.website_server_cidrs)
      CATALOG_RATE_LIMIT_PUBLIC  = tostring(var.catalog_rate_limit_public)
      CATALOG_RATE_LIMIT_WEBSITE = tostring(var.catalog_rate_limit_website)
    },
    var.extra_environment,
  )

  # gunicorn knobs read by the image (backend/Dockerfile). Keep-alive must exceed the ALB idle timeout.
  api_process_environment = {
    WEB_CONCURRENCY     = tostring(var.web_concurrency)
    GUNICORN_TIMEOUT    = "60"
    GUNICORN_KEEPALIVE  = tostring(var.alb_idle_timeout + 10)
    # Trust X-Forwarded-* only from inside the VPC (the ALB), never "*": with "*" uvicorn takes the LEFTMOST
    # X-Forwarded-For entry, which the client controls (INTEGRATION_BACKLOG #20). Behind CloudFront the hop the
    # ALB reports is a CloudFront edge; the real viewer address arrives in `CloudFront-Viewer-Address`
    # (forwarded by Managed-AllViewerExceptHostHeader) - the backend should prefer that header when set.
    FORWARDED_ALLOW_IPS = var.vpc_cidr
    RUN_MIGRATIONS      = "0" # migrations run as the one-off migrate task, never on api start
  }

  # ECS drops empty values (perpetual diffs), so they are filtered out; the app defaults apply instead.
  container_environment = {
    for name, env in {
      api     = merge(local.app_environment, local.api_process_environment)
      worker  = local.app_environment
      migrate = local.app_environment
    } : name => [for k, v in env : { name = k, value = v } if v != ""]
  }

  app_container_secrets     = [for k in sort(keys(local.app_secret_arns)) : { name = k, valueFrom = local.app_secret_arns[k] }]
  migrate_container_secrets = [for k in sort(keys(local.migrate_secret_arns)) : { name = k, valueFrom = local.migrate_secret_arns[k] }]

  container_logging = {
    for svc in ["api", "worker", "migrate", "db-bootstrap"] : svc => {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs[svc].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = svc
        "mode"                  = "non-blocking"
        "max-buffer-size"       = "25m"
      }
    }
  }

  # Read-only root filesystem + memory-backed /tmp (tmpfs on Fargate, mode 1777 so the non-root user can
  # write: multipart uploads above 1 MB spool there). ECS Exec needs a writable root filesystem.
  readonly_root_fs = !var.enable_ecs_exec
  linux_parameters = {
    initProcessEnabled = var.enable_ecs_exec
    tmpfs              = [{ containerPath = "/tmp", size = 256, mountOptions = ["nosuid", "nodev"] }]
  }
  small_linux_parameters = {
    initProcessEnabled = false
    tmpfs              = [{ containerPath = "/tmp", size = 64, mountOptions = ["nosuid", "nodev"] }]
  }
  nofile_ulimit = [{ name = "nofile", softLimit = 65535, hardLimit = 65535 }]

  # Idempotent: creates the application role (or resets its password after rotation), makes it the owner of
  # the database and installs extensions as the RDS master user (pg_stat_statements needs rds_superuser).
  # psql variables keep the password out of the command line and logs.
  db_bootstrap_script = <<-EOT
    set -eu
    echo "[db-bootstrap] host=$PGHOST db=$PGDATABASE admin=$PGUSER app_role=$APP_DB_USER"
    psql -v ON_ERROR_STOP=1 -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v db_name="$PGDATABASE" <<'SQL'
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    CREATE EXTENSION IF NOT EXISTS citext;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS btree_gin;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    SELECT format('CREATE ROLE %I LOGIN', :'app_user')
     WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
    ALTER ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';
    GRANT :"app_user" TO CURRENT_USER;
    ALTER DATABASE :"db_name" OWNER TO :"app_user";
    SQL
    echo "[db-bootstrap] done"
  EOT
}

# ---------------------------------------------------------------------------------------------------
# Task definitions
# ---------------------------------------------------------------------------------------------------
resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution["app"].arn
  task_role_arn            = aws_iam_role.task["api"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name                   = "api"
      image                  = local.api_image
      essential              = true
      user                   = "10001:10001"
      readonlyRootFilesystem = local.readonly_root_fs
      linuxParameters        = local.linux_parameters
      portMappings = [
        { name = "http", containerPort = 8000, hostPort = 8000, protocol = "tcp", appProtocol = "http" },
      ]
      environment = local.container_environment["api"]
      secrets     = local.app_container_secrets
      ulimits     = local.nofile_ulimit
      healthCheck = {
        command     = ["CMD", "python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=4).status == 200 else 1)"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      stopTimeout      = 40 # gunicorn graceful_timeout is 30 s
      logConfiguration = local.container_logging["api"]
    },
  ])

  lifecycle {
    precondition {
      condition     = !(local.is_production && contains(var.payment_gateways, "mock"))
      error_message = "The mock payment gateway must not be enabled in production (the app refuses to start)."
    }
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution["app"].arn
  task_role_arn            = aws_iam_role.task["worker"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name                   = "worker"
      image                  = local.api_image
      essential              = true
      user                   = "10001:10001"
      command                = ["python", "-m", "app.worker", "--concurrency", tostring(var.worker_concurrency)]
      readonlyRootFilesystem = local.readonly_root_fs
      linuxParameters        = local.linux_parameters
      environment            = local.container_environment["worker"]
      secrets                = local.app_container_secrets
      ulimits                = local.nofile_ulimit
      stopTimeout            = 120 # Fargate maximum: lets running jobs finish on scale-in/deploys
      logConfiguration       = local.container_logging["worker"]
    },
  ])
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.migrate_cpu
  memory                   = var.migrate_memory
  execution_role_arn       = aws_iam_role.execution["migrate"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name                   = "migrate"
      image                  = local.api_image
      essential              = true
      user                   = "10001:10001"
      command                = ["alembic", "-c", "/app/alembic.ini", "upgrade", "head"]
      readonlyRootFilesystem = true
      environment            = local.container_environment["migrate"]
      secrets                = local.migrate_container_secrets
      linuxParameters        = local.small_linux_parameters
      logConfiguration       = local.container_logging["migrate"]
    },
  ])
}

resource "aws_ecs_task_definition" "db_bootstrap" {
  family                   = "${local.name}-db-bootstrap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution["db-bootstrap"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name                   = "db-bootstrap"
      image                  = var.postgres_client_image
      essential              = true
      user                   = "70:70" # postgres user of the alpine image
      command                = ["sh", "-c", local.db_bootstrap_script]
      readonlyRootFilesystem = true
      environment = [
        { name = "PGHOST", value = aws_db_instance.postgres.address },
        { name = "PGPORT", value = tostring(aws_db_instance.postgres.port) },
        { name = "PGDATABASE", value = var.db_name },
        { name = "PGSSLMODE", value = "require" },
        { name = "PGCONNECT_TIMEOUT", value = "15" },
        { name = "APP_DB_USER", value = var.db_app_username },
        { name = "HOME", value = "/tmp" },
      ]
      secrets = [
        { name = "PGUSER", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::" },
        { name = "APP_DB_PASSWORD", valueFrom = "${aws_secretsmanager_secret.generated["DB_APP_CREDENTIALS"].arn}:password::" },
      ]
      linuxParameters  = local.small_linux_parameters
      logConfiguration = local.container_logging["db-bootstrap"]
    },
  ])
}

# ---------------------------------------------------------------------------------------------------
# Service discovery (Cloud Map): api.<environment>.<project>.internal resolves to every running API task,
# which is what an in-VPC Prometheus / ADOT collector scrapes (dns_sd_configs, port 8000, /metrics).
# ---------------------------------------------------------------------------------------------------
resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = "${var.environment}.${var.project}.internal"
  description = "${local.name} internal service discovery"
  vpc         = aws_vpc.this.id
}

resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# ---------------------------------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------------------------------
locals {
  api_min    = var.start_services ? var.api_min_count : 0
  api_max    = var.start_services ? var.api_max_count : 0
  worker_min = var.start_services ? var.worker_min_count : 0
  worker_max = var.start_services ? var.worker_max_count : 0

  worker_capacity_strategy = var.worker_use_fargate_spot ? [
    { provider = "FARGATE", base = 1, weight = 0 },
    { provider = "FARGATE_SPOT", base = 0, weight = 1 },
    ] : [
    { provider = "FARGATE", base = 0, weight = 1 },
  ]
}

resource "aws_ecs_service" "api" {
  name                              = "${local.name}-api"
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = local.api_min
  platform_version                  = "LATEST"
  enable_execute_command            = var.enable_ecs_exec
  enable_ecs_managed_tags           = true
  propagate_tags                    = "SERVICE"
  health_check_grace_period_seconds = 90
  wait_for_steady_state             = var.wait_for_steady_state

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    base              = 0
    weight            = 1
  }

  network_configuration {
    subnets          = [for s in aws_subnet.private : s.id]
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.api.arn
  }

  lifecycle {
    # Application Auto Scaling owns the running count (start_services toggles its min/max).
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_lb_listener.https,
    aws_ecs_cluster_capacity_providers.this,
    aws_iam_role_policy.execution_secrets,
  ]
}

resource "aws_ecs_service" "worker" {
  name                    = "${local.name}-worker"
  cluster                 = aws_ecs_cluster.this.id
  task_definition         = aws_ecs_task_definition.worker.arn
  desired_count           = local.worker_min
  platform_version        = "LATEST"
  enable_execute_command  = var.enable_ecs_exec
  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"
  wait_for_steady_state   = var.wait_for_steady_state

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  dynamic "capacity_provider_strategy" {
    for_each = local.worker_capacity_strategy

    content {
      capacity_provider = capacity_provider_strategy.value.provider
      base              = capacity_provider_strategy.value.base
      weight            = capacity_provider_strategy.value.weight
    }
  }

  network_configuration {
    subnets          = [for s in aws_subnet.private : s.id]
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = false
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [
    aws_ecs_cluster_capacity_providers.this,
    aws_iam_role_policy.execution_secrets,
  ]
}

# ---------------------------------------------------------------------------------------------------
# Autoscaling
# ---------------------------------------------------------------------------------------------------
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = local.api_min
  max_capacity       = local.api_max
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_cpu_target_percent
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "api_memory" {
  name               = "${local.name}-api-memory"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_memory_target_percent
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "api_requests" {
  name               = "${local.name}-api-requests"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_requests_per_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.api.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
  }
}

resource "aws_appautoscaling_target" "worker" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = local.worker_min
  max_capacity       = local.worker_max
}

resource "aws_appautoscaling_policy" "worker_cpu" {
  name               = "${local.name}-worker-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 70
    scale_in_cooldown  = 600
    scale_out_cooldown = 120

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
