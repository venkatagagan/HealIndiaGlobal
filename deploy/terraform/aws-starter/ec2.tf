# The application box: Amazon Linux 2023 (ARM64) on Graviton, Docker Compose stack of infra/docker-compose.yml
# + infra/docker-compose.aws.yml (edge nginx with Let's Encrypt, api, worker with local Whisper, website, the
# four SPAs, Redis). PostgreSQL is RDS. No SSH: admin through SSM Session Manager.

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# ---------------------------------------------------------------------------------------------------
# Instance role
# ---------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${local.name}-app"
  description        = "Heal India Global ${var.environment} EC2 box"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

resource "aws_iam_role_policy_attachment" "app_managed" {
  for_each = toset([
    "arn:${local.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore",
    "arn:${local.partition}:iam::aws:policy/CloudWatchAgentServerPolicy",
  ])

  role       = aws_iam_role.app.name
  policy_arn = each.value
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.this : r.arn]
  }

  statement {
    sid       = "DocumentsList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.documents.arn]
  }

  statement {
    sid       = "DocumentsObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]
  }

  statement {
    sid       = "DeployBundles"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/bundles/*"]
  }

  statement {
    sid       = "KmsForS3AndSecrets"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [aws_kms_key.main.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values = [
        "s3.${var.aws_region}.amazonaws.com",
        "secretsmanager.${var.aws_region}.amazonaws.com",
      ]
    }
  }

  statement {
    sid     = "ReadAppSecrets"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      aws_secretsmanager_secret.generated.arn,
      aws_secretsmanager_secret.third_party.arn,
    ]
  }

  statement {
    sid       = "ReadRuntimeConfig"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.config.arn]
  }

  statement {
    sid       = "SendEmail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_sesv2_email_identity.domain.arn, aws_sesv2_configuration_set.this.arn]
  }

  # Container logs (the CloudWatch agent tails Docker's json logs) - CloudWatchAgentServerPolicy covers
  # PutLogEvents; nothing else needed.

  dynamic "statement" {
    for_each = var.enable_sms ? [1] : []

    content {
      sid       = "SmsToPhoneNumbers"
      actions   = ["sns:Publish"]
      resources = ["*"]

      # Publishing straight to a phone number has no resource ARN to scope to.
    }
  }

  # ---- first-deploy only (bootstrap_mode) --------------------------------------------------------------
  dynamic "statement" {
    for_each = var.bootstrap_mode ? [1] : []

    content {
      sid       = "BootstrapWriteGeneratedSecrets"
      actions   = ["secretsmanager:PutSecretValue"]
      resources = [aws_secretsmanager_secret.generated.arn]
    }
  }

  dynamic "statement" {
    for_each = var.bootstrap_mode ? [1] : []

    content {
      sid       = "BootstrapReadMasterSecret"
      actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      resources = [aws_db_instance.postgres.master_user_secret[0].secret_arn]
    }
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name}-app"
  role = aws_iam_role.app.name
}

# ---------------------------------------------------------------------------------------------------
# CloudWatch agent: memory / disk / swap metrics (rolled up per InstanceId for the alarms) + logs
# ---------------------------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "system" {
  name              = local.log_group_system
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_cloudwatch_log_group" "containers" {
  count = var.ship_container_logs ? 1 : 0

  name              = local.log_group_containers
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn
}

locals {
  cloudwatch_agent_config = {
    agent = {
      metrics_collection_interval = 60
      run_as_user                 = "root"
    }
    metrics = {
      namespace         = "CWAgent"
      append_dimensions = { InstanceId = "$${aws:InstanceId}" }
      # The alarms use the InstanceId-only roll-up (no device / fstype dimensions to match).
      aggregation_dimensions = [["InstanceId"]]
      metrics_collected = {
        mem  = { measurement = ["mem_used_percent"] }
        swap = { measurement = ["swap_used_percent"] }
        disk = {
          measurement = ["used_percent"]
          resources   = ["/"]
          drop_device = true
        }
      }
    }
    logs = {
      logs_collected = {
        files = {
          collect_list = concat(
            [
              { file_path = "/var/log/hig-deploy.log", log_group_name = local.log_group_system, log_stream_name = "{instance_id}/deploy" },
              { file_path = "/var/log/hig-bootstrap.log", log_group_name = local.log_group_system, log_stream_name = "{instance_id}/bootstrap" },
              { file_path = "/var/log/cloud-init-output.log", log_group_name = local.log_group_system, log_stream_name = "{instance_id}/cloud-init" },
            ],
            var.ship_container_logs ? [
              { file_path = "/var/lib/docker/containers/*/*-json.log", log_group_name = local.log_group_containers, log_stream_name = "{instance_id}/docker" },
            ] : [],
          )
        }
      }
    }
  }

  user_data = templatefile("${path.module}/../../starter/user-data.sh.tftpl", {
    region                  = var.aws_region
    name                    = local.name
    config_parameter        = local.config_parameter_name
    compose_version         = var.compose_version
    compose_sha256          = var.compose_sha256
    swap_gb                 = var.swap_gb
    cloudwatch_agent_config = jsonencode(local.cloudwatch_agent_config)
  })
}

