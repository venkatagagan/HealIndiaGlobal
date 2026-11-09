# Heal India Global - AWS reference deployment (ap-south-1 / Mumbai, India data residency).
#
# One root module, one state per environment:
#   terraform init -backend-config=backend-production.hcl     (see backend.tf.example / backend.hcl.example)
#   terraform apply -var-file=production.tfvars -var="image_tag=<git sha>"
#
# Files: network.tf (VPC) · security_groups.tf · kms.tf · s3.tf · rds.tf · elasticache.tf · secrets.tf · ecr.tf
#        iam.tf · ecs.tf · alb.tf · acm_dns.tf · cloudfront.tf · waf.tf · monitoring.tf · backup_dr.tf · outputs.tf

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
