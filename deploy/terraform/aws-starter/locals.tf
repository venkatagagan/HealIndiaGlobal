data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  default_tags = merge(
    {
      Project     = "heal-india-global"
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "deploy/terraform/aws-starter"
    },
    var.tags,
  )

  app_env = var.environment == "production" ? "production" : "staging"
  azs     = slice(data.aws_availability_zones.available.names, 0, 2)

  # ---- hosts ----------------------------------------------------------------------------------------
  site_host  = var.domain_name
  staff_host = "${var.staff_console_subdomain}.${var.domain_name}"
  site_url   = "https://${local.site_host}"
  staff_url  = "https://${local.staff_host}"

  mail_from_domain = "${var.mail_from_subdomain}.${var.domain_name}"

  # ---- names ----------------------------------------------------------------------------------------
  documents_bucket_name = "${local.name}-documents-${local.account_id}"
  artifacts_bucket_name = "${local.name}-artifacts-${local.account_id}"
  config_parameter_name = "/${var.project}/${var.environment}/config"
  ecr_repositories      = ["api", "web", "website"]
  log_group_containers  = "/${var.project}/${var.environment}/containers"
  log_group_system      = "/${var.project}/${var.environment}/system"

  # Tags the GitHub workflow uses to find the instance (ec2:DescribeInstances).
  instance_role_tag = "app"
}
