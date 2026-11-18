# Primary region: everything that stores or processes personal data (EC2, RDS, S3, Secrets Manager, SES, SNS).
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.default_tags
  }
}

# Backup copy region (AWS Backup vault for cross-region copies of the EC2/EBS, RDS and S3 recovery points).
provider "aws" {
  alias  = "dr"
  region = var.dr_region

  default_tags {
    tags = local.default_tags
  }
}

# Route 53 health checks publish their metrics only in us-east-1, so the health-check alarm and the SNS topic it
# notifies live there. No personal data is stored through this provider.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.default_tags
  }
}
