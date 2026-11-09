# Application Load Balancer for the API (origin of every CloudFront distribution's /api/* behaviour and of the
# api.<domain> distribution). HTTPS only (ACM certificate for the api_origin hostname), WebSockets supported
# natively (the idle timeout applies; uvicorn sends WebSocket pings every 20 s).
#
# Lock-down: the security group admits only CloudFront origin-facing ranges, and the listener forwards only
# requests carrying the secret X-Origin-Verify header that CloudFront adds - everything else gets 403.
# /metrics is never reachable through the ALB (scrape tasks directly inside the VPC instead).

locals {
  alb_certificate_arn = local.create_alb_cert ? (
    local.manage_dns ? aws_acm_certificate_validation.alb[0].certificate_arn : aws_acm_certificate.alb[0].arn
  ) : var.alb_certificate_arn
}

resource "aws_lb" "api" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for s in aws_subnet.public : s.id]
  ip_address_type    = "ipv4"

  idle_timeout               = var.alb_idle_timeout
  enable_http2               = true
  drop_invalid_header_fields = true
  desync_mitigation_mode     = "defensive"
  enable_deletion_protection = var.alb_deletion_protection

  access_logs {
    bucket  = aws_s3_bucket.logs.id
    prefix  = "alb"
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.logs]
}

resource "aws_lb_target_group" "api" {
  name                 = "${local.name}-api"
  port                 = 8000
  protocol             = "HTTP"
  protocol_version     = "HTTP1"
  target_type          = "ip"
  vpc_id               = aws_vpc.this.id
  deregistration_delay = 30

  # Readiness (database + Redis). A short dependency blip marks targets unhealthy only after ~75 s; if every
  # target is unhealthy the ALB fails open and keeps routing to all of them.
  health_check {
    enabled             = true
    path                = "/health/ready"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = local.alb_certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "application/json"
      status_code  = "403"
      message_body = jsonencode({ error = { code = "forbidden", message = "Direct access is not allowed", details = null, request_id = null } })
    }
  }

  lifecycle {
    precondition {
      condition     = local.alb_certificate_arn != ""
      error_message = "No ALB certificate: set route53_zone_id (managed DNS validation) or alb_certificate_arn."
    }
  }
}

resource "aws_lb_listener_rule" "block_metrics" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 1

  action {
    type = "fixed-response"

    fixed_response {
      content_type = "application/json"
      status_code  = "404"
      message_body = jsonencode({ error = { code = "not_found", message = "Resource not found", details = null, request_id = null } })
    }
  }

  condition {
    path_pattern {
      values = ["/metrics", "/metrics/*"]
    }
  }
}

resource "aws_lb_listener_rule" "from_cloudfront" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    http_header {
      http_header_name = local.origin_verify_header
      values           = [random_password.origin_verify.result]
    }
  }
}
