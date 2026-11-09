# CloudWatch alarms and EventBridge notifications -> SNS topic (KMS-encrypted) -> e-mail subscribers.
# Application-level alerts (job queue, dead jobs, webhook/settlement failures, DB connections from the app's
# view) are Prometheus rules in deploy/observability.

resource "aws_sns_topic" "alerts" {
  name              = "${local.name}-alerts"
  kms_master_key_id = aws_kms_key.logs.arn
}

data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid = "AccountOwnerManage"
    actions = [
      "SNS:GetTopicAttributes",
      "SNS:SetTopicAttributes",
      "SNS:AddPermission",
      "SNS:RemovePermission",
      "SNS:DeleteTopic",
      "SNS:Subscribe",
      "SNS:ListSubscriptionsByTopic",
      "SNS:Publish",
    ]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }

  statement {
    sid       = "AllowAlarmsAndEvents"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

resource "aws_sns_topic_subscription" "alerts_email" {
  for_each = toset(var.alarm_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ===================================================================================================
# API (ALB)
# ===================================================================================================
resource "aws_cloudwatch_metric_alarm" "api_5xx_ratio" {
  alarm_name          = "${local.name}-api-5xx-ratio"
  alarm_description   = "More than ${var.alarm_5xx_ratio_percent}% of API requests returned 5xx (target + ALB generated) in 3 of the last 5 minutes."
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_5xx_ratio_percent
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  metric_query {
    id          = "ratio"
    label       = "5xx ratio (%)"
    expression  = "IF(requests >= ${var.alarm_min_requests_per_minute}, 100 * (FILL(target5xx, 0) + FILL(elb5xx, 0)) / requests, 0)"
    return_data = true
  }

  metric_query {
    id = "requests"

    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }

  metric_query {
    id = "target5xx"

    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }

  metric_query {
    id = "elb5xx"

    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions  = { LoadBalancer = aws_lb.api.arn_suffix }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "api_p95_latency" {
  alarm_name          = "${local.name}-api-p95-latency"
  alarm_description   = "API p95 response time (ALB TargetResponseTime) above ${var.alarm_p95_latency_seconds}s in 3 of the last 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_p95_latency_seconds
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy_targets" {
  alarm_name          = "${local.name}-api-unhealthy-targets"
  alarm_description   = "At least one API task failed /health/ready for 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_no_healthy_targets" {
  alarm_name          = "${local.name}-api-no-healthy-targets"
  alarm_description   = "No healthy API task behind the ALB (site down)."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  actions_enabled     = var.start_services
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

# ===================================================================================================
# ECS services
# ===================================================================================================
locals {
  ecs_services = {
    api    = aws_ecs_service.api.name
    worker = aws_ecs_service.worker.name
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  for_each = local.ecs_services

  alarm_name          = "${local.name}-${each.key}-cpu"
  alarm_description   = "${each.key} service average CPU above ${var.alarm_ecs_cpu_percent}% for 10 minutes."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 10
  datapoints_to_alarm = 8
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_ecs_cpu_percent
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory" {
  for_each = local.ecs_services

  alarm_name          = "${local.name}-${each.key}-memory"
  alarm_description   = "${each.key} service average memory above ${var.alarm_ecs_memory_percent}% for 10 minutes."
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 10
  datapoints_to_alarm = 8
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_ecs_memory_percent
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = each.value
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_not_running" {
  count = var.enable_container_insights ? 1 : 0

  alarm_name          = "${local.name}-worker-not-running"
  alarm_description   = "No worker task running: background jobs (AI screening, notifications, payments, settlements) are not processed."
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  treat_missing_data  = "breaching"
  actions_enabled     = var.start_services
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.worker.name
  }
}

# Error / critical log lines (structlog JSON: {"level": "error", ...}).
resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  for_each = toset(["api", "worker"])

  name           = "${local.name}-${each.key}-error-logs"
  log_group_name = aws_cloudwatch_log_group.ecs[each.key].name
  pattern        = "{ ($.level = \"error\") || ($.level = \"critical\") }"

  metric_transformation {
    name          = "${each.key}_error_log_lines"
    namespace     = "HealIndia/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  for_each = toset(["api", "worker"])

  alarm_name          = "${local.name}-${each.key}-error-logs"
  alarm_description   = "${each.key} logged more than ${var.alarm_error_logs_per_5min} error/critical lines in 5 minutes."
  namespace           = "HealIndia/${var.environment}"
  metric_name         = "${each.key}_error_log_lines"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_error_logs_per_5min
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  depends_on = [aws_cloudwatch_log_metric_filter.app_errors]
}

# ===================================================================================================
# RDS
# ===================================================================================================
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-cpu"
  alarm_description   = "PostgreSQL CPU above ${var.alarm_rds_cpu_percent}% for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_rds_cpu_percent
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage" {
  alarm_name          = "${local.name}-rds-free-storage"
  alarm_description   = "PostgreSQL free storage below ${var.alarm_rds_free_storage_gb} GiB (storage autoscaling ceiling: ${var.rds_max_allocated_storage} GiB)."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "LessThanThreshold"
  threshold           = var.alarm_rds_free_storage_gb * 1024 * 1024 * 1024
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${local.name}-rds-connections"
  alarm_description   = "PostgreSQL connections above ${var.alarm_rds_connections} for 10 minutes (check pool sizing / leaks; consider RDS Proxy)."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_rds_connections
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

resource "aws_cloudwatch_metric_alarm" "rds_freeable_memory" {
  alarm_name          = "${local.name}-rds-freeable-memory"
  alarm_description   = "PostgreSQL freeable memory below ${var.alarm_rds_freeable_memory_mb} MiB for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "FreeableMemory"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "LessThanThreshold"
  threshold           = var.alarm_rds_freeable_memory_mb * 1024 * 1024
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

# ===================================================================================================
# Redis (per node; member ids follow <replication-group>-00N)
# ===================================================================================================
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  for_each = toset(local.redis_member_ids)

  alarm_name          = "${each.key}-memory"
  alarm_description   = "Redis memory usage above ${var.alarm_redis_memory_percent}% (allkeys-lru will evict cache and rate-limit keys)."
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.alarm_redis_memory_percent
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = { CacheClusterId = each.key }

  depends_on = [aws_elasticache_replication_group.redis]
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  for_each = toset(local.redis_member_ids)

  alarm_name          = "${each.key}-engine-cpu"
  alarm_description   = "Redis engine CPU above 80% for 10 minutes."
  namespace           = "AWS/ElastiCache"
  metric_name         = "EngineCPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions

  dimensions = { CacheClusterId = each.key }

  depends_on = [aws_elasticache_replication_group.redis]
}

# ===================================================================================================
# EventBridge: failed ECS deployments (circuit breaker rollbacks) and failed one-off tasks
# ===================================================================================================
resource "aws_cloudwatch_event_rule" "ecs_deployment_failed" {
  name        = "${local.name}-ecs-deployment-failed"
  description = "ECS deployment failed / rolled back for api or worker"

  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Deployment State Change"]
    resources     = [aws_ecs_service.api.id, aws_ecs_service.worker.id]
    detail = {
      eventName = ["SERVICE_DEPLOYMENT_FAILED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecs_deployment_failed" {
  rule = aws_cloudwatch_event_rule.ecs_deployment_failed.name
  arn  = aws_sns_topic.alerts.arn
}

resource "aws_cloudwatch_event_rule" "one_off_task_failed" {
  name        = "${local.name}-one-off-task-failed"
  description = "migrate or db-bootstrap task exited with a non-zero code"

  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Task State Change"]
    detail = {
      clusterArn = [aws_ecs_cluster.this.arn]
      lastStatus = ["STOPPED"]
      group      = ["family:${aws_ecs_task_definition.migrate.family}", "family:${aws_ecs_task_definition.db_bootstrap.family}"]
      containers = {
        exitCode = [{ "anything-but" = 0 }]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "one_off_task_failed" {
  rule = aws_cloudwatch_event_rule.one_off_task_failed.name
  arn  = aws_sns_topic.alerts.arn
}
