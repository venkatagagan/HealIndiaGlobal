# AWS WAF (CLOUDFRONT scope, created in us-east-1) attached to all five distributions. Because every public
# request enters through CloudFront, WAF sees the real client IP, so per-IP rate limits are accurate (the ALB
# behind CloudFront would only see CloudFront addresses).
#
# Rule order:
#   1  admin-ip-allowlist     (optional) block the admin hostname outside admin_allowed_cidrs
#   10 aws-ip-reputation      AWSManagedRulesAmazonIpReputationList
#   15 aws-anonymous-ip       (optional) AWSManagedRulesAnonymousIpList
#   20 rate-limit-auth        per-IP limit on /api/v1/auth/*  -> 429 JSON
#   30 rate-limit-global      per-IP limit on everything except payment webhooks -> 429 JSON
#   40 aws-common             AWSManagedRulesCommonRuleSet (body size rule in COUNT: uploads up to MAX_UPLOAD_MB)
#   50 aws-known-bad-inputs   AWSManagedRulesKnownBadInputsRuleSet
#   60 aws-sqli               AWSManagedRulesSQLiRuleSet
# Body-inspecting groups skip payment webhooks (signature-verified raw bodies) and document uploads
# (validated by magic bytes in the API) to avoid false positives on binary/JSON payloads.

locals {
  waf_body_exempt_regex = "^/api/v1/(payments/webhooks/|documents)"
  waf_rate_limited_body = jsonencode({
    error = {
      code       = "rate_limited"
      message    = "Too many requests, please slow down."
      details    = null
      request_id = null
    }
  })
}

resource "aws_wafv2_regex_pattern_set" "body_exempt" {
  provider = aws.us_east_1

  name        = "${local.name}-waf-body-exempt"
  description = "Paths excluded from body-inspecting managed rules"
  scope       = "CLOUDFRONT"

  regular_expression {
    regex_string = local.waf_body_exempt_regex
  }
}

resource "aws_wafv2_ip_set" "admin_allowlist" {
  count    = length(var.admin_allowed_cidrs) > 0 ? 1 : 0
  provider = aws.us_east_1

  name               = "${local.name}-admin-allowlist"
  description        = "Networks allowed to reach the admin portal"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = var.admin_allowed_cidrs
}

