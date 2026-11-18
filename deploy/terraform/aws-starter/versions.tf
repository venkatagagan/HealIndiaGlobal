# Heal India Global - AWS STARTER deployment (one EC2 box + RDS), US East (Ohio) us-east-2, backups copied to
# US West (Oregon) us-west-2. Target budget: about USD 150 / month. Runbook: deploy/starter/README.md.
#
#   terraform init                                   # or with the remote state of backend.tf.example
#   terraform plan  -var-file=terraform.tfvars
#   terraform apply -var-file=terraform.tfvars
#
# Files: network.tf (VPC, 2 public + 2 private subnets, no NAT) · security.tf (security groups, KMS) ·
#        ec2.tf (the box, EIP, instance role, SSM documents) · rds.tf · storage.tf (S3, ECR) · secrets.tf ·
#        dns_email.tf (Route 53, SES, SNS SMS) · backup.tf · monitoring.tf (alarms, health check, budget) ·
#        github.tf (OIDC deploy role) · outputs.tf
#
# The full-scale stack (ECS Fargate, Multi-AZ RDS, ElastiCache, CloudFront, WAF) is deploy/terraform/aws; see
# "Upgrade path" in deploy/starter/README.md.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }
}
