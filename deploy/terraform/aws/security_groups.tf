# Security groups (one rule per resource, so rules can be added without replacing the group).
#
#   CloudFront edge --443--> alb --8000--> api --5432--> rds
#                                           \--6379--> redis
#   tasks (worker, migrate, db-bootstrap) --5432/6379--> rds / redis
#   api, tasks --443/587--> internet via NAT (Claude API, Razorpay, Stripe, SMTP, AWS APIs)

data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ---------------------------------------------------------------------------------------------------
# ALB: reachable only from CloudFront origin-facing IP ranges (requests must also carry the secret
# origin header, see alb.tf). The managed prefix list counts as ~55 rules toward the SG rule quota.
# ---------------------------------------------------------------------------------------------------
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "API load balancer - HTTPS from CloudFront only"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https_from_cloudfront" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from CloudFront origin-facing servers"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id
}

resource "aws_vpc_security_group_egress_rule" "alb_to_api" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward to API tasks"
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.api.id
}

# ---------------------------------------------------------------------------------------------------
# API tasks
# ---------------------------------------------------------------------------------------------------
resource "aws_security_group" "api" {
  name        = "${local.name}-api"
  description = "API tasks (FastAPI on 8000)"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-api" }
}

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  description                  = "HTTP from the ALB"
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_ingress_rule" "api_metrics_scrape" {
  for_each = toset(var.metrics_scrape_cidrs)

  security_group_id = aws_security_group.api.id
  description       = "Prometheus / ADOT scrape of /metrics"
  ip_protocol       = "tcp"
  from_port         = 8000
  to_port           = 8000
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "api_all" {
  security_group_id = aws_security_group.api.id
  description       = "Outbound (database, cache, AWS APIs, payment gateways, Claude API, SMTP)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ---------------------------------------------------------------------------------------------------
# Worker and one-off tasks (migrate, db-bootstrap): no inbound traffic
# ---------------------------------------------------------------------------------------------------
resource "aws_security_group" "tasks" {
  name        = "${local.name}-tasks"
  description = "Worker and one-off tasks (no inbound)"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-tasks" }
}

resource "aws_vpc_security_group_egress_rule" "tasks_all" {
  security_group_id = aws_security_group.tasks.id
  description       = "Outbound (database, cache, AWS APIs, payment gateways, Claude API, SMTP)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ---------------------------------------------------------------------------------------------------
# Data tier (isolated subnets, no egress rules)
# ---------------------------------------------------------------------------------------------------
resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "PostgreSQL - from application tasks only"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-rds" }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_app" {
  for_each = {
    api   = aws_security_group.api.id
    tasks = aws_security_group.tasks.id
  }

  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = each.value
}

resource "aws_security_group" "redis" {
  name        = "${local.name}-redis"
  description = "Redis (TLS) - from application tasks only"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-redis" }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_app" {
  for_each = {
    api   = aws_security_group.api.id
    tasks = aws_security_group.tasks.id
  }

  security_group_id            = aws_security_group.redis.id
  description                  = "Redis from ${each.key}"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = each.value
}
