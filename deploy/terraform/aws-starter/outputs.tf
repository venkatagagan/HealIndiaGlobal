output "elastic_ip" {
  description = "Public IPv4 of the box (the A records of the domain and the staff console point here)."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "EC2 instance id (SSM Session Manager: aws ssm start-session --target <id>)."
  value       = aws_instance.app.id
}

output "site_url" {
  description = "Public site (website, /app/, /agent/, /hospital/, /api/)."
  value       = local.site_url
}

output "staff_console_url" {
  description = "Staff console."
  value       = "${local.staff_url}/gahi/"
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (private; reachable from the box only)."
  value       = aws_db_instance.postgres.endpoint
}

output "rds_master_secret_arn" {
  description = "Secrets Manager secret holding the RDS master password (managed and rotated by RDS)."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

output "documents_bucket" {
  description = "S3 documents bucket (S3_BUCKET)."
  value       = aws_s3_bucket.documents.bucket
}

output "artifacts_bucket" {
  description = "S3 bucket for deploy bundles."
  value       = aws_s3_bucket.artifacts.bucket
}

output "ecr_repository_urls" {
  description = "ECR repositories (linux/arm64 images)."
  value       = { for k, r in aws_ecr_repository.this : k => r.repository_url }
}

output "secrets" {
  description = "Secrets Manager secrets: generated (on the box, first deploy) and third_party (set with deploy/starter/set-secret.sh)."
  value = {
    generated   = aws_secretsmanager_secret.generated.name
    third_party = aws_secretsmanager_secret.third_party.name
  }
}

output "config_parameter" {
  description = "SSM parameter with the non-secret runtime configuration read by deploy.sh."
  value       = aws_ssm_parameter.config.name
}

output "ssm_documents" {
  description = "SSM Run Command documents: deploy (ImageTag parameter) and certs."
  value = {
    deploy = aws_ssm_document.deploy.name
    certs  = aws_ssm_document.certs.name
  }
}

output "github_deploy_role_arn" {
  description = "Role for .github/workflows/deploy-aws.yml (repository variable AWS_DEPLOY_ROLE_ARN)."
  value       = aws_iam_role.github_deploy.arn
}

output "github_repository_variables" {
  description = "Repository variables to set in GitHub (Settings -> Secrets and variables -> Actions -> Variables)."
  value = {
    AWS_DEPLOY_ENABLED   = "true"
    AWS_REGION           = var.aws_region
    AWS_DEPLOY_ROLE_ARN  = aws_iam_role.github_deploy.arn
    AWS_DEPLOYMENT_NAME  = local.name
    AWS_ECR_PREFIX       = "${var.project}/${var.environment}"
    AWS_ARTIFACTS_BUCKET = aws_s3_bucket.artifacts.bucket
    AWS_SSM_DOCUMENT     = aws_ssm_document.deploy.name
    AWS_SITE_DOMAIN      = local.site_host
    AWS_STAFF_HOST       = local.staff_host
    GOOGLE_CLIENT_ID     = length(var.google_client_ids) > 0 ? var.google_client_ids[0] : ""
  }
}

output "name_servers" {
  description = "Name servers of the hosted zone created here (set them at the registrar). Empty when an existing zone is used."
  value       = var.manage_dns && var.create_hosted_zone ? aws_route53_zone.this[0].name_servers : []
}

output "dns_records_to_create" {
  description = "Every DNS record the deployment needs. With manage_dns = true they are already in Route 53; otherwise create them at your DNS provider."
  value       = local.dns_records
}

output "ses_dns_records" {
  description = "SES records (DKIM, MAIL FROM, DMARC)."
  value       = [for r in local.dns_records : r if startswith(r.purpose, "SES") || r.purpose == "DMARC"]
}

output "alarm_topics" {
  description = "SNS topics that e-mail alert_email (confirm both subscriptions)."
  value       = [aws_sns_topic.alerts.arn, aws_sns_topic.alerts_us_east_1.arn]
}
