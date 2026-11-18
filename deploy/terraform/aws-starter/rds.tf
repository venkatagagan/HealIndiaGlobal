# RDS PostgreSQL 17, single-AZ (starter), gp3 + storage autoscaling, KMS, private subnets, TLS only,
# 7-day point-in-time recovery, deletion protection, Performance Insights (free tier: 7 days).
#
# Roles (mirrors infra/postgres/init/02-roles.sh; created by deploy/starter/db-bootstrap.sh over SSM):
#   master (db_master_username)    password generated, stored and rotated by RDS in Secrets Manager
#                                  (manage_master_user_password - never in Terraform state). Bootstrap/break-glass.
#   migrator (db_migrator_username) owns the schema; used only by `alembic upgrade head`.
#   app (db_app_username)          DML only; what api and worker connect as.

resource "aws_db_subnet_group" "this" {
  name        = "${local.name}-db"
  description = "Private subnets for ${local.name} PostgreSQL"
  subnet_ids  = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${local.name}-pg17-"
  family      = "postgres17"
  description = "${local.name} PostgreSQL 17 parameters"

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "pg_stat_statements.track"
    value = "top"
  }

  parameter {
    name  = "track_io_timing"
    value = "1"
  }

  # TLS only: the app connects with DATABASE_SSLMODE=require.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  # Same as the compose Postgres: abandoned transactions must not hold locks.
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/${local.name}-pg/postgresql"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
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

  storage_type          = "gp3"
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.main.arn

  db_name                       = var.rds_snapshot_identifier == null ? var.db_name : null
  username                      = var.rds_snapshot_identifier == null ? var.db_master_username : null
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.main.arn
  snapshot_identifier           = var.rds_snapshot_identifier
  port                          = 5432

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false
  network_type           = "IPV4"

  # Windows in UTC: backups 08:00-09:00 (03:00-04:00 US Eastern, 13:30 IST), maintenance Sunday 09:30-10:30.
  backup_retention_period  = var.rds_backup_retention_days
  backup_window            = "08:00-09:00"
  maintenance_window       = "sun:09:30-sun:10:30"
  copy_tags_to_snapshot    = true
  delete_automated_backups = false

  deletion_protection       = var.rds_deletion_protection
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-pg-final"

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.main.arn
  performance_insights_retention_period = 7
  monitoring_interval                   = 0
  enabled_cloudwatch_logs_exports       = ["postgresql"]

  apply_immediately = false

  tags = { Name = "${local.name}-pg" }

  depends_on = [aws_cloudwatch_log_group.rds]

  lifecycle {
    ignore_changes = [snapshot_identifier]
  }
}
