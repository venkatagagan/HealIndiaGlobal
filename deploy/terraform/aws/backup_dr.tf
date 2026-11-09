# Backups and disaster recovery
#
# Always (primary region):
#   * RDS automated backups + PITR (rds_backup_retention_days, default 14) - rds.tf
#   * AWS Backup plan: daily (35 days) and monthly (365 days) RDS snapshots in a KMS-encrypted vault
#   * S3 documents versioning (+ noncurrent version window) - s3.tf
# With enable_dr = true (dr_region, default ap-south-2 Hyderabad - stays in India):
#   * every AWS Backup snapshot is copied to a vault in the DR region
#   * documents bucket replicated (CRR) to a KMS-encrypted bucket in the DR region
#   * Secrets Manager secrets replicated (secrets.tf), ECR images replicated (below)

# ---------------------------------------------------------------------------------------------------
# AWS Backup
# ---------------------------------------------------------------------------------------------------
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
  ])

  role       = aws_iam_role.backup.name
  policy_arn = each.value
}

resource "aws_backup_vault" "primary" {
  name        = "${local.name}-vault"
  kms_key_arn = aws_kms_key.data.arn
}

resource "aws_backup_vault" "dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  name        = "${local.name}-dr-vault"
  kms_key_arn = aws_kms_key.dr[0].arn
}

resource "aws_backup_plan" "rds" {
  name = "${local.name}-rds"

  # 02:00 IST daily
  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(30 20 * * ? *)"
    start_window      = 60
    completion_window = 360

    lifecycle {
      delete_after = var.backup_daily_retention_days
    }

    dynamic "copy_action" {
      for_each = var.enable_dr ? [1] : []

      content {
        destination_vault_arn = aws_backup_vault.dr[0].arn

        lifecycle {
          delete_after = var.dr_backup_retention_days
        }
      }
    }
  }

  # 03:00 IST on the 1st of each month
  rule {
    rule_name         = "monthly"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = "cron(30 21 1 * ? *)"
    start_window      = 60
    completion_window = 720

    lifecycle {
      delete_after = var.backup_monthly_retention_days
    }

    dynamic "copy_action" {
      for_each = var.enable_dr ? [1] : []

      content {
        destination_vault_arn = aws_backup_vault.dr[0].arn

        lifecycle {
          delete_after = var.backup_monthly_retention_days
        }
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

# ---------------------------------------------------------------------------------------------------
# S3 documents cross-region replication
# ---------------------------------------------------------------------------------------------------
resource "aws_s3_bucket" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket = "${local.name}-documents-dr-${local.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket                  = aws_s3_bucket.documents_dr[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket = aws_s3_bucket.documents_dr[0].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket = aws_s3_bucket.documents_dr[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket = aws_s3_bucket.documents_dr[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.dr[0].arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket = aws_s3_bucket.documents_dr[0].id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.documents_noncurrent_expiration_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.documents_dr]
}

data "aws_iam_policy_document" "documents_dr_bucket" {
  count = var.enable_dr ? 1 : 0

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.documents_dr[0].arn, "${aws_s3_bucket.documents_dr[0].arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "documents_dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  bucket = aws_s3_bucket.documents_dr[0].id
  policy = data.aws_iam_policy_document.documents_dr_bucket[0].json

  depends_on = [aws_s3_bucket_public_access_block.documents_dr]
}

data "aws_iam_policy_document" "replication_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "documents_replication" {
  count = var.enable_dr ? 1 : 0

  name               = "${local.name}-documents-replication"
  assume_role_policy = data.aws_iam_policy_document.replication_assume.json
}

data "aws_iam_policy_document" "documents_replication" {
  count = var.enable_dr ? 1 : 0

  statement {
    sid       = "SourceBucket"
    actions   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }

  statement {
    sid = "SourceObjects"
    actions = [
      "s3:GetObjectVersionForReplication",
      "s3:GetObjectVersionAcl",
      "s3:GetObjectVersionTagging",
    ]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }

  statement {
    sid       = "DestinationObjects"
    actions   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
    resources = ["${aws_s3_bucket.documents_dr[0].arn}/*"]
  }

  statement {
    sid       = "DecryptSource"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.documents.arn]

    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["s3.${var.aws_region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "EncryptDestination"
    actions   = ["kms:Encrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.dr[0].arn]

    condition {
      test     = "StringLike"
      variable = "kms:ViaService"
      values   = ["s3.${var.dr_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "documents_replication" {
  count = var.enable_dr ? 1 : 0

  name   = "replicate-documents"
  role   = aws_iam_role.documents_replication[0].id
  policy = data.aws_iam_policy_document.documents_replication[0].json
}

resource "aws_s3_bucket_replication_configuration" "documents" {
  count = var.enable_dr ? 1 : 0

  bucket = aws_s3_bucket.documents.id
  role   = aws_iam_role.documents_replication[0].arn

  rule {
    id     = "documents-to-dr"
    status = "Enabled"

    filter {}

    delete_marker_replication {
      status = "Enabled"
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }

    destination {
      bucket        = aws_s3_bucket.documents_dr[0].arn
      storage_class = "STANDARD_IA"

      encryption_configuration {
        replica_kms_key_id = aws_kms_key.dr[0].arn
      }
    }
  }

  depends_on = [
    aws_s3_bucket_versioning.documents,
    aws_s3_bucket_versioning.documents_dr,
    aws_iam_role_policy.documents_replication,
  ]
}

# ---------------------------------------------------------------------------------------------------
# ECR replication (registry-wide setting: only one replication configuration exists per account/region)
# ---------------------------------------------------------------------------------------------------
resource "aws_ecr_replication_configuration" "this" {
  count = var.enable_dr ? 1 : 0

  replication_configuration {
    rule {
      destination {
        region      = var.dr_region
        registry_id = local.account_id
      }

      repository_filter {
        filter      = "${var.project}/${var.environment}/"
        filter_type = "PREFIX_MATCH"
      }
    }
  }
}
