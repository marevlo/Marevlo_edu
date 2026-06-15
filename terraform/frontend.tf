###############################################################################
# frontend.tf — S3 (private) + CloudFront. This replaces vercel.json entirely:
#   - default behavior  -> S3 (the built SPA), with SPA fallback
#   - /api/* behavior    -> ALB (the API), no caching, all headers forwarded
#   - response headers   -> the security headers vercel.json used to set
###############################################################################

data "aws_caller_identity" "current" {}

# ── SPA bucket (private; only CloudFront reads it via OAC) ───────────────────
resource "aws_s3_bucket" "spa" {
  bucket = "marevlo-spa-${var.env}-${data.aws_caller_identity.current.account_id}"
}
resource "aws_s3_bucket_public_access_block" "spa" {
  bucket                  = aws_s3_bucket.spa.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── user-uploads bucket (private; presigned URLs only — your storage.py) ─────
resource "aws_s3_bucket" "uploads" {
  bucket = "marevlo-user-uploads-${var.env}-${data.aws_caller_identity.current.account_id}"
}
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

# ── CloudFront ───────────────────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "spa" {
  name                              = "marevlo-spa-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Security headers — the set vercel.json used to add.
resource "aws_cloudfront_response_headers_policy" "sec" {
  name = "marevlo-security-headers"
  security_headers_config {
    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
  }
}

resource "aws_cloudfront_function" "rewrite_api" {
  name    = "marevlo-rewrite-api-${var.env}"
  runtime = "cloudfront-js-2.0"
  comment = "Strips /api prefix from request URI before sending to origin"
  publish = true
  code    = <<EOF
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    if (uri.startsWith('/api')) {
        request.uri = uri.replace(/^\/api/, '');
        if (request.uri === '') {
            request.uri = '/';
        }
    }
    
    return request;
}
EOF
}

resource "aws_cloudfront_distribution" "spa" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = [var.domain, "www.${var.domain}"]
  price_class         = "PriceClass_200" # incl. India edge locations

  # origin 1: the SPA in S3
  origin {
    domain_name              = aws_s3_bucket.spa.bucket_regional_domain_name
    origin_id                = "spa-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.spa.id
  }

  # origin 2: the API behind the ALB
  origin {
    domain_name = var.api_subdomain
    origin_id   = "api-alb"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # default: serve the SPA
  default_cache_behavior {
    target_origin_id           = "spa-s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.sec.id
  }

  # /api/* -> ALB, no caching, forward everything (auth headers, cookies)
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api-alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id

    # The SPA is built with VITE_API_URL=/api, but FastAPI serves routes at the
    # root (/auth, /profile, ...). Strip the prefix here — same rewrite the Vite
    # dev proxy does — or every API call 404s in production.
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite_api.arn
    }
  }

  # SPA fallback: client-side routes (e.g. /courses/x) return index.html.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cf.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# AWS-managed policies (referenced by id)
data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_cache_policy" "disabled" { name = "Managed-CachingDisabled" }
data "aws_cloudfront_origin_request_policy" "all_viewer" { name = "Managed-AllViewer" }

# Let CloudFront (this distribution only) read the SPA bucket.
resource "aws_s3_bucket_policy" "spa" {
  bucket = aws_s3_bucket.spa.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.spa.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.spa.arn } }
    }]
  })
}
