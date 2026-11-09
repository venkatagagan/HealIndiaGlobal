# CloudFront
#
# One distribution per SPA (patient, agent, hospital, admin) with three behaviours:
#   /api/*     -> ALB origin (no caching, all viewer headers/cookies/query strings forwarded: Authorization,
#                 the hig_refresh cookie, WebSocket upgrade headers for /api/v1/ws)
#   /assets/*  -> S3 via OAC, cached for a year (Vite content-hashed files)
#   default    -> S3 via OAC; extension-less paths rewritten to /index.html (SPA fallback, spa-rewrite.js)
# plus one API-only distribution for api.<domain> (Flutter app, Razorpay/Stripe webhooks, uptime checks).
# Every distribution uses the CLOUDFRONT-scope WAF web ACL (waf.tf) and a security-headers policy.

locals {
  cloudfront_certificate_arn = local.create_cloudfront_cert ? (
    local.manage_dns ? aws_acm_certificate_validation.cloudfront[0].certificate_arn : aws_acm_certificate.cloudfront[0].arn
  ) : var.cloudfront_certificate_arn

  # Mirrors infra/nginx/snippets/csp-spa.conf (Razorpay Checkout, Stripe.js, Google Identity Services, Google
  # Fonts); connect-src also allows the same-host WebSocket explicitly for older Safari versions.
  spa_csp = {
    for k, app in local.spa_apps : k => join("; ", [
      "default-src 'self'",
      "script-src 'self' https://checkout.razorpay.com https://js.stripe.com https://accounts.google.com/gsi/client",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' wss://${app.host} https://api.razorpay.com https://lumberjack.razorpay.com https://api.stripe.com https://accounts.google.com/gsi/",
      "frame-src https://api.razorpay.com https://checkout.razorpay.com https://js.stripe.com https://hooks.stripe.com https://accounts.google.com/gsi/",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://api.razorpay.com",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ])
  }

  api_origin_id = "api-alb"
  s3_origin_id  = "spa-s3"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "spa" {
  name                              = "${local.name}-spa"
  description                       = "${local.name} SPA buckets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "SPA fallback: extension-less paths -> /index.html"
  publish = true
  code    = file("${path.module}/functions/spa-rewrite.js")
}

# index.html is uploaded with Cache-Control: no-cache (never cached at the edge, new releases are live
# immediately); other root files (favicon, manifest) use their own max-age.
resource "aws_cloudfront_cache_policy" "spa_html" {
  name        = "${local.name}-spa-html"
  comment     = "SPA shell and root files: honour origin Cache-Control"
  min_ttl     = 0
  default_ttl = 0
  max_ttl     = 86400

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "spa" {
  for_each = local.spa_apps

  name    = "${local.name}-${each.key}-security-headers"
  comment = "Security headers for the ${each.key} SPA"

  security_headers_config {
    content_security_policy {
      content_security_policy = local.spa_csp[each.key]
      override                = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.razorpay.com\" \"https://js.stripe.com\")"
      override = true
    }

    items {
      header   = "Cross-Origin-Opener-Policy"
      value    = "same-origin-allow-popups"
      override = true
    }

    # The portals are private apps: never indexed (shell, routes and assets). When the public website moves
    # onto the main domain, its behaviors need their own policy WITHOUT this header (deploy/README.md "CDN").
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }
}

# The API sets its own nosniff / frame / CSP headers; the edge guarantees HSTS (as infra/nginx does).
resource "aws_cloudfront_response_headers_policy" "api" {
  name    = "${local.name}-api-headers"
  comment = "HSTS and noindex for API responses"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
  }

  custom_headers_config {
    items {
      header   = "X-Robots-Tag"
      value    = "noindex, nofollow"
      override = true
    }
  }
}

# ---------------------------------------------------------------------------------------------------
# SPA distributions (+ same-origin /api/*)
# ---------------------------------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "spa" {
  for_each = local.spa_apps

  enabled             = true
  comment             = "${local.name} ${each.key} SPA (${each.value.dir}) + /api"
  aliases             = [each.value.host]
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = var.cloudfront_price_class
  web_acl_id          = aws_wafv2_web_acl.edge.arn
  wait_for_deployment = false

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.spa[each.key].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id
  }

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.hosts.api_origin

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }

    custom_header {
      name  = local.origin_verify_header
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.spa_html.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.spa[each.key].id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.api.id
  }

  ordered_cache_behavior {
    path_pattern               = "/assets/*"
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.spa[each.key].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.cloudfront_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${local.name}-${each.key}" }
}

# ---------------------------------------------------------------------------------------------------
# API distribution (api.<domain>): mobile app, payment webhooks, uptime checks
# ---------------------------------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "api" {
  enabled             = true
  comment             = "${local.name} API (mobile app, webhooks)"
  aliases             = [local.hosts.api]
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = var.cloudfront_price_class
  web_acl_id          = aws_wafv2_web_acl.edge.arn
  wait_for_deployment = false

  origin {
    origin_id   = local.api_origin_id
    domain_name = local.hosts.api_origin

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }

    custom_header {
      name  = local.origin_verify_header
      value = random_password.origin_verify.result
    }
  }

  default_cache_behavior {
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false
    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.api.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.cloudfront_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${local.name}-api" }
}
