# One-time bootstrap of the Terraform remote state backend (run once per AWS account, with local state):
#
#   cd deploy/terraform/aws/bootstrap
#   terraform init && terraform apply
#
# Creates a versioned, KMS-encrypted, private S3 bucket for state files and a DynamoDB table for state
# locking. Keep this module's own terraform.tfstate somewhere safe (or `terraform state push` it into the new
# bucket under a separate key after the first apply).

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}

variable "aws_region" {
  description = "Region for the state bucket and lock table."
  type        = string
  default     = "ap-south-1"
}

variable "state_bucket_name" {
  description = "State bucket name. Empty = hig-terraform-state-<account id>."
  type        = string
  default     = ""
}

variable "lock_table_name" {
  description = "DynamoDB lock table name."
  type        = string
  default     = "hig-terraform-locks"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "heal-india-global"
      ManagedBy = "terraform"
      Stack     = "deploy/terraform/aws/bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  bucket_name = coalesce(var.state_bucket_name, "hig-terraform-state-${data.aws_caller_identity.current.account_id}")
}

resource "aws_kms_key" "state" {
  description             = "Terraform state encryption (Heal India Global)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}

resource "aws_kms_alias" "state" {
  name          = "alias/hig-terraform-state"
  target_key_id = aws_kms_key.state.key_id
}

resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 180
    }
  }

  depends_on = [aws_s3_bucket_versioning.state]
}

data "aws_iam_policy_document" "state_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]

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

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.state]
}

resource "aws_dynamodb_table" "locks" {
  name                        = var.lock_table_name
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "LockID"
  deletion_protection_enabled = true

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.state.arn
  }
}

output "state_bucket" {
  description = "bucket = ... in backend-<env>.hcl"
  value       = aws_s3_bucket.state.bucket
}

output "lock_table" {
  description = "dynamodb_table = ... in backend-<env>.hcl"
  value       = aws_dynamodb_table.locks.name
}

output "state_kms_key_arn" {
  description = "kms_key_id = ... in backend-<env>.hcl"
  value       = aws_kms_key.state.arn
}
