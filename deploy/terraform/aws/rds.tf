# RDS PostgreSQL 17 - Multi-AZ, KMS-encrypted, isolated subnets, PITR (14 days), deletion protection.
#
# Credentials:
#   * master user (var.db_master_username): password generated, stored and rotated by RDS in Secrets Manager
#     (manage_master_user_password). Used only by the one-off db-bootstrap task and for break-glass access.
#   * application role (var.db_app_username): owner of the application database, NOT rds_superuser. Created /
#     re-keyed by the db-bootstrap task (ecs.tf) from the DB_APP_CREDENTIALS secret; DATABASE_URL uses it.

resource "aws_db_subnet_group" "this" {
  name        = "${local.name}-db"
  description = "Isolated subnets for ${local.name} PostgreSQL"
  subnet_ids  = [for s in aws_subnet.isolated : s.id]
}

resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${local.name}-pg17-"
  family      = "postgres17"
  description = "${local.name} PostgreSQL 17 parameters"

  # Query statistics (CREATE EXTENSION pg_stat_statements is done by the db-bootstrap task).
  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "pg_stat_statements.max"
    value        = "10000"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "all"
  }

  parameter {
    name  = "track_io_timing"
    value = "1"
  }

  # TLS only (DATABASE_URL uses ?ssl=require).
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Slow statements, lock waits and large temp files go to the PostgreSQL log (exported to CloudWatch).
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "log_temp_files"
    value = "10240"
  }

  # Protect the pool from abandoned transactions (matches the docker-compose configuration).
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Enhanced Monitoring (OS-level metrics every 60 s).
data "aws_iam_policy_document" "rds_monitoring_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_monitoring" {
  name               = "${local.name}-rds-monitoring"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume.json
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Pre-create the exported log groups so retention and encryption are under our control.
resource "aws_cloudwatch_log_group" "rds" {
  for_each = toset(["postgresql", "upgrade"])

  name              = "/aws/rds/instance/${local.name}-pg/${each.key}"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.name}-pg"

  engine                      = "postgres"
  engine_version              = var.rds_engine_version
  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  instance_class              = var.rds_instance_class
  parameter_group_name        = aws_db_parameter_group.postgres.name
  ca_cert_identifier          = "rds-ca-rsa2048-g1"

  # Storage
  storage_type          = "gp3"
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.data.arn

  # Database and master credentials (RDS-managed secret, rotated by RDS)
  db_name                       = var.rds_snapshot_identifier == null ? var.db_name : null
  username                      = var.rds_snapshot_identifier == null ? var.db_master_username : null
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.secrets.arn
  snapshot_identifier           = var.rds_snapshot_identifier
  port                          = 5432

  # Network: isolated subnets, never public
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.rds_multi_az
  network_type           = "IPV4"

  # Backups / PITR. Windows in UTC: backups 01:00-02:00 IST, maintenance Monday 02:30-03:30 IST.
  backup_retention_period  = var.rds_backup_retention_days
  backup_window            = "19:30-20:30"
  maintenance_window       = "sun:21:00-sun:22:00"
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  deletion_protection       = var.rds_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-pg-final"

  # Observability
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.data.arn
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  apply_immediately = var.rds_apply_immediately

  tags = { Name = "${local.name}-pg" }

  depends_on = [
    aws_cloudwatch_log_group.rds,
    aws_iam_role_policy_attachment.rds_monitoring,
  ]

  lifecycle {
    ignore_changes = [
      # Restores: keep the instance when the snapshot variable is cleared afterwards.
      snapshot_identifier,
    ]
  }
}
