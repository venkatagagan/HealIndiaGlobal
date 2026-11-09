# Primary region: everything that stores or processes patient data lives here.
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.default_tags
  }
}

# CloudFront viewer certificates and CLOUDFRONT-scope WAF web ACLs must be created in us-east-1.
# Nothing that stores patient data is created through this provider (WAF logs redact auth headers,
# cookies and query strings - see waf.tf).
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.default_tags
  }
}

# Disaster-recovery region. The default (ap-south-2, Hyderabad) keeps backup copies inside India.
# ap-south-2 is an opt-in region: enable it for the account before setting enable_dr = true.
# Credential/account checks are skipped so that plans work even when DR is disabled and the region is not
# enabled; the account id is always taken from the primary provider.
provider "aws" {
  alias  = "dr"
  region = var.dr_region

  skip_credentials_validation = true
  skip_requesting_account_id  = true

  default_tags {
    tags = local.default_tags
  }
}
