# ===================================================================================================
# Route 53: the existing public zone of domain_name (looked up by name) or a new one (create_hosted_zone).
#   <domain>        A -> Elastic IP   website, portals (/app/ /agent/ /hospital/) and the API (/api/)
#   ops.<domain>    A -> Elastic IP   staff console (SEC-022: own origin)
#   SES: 3 DKIM CNAMEs, MAIL FROM MX + SPF on mail.<domain>, _dmarc TXT
# Existing records for the mailbox provider (apex MX/SPF of contact@<domain>) are never touched.
# ===================================================================================================
resource "aws_route53_zone" "this" {
  count = var.manage_dns && var.create_hosted_zone ? 1 : 0

  name    = var.domain_name
  comment = "Heal India Global (${var.environment})"
}

data "aws_route53_zone" "existing" {
  count = var.manage_dns && !var.create_hosted_zone ? 1 : 0

  zone_id      = var.route53_zone_id != "" ? var.route53_zone_id : null
  name         = var.route53_zone_id == "" ? var.domain_name : null
  private_zone = false
}

locals {
  zone_id = !var.manage_dns ? null : (
    var.create_hosted_zone ? aws_route53_zone.this[0].zone_id : data.aws_route53_zone.existing[0].zone_id
  )

  dkim_tokens = aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens

  dmarc_value = "v=DMARC1; p=${var.dmarc_policy}; rua=mailto:${var.alert_email}; adkim=r; aspf=r; pct=100"

  # Everything that must exist in DNS (also the output dns_records_to_create when DNS is hosted elsewhere).
  dns_records = concat(
    [
      { name = local.site_host, type = "A", value = aws_eip.app.public_ip, purpose = "website, portals, API" },
      { name = local.staff_host, type = "A", value = aws_eip.app.public_ip, purpose = "staff console" },
      { name = local.mail_from_domain, type = "MX", value = "10 feedback-smtp.${var.aws_region}.amazonses.com", purpose = "SES MAIL FROM" },
      { name = local.mail_from_domain, type = "TXT", value = "v=spf1 include:amazonses.com ~all", purpose = "SES MAIL FROM SPF" },
    ],
    [for i in range(3) : {
      name    = "${local.dkim_tokens[i]}._domainkey.${var.domain_name}"
      type    = "CNAME"
      value   = "${local.dkim_tokens[i]}.dkim.amazonses.com"
      purpose = "SES DKIM"
    }],
    var.create_dmarc_record ? [
      { name = "_dmarc.${var.domain_name}", type = "TXT", value = local.dmarc_value, purpose = "DMARC" },
    ] : [],
  )
}

resource "aws_route53_record" "site" {
  count = var.manage_dns ? 1 : 0

  zone_id = local.zone_id
  name    = local.site_host
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_record" "staff" {
  count = var.manage_dns ? 1 : 0

  zone_id = local.zone_id
  name    = local.staff_host
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

# ===================================================================================================
# SES: domain identity with Easy DKIM (2048-bit), custom MAIL FROM, configuration set with the account
# suppression list for bounces/complaints. New accounts start in the SES sandbox: request production access.
# ===================================================================================================
resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = local.name

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  delivery_options {
    tls_policy = "REQUIRE"
  }
}

resource "aws_sesv2_email_identity" "domain" {
  email_identity         = var.domain_name
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity         = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain       = local.mail_from_domain
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_route53_record" "dkim" {
  count = var.manage_dns ? 3 : 0

  zone_id = local.zone_id
  name    = "${local.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 1800
  records = ["${local.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

resource "aws_route53_record" "mail_from_mx" {
  count = var.manage_dns ? 1 : 0

  zone_id = local.zone_id
  name    = local.mail_from_domain
  type    = "MX"
  ttl     = 1800
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  count = var.manage_dns ? 1 : 0

  zone_id = local.zone_id
  name    = local.mail_from_domain
  type    = "TXT"
  ttl     = 1800
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "dmarc" {
  count = var.manage_dns && var.create_dmarc_record ? 1 : 0

  zone_id = local.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 1800
  records = [local.dmarc_value]
}

# ===================================================================================================
# SNS SMS (account-level settings for the guest verification codes). The spend limit cannot exceed the
# account's SMS quota (USD 1 until AWS raises it through a support case).
# ===================================================================================================
resource "aws_sns_sms_preferences" "this" {
  count = var.enable_sms ? 1 : 0

  monthly_spend_limit = var.sms_monthly_spend_limit_usd
  default_sms_type    = "Transactional"
  default_sender_id   = var.sms_sender_id != "" ? var.sms_sender_id : null
}
