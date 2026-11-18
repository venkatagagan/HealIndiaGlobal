# Backups (us-east-2) with cross-region copies to dr_region (us-west-2):
#
#   what                         schedule (UTC)          kept here / in us-west-2
#   EC2 box (AMI + EBS snapshot)  daily 07:00             backup_daily_retention_days (7) / same
#                                 weekly Sunday 07:30     backup_weekly_retention_days (28) / same
#   S3 documents bucket          daily + weekly (same)   same as EC2 (backup_documents_bucket = true)
#   RDS PostgreSQL               automated backups + PITR, rds_backup_retention_days (7) - rds.tf
#                                 weekly Sunday 09:30     backup_weekly_retention_days (28) / same
#
# The box holds no data that is not rebuildable except the Redis cache, the certificates and the Whisper model:
# its backups make a restore fast, the database and the documents are what matter.

data "aws_iam_policy_document" "backup_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${local.name}-backup"
  assume_role_policy = data.aws_iam_policy_document.backup_assume.json
}

resource "aws_iam_role_policy_attachment" "backup" {
  for_each = toset([
    "arn:${local.partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup",
    "arn:${local.partition}:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores",
    "arn:${local.partition}:iam::aws:policy/AWSBackupServiceRolePolicyForS3Backup",
    "arn:${local.partition}:iam::aws:policy/AWSBackupServiceRolePolicyForS3Restore",
  ])

  role       = aws_iam_role.backup.name
  policy_arn = each.value
}

# The EBS volume, RDS instance and documents are encrypted with the customer-managed key: let AWS Backup use
# it for snapshots, copies and restores.
data "aws_iam_policy_document" "backup_kms" {
  statement {
    actions = [
      "kms:Decrypt",
      "kms:Encrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey",
      "kms:CreateGrant",
    ]
    resources = [aws_kms_key.main.arn]
  }
}

resource "aws_iam_role_policy" "backup_kms" {
  name   = "use-main-key"
  role   = aws_iam_role.backup.id
  policy = data.aws_iam_policy_document.backup_kms.json
}

resource "aws_backup_vault" "primary" {
  name        = "${local.name}-vault"
  kms_key_arn = aws_kms_key.main.arn
}

# Copies in us-west-2 are encrypted with that region's AWS-managed backup key (no extra KMS key to pay for).
resource "aws_backup_vault" "dr" {
  provider = aws.dr

  name = "${local.name}-dr-vault"
}

locals {
  backup_daily_resources = concat(
    [aws_instance.app.arn],
    var.backup_documents_bucket ? [aws_s3_bucket.documents.arn] : [],
  )
}

resource "aws_backup_plan" "box" {
  name = "${local.name}-box"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(0 7 * * ? *)"
    start_window      = 60
    completion_window = 480

    lifecycle {
      delete_after = var.backup_daily_retention_days
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn

      lifecycle {
        delete_after = var.backup_daily_retention_days
      }
    }
  }

  rule {
    rule_name         = "weekly"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(30 7 ? * SUN *)"
    start_window      = 60
    completion_window = 480

    lifecycle {
      delete_after = var.backup_weekly_retention_days
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn

      lifecycle {
        delete_after = var.backup_weekly_retention_days
      }
    }
  }
}

resource "aws_backup_selection" "box" {
  name         = "${local.name}-box"
  plan_id      = aws_backup_plan.box.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = local.backup_daily_resources

  depends_on = [aws_iam_role_policy_attachment.backup]
}

# Weekly RDS snapshot (after the 08:00-09:00 automated backup window) copied to us-west-2. Daily recovery is
# RDS point-in-time recovery (7 days).
resource "aws_backup_plan" "rds" {
  name = "${local.name}-rds-weekly"

  rule {
    rule_name         = "weekly"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(30 9 ? * SUN *)"
    start_window      = 60
    completion_window = 600

    lifecycle {
      delete_after = var.backup_weekly_retention_days
    }

    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn

      lifecycle {
        delete_after = var.backup_weekly_retention_days
      }
    }
  }
}

resource "aws_backup_selection" "rds" {
  name         = "${local.name}-rds"
  plan_id      = aws_backup_plan.rds.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = [aws_db_instance.postgres.arn]

  depends_on = [aws_iam_role_policy_attachment.backup]
}
