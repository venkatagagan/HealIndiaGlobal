# TLS certificates and (optional) Route 53 records.
#
#   CloudFront certificate (us-east-1): patient, agent, hospital, admin and api hostnames.
#   ALB certificate (primary region):   api_origin hostname (only CloudFront connects to it).
#
# With route53_zone_id set, validation records and A/AAAA aliases are managed here. Without it, either pass
# already-issued certificate ARNs, or apply once with -target on the aws_acm_certificate resources, create the
# validation CNAMEs shown in the dns_records_to_create output at your DNS provider, wait for ISSUED and then
# run the full apply (CloudFront and the ALB listener need issued certificates).

resource "aws_acm_certificate" "cloudfront" {
  count    = local.create_cloudfront_cert ? 1 : 0
  provider = aws.us_east_1

  domain_name               = local.hosts.patient
  subject_alternative_names = [local.hosts.agent, local.hosts.hospital, local.hosts.admin, local.hosts.api]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "alb" {
  count = local.create_alb_cert ? 1 : 0

  domain_name       = local.hosts.api_origin
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

locals {
  certificate_validation_options = concat(
    local.create_cloudfront_cert ? tolist(aws_acm_certificate.cloudfront[0].domain_validation_options) : [],
    local.create_alb_cert ? tolist(aws_acm_certificate.alb[0].domain_validation_options) : [],
  )
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in local.certificate_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    } if local.manage_dns
  }

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count    = local.create_cloudfront_cert && local.manage_dns ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [for host in local.cloudfront_cert_names : aws_route53_record.cert_validation[host].fqdn]
}

resource "aws_acm_certificate_validation" "alb" {
  count = local.create_alb_cert && local.manage_dns ? 1 : 0

  certificate_arn         = aws_acm_certificate.alb[0].arn
  validation_record_fqdns = [aws_route53_record.cert_validation[local.hosts.api_origin].fqdn]
}

# ---------------------------------------------------------------------------------------------------
# Alias records
# ---------------------------------------------------------------------------------------------------
locals {
  # host => CloudFront distribution serving it
  cloudfront_aliases = merge(
    { for k, app in local.spa_apps : app.host => {
      domain_name    = aws_cloudfront_distribution.spa[k].domain_name
      hosted_zone_id = aws_cloudfront_distribution.spa[k].hosted_zone_id
    } },
    {
      (local.hosts.api) = {
        domain_name    = aws_cloudfront_distribution.api.domain_name
        hosted_zone_id = aws_cloudfront_distribution.api.hosted_zone_id
      }
    },
  )

  cloudfront_alias_records = {
    for pair in setproduct(keys(local.cloudfront_aliases), ["A", "AAAA"]) : "${pair[0]}/${pair[1]}" => {
      host = pair[0]
      type = pair[1]
    } if local.manage_dns
  }
}

resource "aws_route53_record" "cloudfront_alias" {
  for_each = local.cloudfront_alias_records

  zone_id = var.route53_zone_id
  name    = each.value.host
  type    = each.value.type

  alias {
    name                   = local.cloudfront_aliases[each.value.host].domain_name
    zone_id                = local.cloudfront_aliases[each.value.host].hosted_zone_id
    evaluate_target_health = false
  }
}

# Origin hostname for CloudFront -> ALB (not meant for browsers; the ALB rejects requests without the header).
resource "aws_route53_record" "api_origin" {
  count = local.manage_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = local.hosts.api_origin
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
