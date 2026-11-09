# Customer-managed KMS keys (annual automatic rotation). Separate keys limit the blast radius and make
# key-usage audit trails (CloudTrail) meaningful:
#   data      RDS storage + Performance Insights, ElastiCache at rest, AWS Backup vault
#   documents S3 documents bucket (passports, medical reports)
#   secrets   Secrets Manager (application secrets + the RDS-managed master password)
#   logs      CloudWatch Logs groups and the alerts SNS topic

data "aws_iam_policy_document" "kms_account_root" {
  statement {
    sid       = "EnableIamPoliciesForThisAccount"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }
}

resource "aws_kms_key" "data" {
  description             = "${local.name}: RDS, ElastiCache and backups"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms_account_root.json
}

resource "aws_kms_alias" "data" {
  name          = "alias/${local.name}-data"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_kms_key" "documents" {
  description             = "${local.name}: S3 documents bucket"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms_account_root.json
}

resource "aws_kms_alias" "documents" {
  name          = "alias/${local.name}-documents"
  target_key_id = aws_kms_key.documents.key_id
}

resource "aws_kms_key" "secrets" {
  description             = "${local.name}: Secrets Manager"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms_account_root.json
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.name}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

data "aws_iam_policy_document" "kms_logs" {
  source_policy_documents = [data.aws_iam_policy_document.kms_account_root.json]

  statement {
    sid = "AllowCloudWatchLogs"
    actions = [
      "kms:Encrypt*",
      "kms:Decrypt*",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:Describe*",
    ]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }

    condition {
      test     = "ArnLike"
      variable = "kms:EncryptionContext:aws:logs:arn"
      values   = ["arn:${local.partition}:logs:${var.aws_region}:${local.account_id}:log-group:*"]
    }
  }

  # CloudWatch alarms and EventBridge publish to the KMS-encrypted alerts topic.
  statement {
    sid       = "AllowAlarmAndEventPublishing"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "logs" {
  description             = "${local.name}: CloudWatch Logs and SNS alerts"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms_logs.json
}

resource "aws_kms_alias" "logs" {
  name          = "alias/${local.name}-logs"
  target_key_id = aws_kms_key.logs.key_id
}

# DR region key (backup vault copies, S3 replicas, secret replicas).
resource "aws_kms_key" "dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  description             = "${local.name}: disaster-recovery copies (${var.dr_region})"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms_account_root.json
}

resource "aws_kms_alias" "dr" {
  count    = var.enable_dr ? 1 : 0
  provider = aws.dr

  name          = "alias/${local.name}-dr"
  target_key_id = aws_kms_key.dr[0].key_id
}
