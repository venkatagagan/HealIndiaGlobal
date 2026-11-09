# Least-privilege IAM for ECS.
#
# Execution roles (used by the ECS agent to pull images, write logs and resolve secrets), one per task family
# so each family can read only the secrets it receives:
#   app          api + worker: all application secrets
#   migrate      DATABASE_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY
#   db-bootstrap RDS-managed master secret + DB_APP_CREDENTIALS
# Task roles (used by the application code):
#   api, worker  documents bucket (object read/write/delete, list) + documents KMS key via S3 only
#   migrate / db-bootstrap have no task role (no AWS API calls).

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${local.partition}:ecs:${var.aws_region}:${local.account_id}:*"]
    }
  }
}

# ---------------------------------------------------------------------------------------------------
# Execution roles
# ---------------------------------------------------------------------------------------------------
locals {
  execution_role_secrets = {
    "app"     = values(local.app_secret_arns)
    "migrate" = values(local.migrate_secret_arns)
    "db-bootstrap" = [
      aws_secretsmanager_secret.generated["DB_APP_CREDENTIALS"].arn,
      aws_db_instance.postgres.master_user_secret[0].secret_arn,
    ]
  }
}

resource "aws_iam_role" "execution" {
  for_each = toset(["app", "migrate", "db-bootstrap"])

  name               = "${local.name}-${each.key}-exec"
  description        = "ECS task execution role (${each.key})"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  for_each = aws_iam_role.execution

  role       = each.value.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  for_each = toset(["app", "migrate", "db-bootstrap"])

  statement {
    sid       = "ReadInjectedSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = local.execution_role_secrets[each.key]
  }

  statement {
    sid       = "DecryptInjectedSecrets"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.secrets.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  for_each = toset(["app", "migrate", "db-bootstrap"])

  name   = "read-injected-secrets"
  role   = aws_iam_role.execution[each.key].id
  policy = data.aws_iam_policy_document.execution_secrets[each.key].json
}

# ---------------------------------------------------------------------------------------------------
# Task roles (application permissions)
# ---------------------------------------------------------------------------------------------------
resource "aws_iam_role" "task" {
  for_each = toset(["api", "worker"])

  name               = "${local.name}-${each.key}-task"
  description        = "Heal India Global ${each.key} task role"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "task_app" {
  statement {
    sid       = "DocumentsBucketList"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.documents.arn]
  }

  statement {
    sid = "DocumentsObjects"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
    ]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }

  statement {
    sid       = "DocumentsKmsViaS3"
    actions   = ["kms:GenerateDataKey", "kms:Decrypt"]
    resources = [aws_kms_key.documents.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["s3.${var.aws_region}.amazonaws.com"]
    }
  }

  dynamic "statement" {
    for_each = var.enable_ecs_exec ? [1] : []

    content {
      sid = "EcsExecSessionChannels"
      actions = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "task_app" {
  for_each = aws_iam_role.task

  name   = "documents-bucket"
  role   = each.value.id
  policy = data.aws_iam_policy_document.task_app.json
}
