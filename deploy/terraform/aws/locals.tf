data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"

  # Regular AZs only (no Local Zones / Wavelength).
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
      Stack       = "deploy/terraform/aws"
    },
    var.tags,
  )

  is_production = var.environment == "production"
  # Application ENV: only production enforces the strict settings checks; other environments run as staging.
  app_env = local.is_production ? "production" : "staging"

  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  # ---------------------------------------------------------------------------------------------------
  # Hostnames
  # ---------------------------------------------------------------------------------------------------
  host_base = local.is_production ? var.domain_name : "${var.environment}.${var.domain_name}"

  hosts = {
    patient    = coalesce(var.hostnames.patient, local.host_base)
    agent      = coalesce(var.hostnames.agent, "agent.${local.host_base}")
    hospital   = coalesce(var.hostnames.hospital, "hospital.${local.host_base}")
    admin      = coalesce(var.hostnames.admin, "admin.${local.host_base}")
    api        = coalesce(var.hostnames.api, "api.${local.host_base}")
    api_origin = coalesce(var.hostnames.api_origin, "origin-api.${local.host_base}")
  }

  # The four React SPAs (web/apps/<dir>). Each gets a private S3 bucket and a CloudFront distribution that
  # also forwards /api/* to the API, so the SPAs keep calling the API same-origin at /api/v1 (the refresh
  # cookie is Path=/api/v1/auth, SameSite=Strict) exactly like the infra/nginx edge.
  spa_apps = {
    patient  = { host = local.hosts.patient, dir = "patient-web" }
    agent    = { host = local.hosts.agent, dir = "agent-portal" }
    hospital = { host = local.hosts.hospital, dir = "hospital-portal" }
    admin    = { host = local.hosts.admin, dir = "admin-portal" }
  }

  spa_origins = [for k in ["patient", "agent", "hospital", "admin"] : "https://${local.spa_apps[k].host}"]

  # Header CloudFront adds to every origin request; the ALB forwards only requests that carry it.
  origin_verify_header = "X-Origin-Verify"

  # ---------------------------------------------------------------------------------------------------
  # Certificates
  # ---------------------------------------------------------------------------------------------------
  manage_dns             = var.route53_zone_id != ""
  create_cloudfront_cert = var.cloudfront_certificate_arn == ""
  create_alb_cert        = var.alb_certificate_arn == ""

  cloudfront_cert_names = [local.hosts.patient, local.hosts.agent, local.hosts.hospital, local.hosts.admin, local.hosts.api]
}
