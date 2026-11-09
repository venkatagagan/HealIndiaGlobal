output "environment" {
  description = "Environment name."
  value       = var.environment
}

output "aws_region" {
  description = "Primary region."
  value       = var.aws_region
}

# ---------------------------------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------------------------------
output "app_urls" {
  description = "Public URLs of the four web apps (each also serves the API same-origin under /api/v1)."
  value       = { for k, app in local.spa_apps : k => "https://${app.host}" }
}

output "api_url" {
  description = "Public API base host (Flutter app API_BASE_URL = <api_url>/api/v1)."
  value       = "https://${local.hosts.api}"
}

output "mobile_api_base_url" {
  description = "Value for the Flutter build: --dart-define=API_BASE_URL=..."
  value       = "https://${local.hosts.api}/api/v1"
}

output "webhook_urls" {
  description = "Configure these in the Razorpay and Stripe dashboards."
  value = {
    razorpay = "https://${local.hosts.api}/api/v1/payments/webhooks/razorpay"
    stripe   = "https://${local.hosts.api}/api/v1/payments/webhooks/stripe"
  }
}

output "spa_build_env" {
  description = "VITE_* build-time variables for `npm run build` (public values only)."
  value = {
    VITE_API_BASE_URL        = "/api/v1"
    VITE_PATIENT_WEB_URL     = "https://${local.hosts.patient}"
    VITE_AGENT_PORTAL_URL    = "https://${local.hosts.agent}"
    VITE_HOSPITAL_PORTAL_URL = "https://${local.hosts.hospital}"
    VITE_ADMIN_PORTAL_URL    = "https://${local.hosts.admin}"
  }
}

# ---------------------------------------------------------------------------------------------------
# Static sites
# ---------------------------------------------------------------------------------------------------
output "spa_buckets" {
  description = "S3 bucket per SPA (keys: patient, agent, hospital, admin)."
  value       = { for k, b in aws_s3_bucket.spa : k => b.bucket }
}

output "spa_build_dirs" {
  description = "web/apps/<dir> per SPA."
  value       = { for k, app in local.spa_apps : k => app.dir }
}

output "cloudfront_distribution_ids" {
  description = "CloudFront distribution ids (patient, agent, hospital, admin, api)."
  value       = merge({ for k, d in aws_cloudfront_distribution.spa : k => d.id }, { api = aws_cloudfront_distribution.api.id })
}

output "cloudfront_domain_names" {
  description = "CloudFront domain names (CNAME targets when DNS is not managed here)."
  value       = merge({ for k, d in aws_cloudfront_distribution.spa : k => d.domain_name }, { api = aws_cloudfront_distribution.api.domain_name })
}

# ---------------------------------------------------------------------------------------------------
# Containers
# ---------------------------------------------------------------------------------------------------
output "ecr_repository_urls" {
  description = "ECR repository URLs."
  value       = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "ecr_api_repository_url" {
  description = "Repository for the backend image (api, worker, migrate)."
  value       = aws_ecr_repository.this["api"].repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_names" {
  description = "ECS services."
  value = {
    api    = aws_ecs_service.api.name
    worker = aws_ecs_service.worker.name
  }
}

output "migrate_task_definition_arn" {
  description = "One-off migration task (alembic upgrade head)."
  value       = aws_ecs_task_definition.migrate.arn
}

output "db_bootstrap_task_definition_arn" {
  description = "One-off task that creates / re-keys the application database role."
  value       = aws_ecs_task_definition.db_bootstrap.arn
}

output "one_off_task_network_configuration" {
  description = "JSON for `aws ecs run-task --network-configuration` (private subnets, tasks security group)."
  value = jsonencode({
    awsvpcConfiguration = {
      subnets        = [for s in aws_subnet.private : s.id]
      securityGroups = [aws_security_group.tasks.id]
      assignPublicIp = "DISABLED"
    }
  })
}

output "metrics_scrape_dns_name" {
  description = "Cloud Map name resolving to every API task (Prometheus dns_sd_configs, port 8000, path /metrics)."
  value       = "${aws_service_discovery_service.api.name}.${aws_service_discovery_private_dns_namespace.this.name}"
}

# ---------------------------------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------------------------------
output "documents_bucket" {
  description = "Private documents bucket (S3_BUCKET)."
  value       = aws_s3_bucket.documents.bucket
}

output "rds_endpoint" {
  description = "PostgreSQL endpoint (isolated subnets; reachable only from the app security groups)."
  value       = aws_db_instance.postgres.address
}

output "rds_master_secret_arn" {
  description = "RDS-managed master credentials (break-glass / db-bootstrap only)."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

output "redis_primary_endpoint" {
  description = "Redis primary endpoint (TLS, AUTH)."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

# ---------------------------------------------------------------------------------------------------
# Secrets, alerting, networking
# ---------------------------------------------------------------------------------------------------
output "secret_names" {
  description = "Secrets Manager names injected into the containers."
  value = merge(
    { for k, s in aws_secretsmanager_secret.generated : k => s.name },
    { for k, s in aws_secretsmanager_secret.external : k => s.name },
  )
}

output "secrets_to_populate" {
  description = "Third-party secrets created empty: set each with deploy/scripts/set-secret.sh before starting services."
  value       = [for k in local.external_secret_keys : aws_secretsmanager_secret.external[k].name]
}

output "alerts_sns_topic_arn" {
  description = "SNS topic receiving CloudWatch alarms and ECS deployment/task failure events."
  value       = aws_sns_topic.alerts.arn
}

output "waf_web_acl_arn" {
  description = "CloudFront WAF web ACL."
  value       = aws_wafv2_web_acl.edge.arn
}

output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "private_subnet_ids" {
  description = "Private (task) subnets."
  value       = [for s in aws_subnet.private : s.id]
}

output "dns_records_to_create" {
  description = "Records to create at your DNS provider when route53_zone_id is empty (empty list otherwise)."
  value = local.manage_dns ? [] : concat(
    [for k, app in local.spa_apps : { name = app.host, type = "CNAME", value = aws_cloudfront_distribution.spa[k].domain_name }],
    [
      { name = local.hosts.api, type = "CNAME", value = aws_cloudfront_distribution.api.domain_name },
      { name = local.hosts.api_origin, type = "CNAME", value = aws_lb.api.dns_name },
    ],
    [for dvo in local.certificate_validation_options : { name = dvo.resource_record_name, type = dvo.resource_record_type, value = dvo.resource_record_value }],
  )
}
