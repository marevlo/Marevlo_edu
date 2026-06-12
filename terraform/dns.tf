###############################################################################
# dns.tf — Route 53 hosted zone, ACM certs (two regions), and records.
#
# Apply order:
#   1. terraform apply -target=aws_route53_zone.main \
#                      -target=aws_route53_record.mx \
#                      -target=aws_route53_record.txt_apex \
#                      -target=aws_route53_record.dkim
#   2. terraform output route53_nameservers
#   3. Set the 4 nameservers in Squarespace -> domain -> Nameservers -> custom.
#   4. Verify: dig +short NS marevlo.com @8.8.8.8
#   5. terraform apply
###############################################################################

resource "aws_route53_zone" "main" {
  name = var.domain
}

# Google Workspace MX
resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 3600
  records = ["1 smtp.google.com."]
}

# SPF
resource "aws_route53_record" "txt_apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:_spf.google.com ~all"]
}

# DKIM (split into two chunks — Route 53 limit is 255 chars per string)
resource "aws_route53_record" "dkim" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "google._domainkey.${var.domain}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtIUmnMWLP4lnN23KDWBITxAvBfOSDN9hS33p3o2x/+T0UJxQbTjOE/tcAWASGrq5dT7CwtOCy2gCBW3HD4HLx33N4C5SAPjTTSOwNBqj2O1KxKrsp5xKGyNDmJU4EwKG8q1YXDoXMjshA5zbeyeafbRw3gyAz0HGaUvHF4z1dOnWvKi85p3Gnvbm4NE4ahVAP\"\"kNWxLRnWYxn4044kV4U9YsCk/BZowkjD/+e8kkHpnxv5g1+fAuoK5Q4vSsohXkXEHp93M1KuTBic8HLECk2br9XY+f3NTX6UNbJmMDWuJx4HOC+zSbg5aYrWX23anV7BXjhU6/yik8y9H8ttRmncQIDAQAB"]
}

# ACM cert for CloudFront — must be in us-east-1
resource "aws_acm_certificate" "cf" {
  provider                  = aws.us_east_1
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "cf_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cf.domain_validation_options :
    dvo.domain_name => { name = dvo.resource_record_name, type = dvo.resource_record_type, record = dvo.resource_record_value }
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "cf" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.cf.arn
  validation_record_fqdns = [for r in aws_route53_record.cf_validation : r.fqdn]
}

# ACM cert for the ALB — main region
resource "aws_acm_certificate" "api" {
  domain_name       = var.api_subdomain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_route53_record" "api_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options :
    dvo.domain_name => { name = dvo.resource_record_name, type = dvo.resource_record_type, record = dvo.resource_record_value }
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_validation : r.fqdn]
}

# Apex: legacy server by default, CloudFront when cutover_to_cloudfront = true
resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "A"

  dynamic "alias" {
    for_each = var.cutover_to_cloudfront ? [1] : []
    content {
      name                   = aws_cloudfront_distribution.spa.domain_name
      zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
      evaluate_target_health = false
    }
  }

  ttl     = var.cutover_to_cloudfront ? null : 300
  records = var.cutover_to_cloudfront ? null : [var.legacy_server_ip]
}

# AAAA: CloudFront only
resource "aws_route53_record" "apex_aaaa" {
  count   = var.cutover_to_cloudfront ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.spa.domain_name
    zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
    evaluate_target_health = false
  }
}

# www: same toggle as apex
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain}"
  type    = "A"

  dynamic "alias" {
    for_each = var.cutover_to_cloudfront ? [1] : []
    content {
      name                   = aws_cloudfront_distribution.spa.domain_name
      zone_id                = aws_cloudfront_distribution.spa.hosted_zone_id
      evaluate_target_health = false
    }
  }

  ttl     = var.cutover_to_cloudfront ? null : 300
  records = var.cutover_to_cloudfront ? null : [var.legacy_server_ip]
}

# api.marevlo.com -> ALB
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.api_subdomain
  type    = "A"
  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