# ---------------------------------------------------------------------------------------------------
# The instance
# ---------------------------------------------------------------------------------------------------
resource "aws_instance" "app" {
  ami                     = nonsensitive(data.aws_ssm_parameter.al2023_arm64.value)
  instance_type           = var.instance_type
  subnet_id               = aws_subnet.public[0].id
  vpc_security_group_ids  = [aws_security_group.app.id]
  iam_instance_profile    = aws_iam_instance_profile.app.name
  monitoring              = false
  disable_api_termination = var.instance_termination_protection
  ebs_optimized           = true
  user_data               = local.user_data

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 only
    # 2 hops: containers on the Docker bridge reach the instance role (boto3 for S3, SES, SNS).
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_gb
    encrypted             = true
    kms_key_id            = aws_kms_key.main.arn
    delete_on_termination = true

    tags = { Name = "${local.name}-root" }
  }

  credit_specification {
    cpu_credits = "unlimited"
  }

  tags = {
    Name             = "${local.name}-app"
    "hig:role"       = local.instance_role_tag
    "hig:deployment" = local.name
  }

  lifecycle {
    # A newer AMI or an edited bootstrap script must not replace / restart the running box. Patch with
    # `dnf upgrade --releasever=latest` over SSM; rebuild deliberately with `terraform apply -replace`.
    ignore_changes = [ami, user_data]
  }

  depends_on = [aws_iam_role_policy.app]
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = "${local.name}-app" }
}

# ---------------------------------------------------------------------------------------------------
# SSM documents: the only commands the GitHub deploy role may run on the box (fixed script, validated tag)
# ---------------------------------------------------------------------------------------------------
resource "aws_ssm_document" "deploy" {
  name            = "${local.name}-deploy"
  document_type   = "Command"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy an image tag of Heal India Global on the box (deploy/starter/deploy.sh)"
    parameters = {
      ImageTag = {
        type           = "String"
        description    = "Image tag (git SHA) pushed to ECR together with its deploy bundle"
        allowedPattern = "^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$"
      }
    }
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "deploy"
        inputs = {
          timeoutSeconds = "3600"
          runCommand     = ["/usr/local/bin/hig-deploy '{{ ImageTag }}'"]
        }
      },
    ]
  })
}

resource "aws_ssm_document" "certs" {
  name            = "${local.name}-certs"
  document_type   = "Command"
  document_format = "JSON"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Obtain / renew the Let's Encrypt certificate and reload the edge (deploy/starter/certs.sh)"
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "certs"
        inputs = {
          timeoutSeconds = "600"
          runCommand     = ["/opt/hig/current/deploy/starter/certs.sh"]
        }
      },
    ]
  })
}
