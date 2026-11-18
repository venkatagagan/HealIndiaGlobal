# ---------------------------------------------------------------------------------------------------
# Security groups
# ---------------------------------------------------------------------------------------------------
resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "Heal India Global box: HTTP/HTTPS from anywhere, no SSH (admin through SSM Session Manager)"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "app_http" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP (Let's Encrypt HTTP-01 challenges, redirect to HTTPS)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

# Outbound: images (ECR), AWS APIs, Let's Encrypt, Claude API, payment gateways, Whisper model download, RDS.
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "All outbound"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "PostgreSQL from the Heal India Global box only"
  vpc_id      = aws_vpc.this.id

  tags = { Name = "${local.name}-rds" }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_app" {
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL from the app box"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

# ---------------------------------------------------------------------------------------------------
# One customer-managed KMS key (USD 1/month) for EBS, RDS (+ Performance Insights), the documents bucket,
# Secrets Manager, the primary backup vault and the CloudWatch log groups. Annual automatic rotation.
# ---------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "EnableIamPoliciesForThisAccount"
    actions   = ["kms:*"]
    resources = ["*"]

    principals {
      type        = "AWS"
      identifiers = ["arn:${local.partition}:iam::${local.account_id}:root"]
    }
  }

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
}

resource "aws_kms_key" "main" {
  description             = "${local.name}: EBS, RDS, S3 documents, Secrets Manager, backups, logs"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}