resource "aws_wafv2_web_acl" "edge" {
  provider = aws.us_east_1

  name        = "${local.name}-edge"
  description = "${local.name} CloudFront protection"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  custom_response_body {
    key          = "rate_limited"
    content_type = "APPLICATION_JSON"
    content      = local.waf_rate_limited_body
  }

  # 1 ------------------------------------------------------------------------------------------------
  dynamic "rule" {
    for_each = length(var.admin_allowed_cidrs) > 0 ? [1] : []

    content {
      name     = "admin-ip-allowlist"
      priority = 1

      action {
        block {}
      }

      statement {
        and_statement {
          statement {
            byte_match_statement {
              search_string         = local.hosts.admin
              positional_constraint = "EXACTLY"

              field_to_match {
                single_header {
                  name = "host"
                }
              }

              text_transformation {
                priority = 0
                type     = "LOWERCASE"
              }
            }
          }

          statement {
            not_statement {
              statement {
                ip_set_reference_statement {
                  arn = aws_wafv2_ip_set.admin_allowlist[0].arn
                }
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-admin-ip-allowlist"
        sampled_requests_enabled   = true
      }
    }
  }

  # 10 -----------------------------------------------------------------------------------------------
  rule {
    name     = "aws-ip-reputation"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-aws-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # 15 -----------------------------------------------------------------------------------------------
  dynamic "rule" {
    for_each = var.waf_enable_anonymous_ip_list ? [1] : []

    content {
      name     = "aws-anonymous-ip"
      priority = 15

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = "AWSManagedRulesAnonymousIpList"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-aws-anonymous-ip"
        sampled_requests_enabled   = true
      }
    }
  }

  # 20 -----------------------------------------------------------------------------------------------
  rule {
    name     = "rate-limit-auth"
    priority = 20

    action {
      block {
        custom_response {
          response_code            = 429
          custom_response_body_key = "rate_limited"

          response_header {
            name  = "Retry-After"
            value = "60"
          }
        }
      }
    }

    statement {
      rate_based_statement {
        limit              = var.waf_auth_rate_limit
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/v1/auth/"
            positional_constraint = "STARTS_WITH"

            field_to_match {
              uri_path {}
            }

            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-rate-limit-auth"
      sampled_requests_enabled   = true
    }
  }

  # 30 -----------------------------------------------------------------------------------------------
  dynamic "rule" {
    for_each = var.waf_global_rate_limit > 0 ? [1] : []

    content {
      name     = "rate-limit-global"
      priority = 30

      action {
        block {
          custom_response {
            response_code            = 429
            custom_response_body_key = "rate_limited"

            response_header {
              name  = "Retry-After"
              value = "60"
            }
          }
        }
      }

      statement {
        rate_based_statement {
          limit              = var.waf_global_rate_limit
          aggregate_key_type = "IP"

          # Payment gateways send bursts from shared ranges; their signatures are the control.
          scope_down_statement {
            not_statement {
              statement {
                byte_match_statement {
                  search_string         = "/api/v1/payments/webhooks/"
                  positional_constraint = "STARTS_WITH"

                  field_to_match {
                    uri_path {}
                  }

                  text_transformation {
                    priority = 0
                    type     = "NONE"
                  }
                }
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${local.name}-rate-limit-global"
        sampled_requests_enabled   = true
      }
    }
  }

  # 40 -----------------------------------------------------------------------------------------------
  rule {
    name     = "aws-common"
    priority = 40

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"

        # Document uploads (multipart, up to MAX_UPLOAD_MB) exceed the 8 KB body limit of this rule.
        rule_action_override {
          name = "SizeRestrictions_BODY"

          action_to_use {
            count {}
          }
        }

        scope_down_statement {
          not_statement {
            statement {
              regex_pattern_set_reference_statement {
                arn = aws_wafv2_regex_pattern_set.body_exempt.arn

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-aws-common"
      sampled_requests_enabled   = true
    }
  }

  # 50 -----------------------------------------------------------------------------------------------
  rule {
    name     = "aws-known-bad-inputs"
    priority = 50

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-aws-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # 60 -----------------------------------------------------------------------------------------------
  rule {
    name     = "aws-sqli"
    priority = 60

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"

        scope_down_statement {
          not_statement {
            statement {
              regex_pattern_set_reference_statement {
                arn = aws_wafv2_regex_pattern_set.body_exempt.arn

                field_to_match {
                  uri_path {}
                }

                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-aws-sqli"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-edge"
    sampled_requests_enabled   = true
  }
}

# ---------------------------------------------------------------------------------------------------
# Logging (BLOCK and COUNT decisions only). The log group must live in us-east-1 next to the web ACL and
# its name must start with aws-waf-logs-. Authorization, cookies and query strings (WebSocket ?token=) are
# redacted.
# ---------------------------------------------------------------------------------------------------
resource "aws_cloudwatch_log_group" "waf" {
  count    = var.waf_logging_enabled ? 1 : 0
  provider = aws.us_east_1

  name              = "aws-waf-logs-${local.name}"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "edge" {
  count    = var.waf_logging_enabled ? 1 : 0
  provider = aws.us_east_1

  resource_arn            = aws_wafv2_web_acl.edge.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf[0].arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }

  redacted_fields {
    query_string {}
  }

  logging_filter {
    default_behavior = "DROP"

    filter {
      behavior    = "KEEP"
      requirement = "MEETS_ANY"

      condition {
        action_condition {
          action = "BLOCK"
        }
      }

      condition {
        action_condition {
          action = "COUNT"
        }
      }
    }
  }
}
