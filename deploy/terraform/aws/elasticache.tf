# ElastiCache Redis OSS 7 - cache, rate-limit counters and WebSocket fan-out (pub/sub). Not a system of
# record (jobs live in PostgreSQL), so allkeys-lru eviction is safe. TLS in transit + AUTH token, KMS at rest.
# The app connects with REDIS_URL=rediss://:<token>@<primary endpoint>:6379/0 (secrets.tf).

resource "aws_elasticache_subnet_group" "this" {
  name        = "${local.name}-redis"
  description = "Isolated subnets for ${local.name} Redis"
  subnet_ids  = [for s in aws_subnet.isolated : s.id]
}

resource "aws_elasticache_parameter_group" "redis" {
  name        = "${local.name}-redis7"
  family      = "redis7"
  description = "${local.name} Redis 7 parameters"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
}

resource "aws_cloudwatch_log_group" "redis_slow" {
  name              = "/aws/elasticache/${local.name}-redis/slow-log"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name}-redis"
  description          = "${local.name} Redis (cache, rate limits, realtime fan-out)"

  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  num_cache_clusters         = var.redis_num_cache_clusters
  automatic_failover_enabled = var.redis_num_cache_clusters > 1
  multi_az_enabled           = var.redis_num_cache_clusters > 1

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.data.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  snapshot_retention_limit   = var.redis_snapshot_retention_days
  snapshot_window            = "18:00-19:00"
  maintenance_window         = "sun:22:30-sun:23:30"
  auto_minor_version_upgrade = true
  apply_immediately          = false

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  tags = { Name = "${local.name}-redis" }
}

locals {
  # Member cluster ids follow the <replication-group-id>-00N convention (used for per-node alarms).
  redis_member_ids = [for i in range(1, var.redis_num_cache_clusters + 1) : format("%s-redis-%03d", local.name, i)]
}
