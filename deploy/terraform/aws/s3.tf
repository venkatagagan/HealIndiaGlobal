# S3 buckets
#   documents  private, SSE-KMS (bucket key), versioned, lifecycle, access-logged. Read/written only by the
#              API/worker task roles; files are served through the API's authorised download endpoint.
#   spa-*      one private bucket per SPA, read by CloudFront through Origin Access Control (OAC).
#   logs       ALB access logs and S3 server access logs (SSE-S3: required by both log delivery services).

locals {
  documents_bucket_name = "${local.name}-documents-${local.account_id}"
  logs_bucket_name      = "${local.name}-logs-${local.account_id}"
}

data "aws_elb_service_account" "this" {}

# ===================================================================================================
# Logs bucket
# ===================================================================================================
resource "aws_s3_bucket" "logs" {
  bucket = local.logs_bucket_name
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.access_logs_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "logs_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]

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

  # ALB access logs (regional Elastic Load Balancing account for the primary region).
  statement {
    sid       = "AllowAlbAccessLogs"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/alb/AWSLogs/${local.account_id}/*"]

    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.this.arn]
    }
  }

  # S3 server access logs for the documents bucket.
  statement {
    sid       = "AllowS3ServerAccessLogs"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.logs.arn}/s3/*"]

    principals {
      type        = "Service"
      identifiers = ["logging.s3.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [aws_s3_bucket.documents.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = data.aws_iam_policy_document.logs_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.logs]
}

# ===================================================================================================
# Documents bucket (patient documents, KYC files, invoices)
# ===================================================================================================
resource "aws_s3_bucket" "documents" {
  bucket = local.documents_bucket_name

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Default encryption is SSE-KMS with the documents key. NOTE: the backend currently sends
# ServerSideEncryption=AES256 on PutObject (app/core/storage.py), which overrides this default with SSE-S3;
# drop that header (or send aws:kms) in the app to get KMS-encrypted objects. The task role already has the
# KMS permissions needed for both.
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.documents.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Deleted/overwritten documents stay recoverable for the noncurrent window, then are purged (retention
  # schedule: deletion must eventually remove the data).
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.documents_noncurrent_expiration_days
    }
  }

  rule {
    id     = "remove-expired-delete-markers"
    status = "Enabled"

    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }

  dynamic "rule" {
    for_each = var.documents_ia_transition_days > 0 || var.documents_glacier_ir_transition_days > 0 ? [1] : []

    content {
      id     = "storage-tiering"
      status = "Enabled"

      filter {}

      dynamic "transition" {
        for_each = var.documents_ia_transition_days > 0 ? [var.documents_ia_transition_days] : []

        content {
          days          = transition.value
          storage_class = "STANDARD_IA"
        }
      }

      dynamic "transition" {
        for_each = var.documents_glacier_ir_transition_days > 0 ? [var.documents_glacier_ir_transition_days] : []

        content {
          days          = transition.value
          storage_class = "GLACIER_IR"
        }
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.documents]
}

resource "aws_s3_bucket_logging" "documents" {
  bucket        = aws_s3_bucket.documents.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3/documents/"

  depends_on = [aws_s3_bucket_policy.logs]
}

data "aws_iam_policy_document" "documents_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"]

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

  # Objects may only be written with SSE-S3 or SSE-KMS (never unencrypted or with customer-provided keys).
  statement {
    sid       = "DenyUnsupportedEncryption"
    effect    = "Deny"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.documents.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Null"
      variable = "s3:x-amz-server-side-encryption-customer-algorithm"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = data.aws_iam_policy_document.documents_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.documents]
}

# ===================================================================================================
# SPA buckets (static assets for the four web apps)
# ===================================================================================================
resource "aws_s3_bucket" "spa" {
  for_each = local.spa_apps

  bucket        = "${local.name}-web-${each.key}-${local.account_id}"
  force_destroy = true # build artefacts only; re-published from CI
}

resource "aws_s3_bucket_public_access_block" "spa" {
  for_each = aws_s3_bucket.spa

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "spa" {
  for_each = aws_s3_bucket.spa

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "spa" {
  for_each = aws_s3_bucket.spa

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled" # roll back a bad publish by restoring the previous index.html version
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "spa" {
  for_each = aws_s3_bucket.spa

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "spa" {
  for_each = aws_s3_bucket.spa

  bucket = each.value.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }

  depends_on = [aws_s3_bucket_versioning.spa]
}

data "aws_iam_policy_document" "spa_bucket" {
  for_each = local.spa_apps

  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.spa[each.key].arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.spa[each.key].arn]
    }
  }

  # ListBucket lets S3 answer 404 (instead of 403) for missing files such as stale /assets/*.js.
  statement {
    sid       = "AllowCloudFrontList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.spa[each.key].arn]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.spa[each.key].arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.spa[each.key].arn, "${aws_s3_bucket.spa[each.key].arn}/*"]

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

resource "aws_s3_bucket_policy" "spa" {
  for_each = local.spa_apps

  bucket = aws_s3_bucket.spa[each.key].id
  policy = data.aws_iam_policy_document.spa_bucket[each.key].json

  depends_on = [aws_s3_bucket_public_access_block.spa]
}
