# Alerts -> SNS -> alert_email (AWS sends a confirmation e-mail per topic: click both links).
# The topics carry alarm metadata only (no personal data), so they use SNS's default encryption-free setup;
# that keeps CloudWatch and Route 53 alarm publishing free of extra KMS key policies.

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Route 53 health-check metrics exist only in us-east-1: a second topic there.
resource "aws_sns_topic" "alerts_us_east_1" {
  provider = aws.us_east_1

  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_us_east_1_email" {
  provider = aws.us_east_1

  topic_arn = aws_sns_topic.alerts_us_east_1.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------------------------------
# EC2
# ---------------------------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "ec2_cpu" {
  alarm_name          = "${local.name}-ec2-cpu-high"
  alarm_description   = "Box CPU above 80% for 15 minutes (t4g: also check CPUCreditBalance / surplus credits)"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "ec2_memory" {
  alarm_name          = "${local.name}-ec2-memory-high"
  alarm_description   = "Box memory above 85% for 15 minutes (CloudWatch agent)"
  namespace           = "CWAgent"
  metric_name         = "mem_used_percent"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "ec2_disk" {
  alarm_name          = "${local.name}-ec2-disk-high"
  alarm_description   = "Root volume above 80% (CloudWatch agent). Prune images: docker image prune -af; or grow the volume."
  namespace           = "CWAgent"
  metric_name         = "disk_used_percent"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "missing"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# Host failure: EC2 auto-recovery moves the instance to healthy hardware (same id, EIP, EBS).
resource "aws_cloudwatch_metric_alarm" "ec2_recover" {
  alarm_name          = "${local.name}-ec2-system-check-recover"
  alarm_description   = "System status check failed: EC2 recovers the instance onto new hardware"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = concat(["arn:${local.partition}:automate:${var.aws_region}:ec2:recover"], local.alarm_actions)
  ok_actions          = local.alarm_actions
}

# Guest OS failure (kernel panic, out of memory lock-up): reboot.
resource "aws_cloudwatch_metric_alarm" "ec2_reboot" {
  alarm_name          = "${local.name}-ec2-instance-check-reboot"
  alarm_description   = "Instance status check failed for 5 minutes: reboot"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = aws_instance.app.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = concat(["arn:${local.partition}:automate:${var.aws_region}:ec2:reboot"], local.alarm_actions)
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------------------------------
# RDS
# ---------------------------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-cpu-high"
  alarm_description   = "RDS CPU above 80% for 15 minutes"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${local.name}-rds-free-storage-low"
  alarm_description   = "RDS free storage below 10 GiB (autoscaling grows it up to rds_max_allocated_storage)"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10 * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_memory" {
  alarm_name          = "${local.name}-rds-freeable-memory-low"
  alarm_description   = "RDS freeable memory below 150 MiB for 15 minutes (db.t4g.small has 2 GiB): size up"
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 150 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
}

# ---------------------------------------------------------------------------------------------------
# Public HTTPS health check (Route 53, from several AWS locations) of the API readiness endpoint through nginx.
# ---------------------------------------------------------------------------------------------------
resource "aws_route53_health_check" "site" {
  fqdn              = local.site_host
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health/ready"
  failure_threshold = 3
  request_interval  = 30
  enable_sni        = true

  tags = { Name = "${local.name}-site" }
}

resource "aws_cloudwatch_metric_alarm" "site_health" {
  provider = aws.us_east_1

  alarm_name          = "${local.name}-site-down"
  alarm_description   = "https://${local.site_host}/health/ready is failing from the Route 53 health checkers"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.site.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts_us_east_1.arn]
  ok_actions          = [aws_sns_topic.alerts_us_east_1.arn]
}

# ---------------------------------------------------------------------------------------------------
# Cost: monthly budget with forecast and actual alerts (AWS Budgets e-mails directly; first 2 budgets free).
# ---------------------------------------------------------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }
}
