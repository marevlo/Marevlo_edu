###############################################################################
# outputs.tf
###############################################################################
output "nameservers" {
  description = "Put these 4 into Squarespace (custom nameservers), or transfer the domain to Route 53."
  value       = aws_route53_zone.main.name_servers
}
output "cloudfront_domain" {
  value = aws_cloudfront_distribution.spa.domain_name
}
output "spa_bucket" {
  description = "CI uploads the built SPA here, then invalidates CloudFront."
  value       = aws_s3_bucket.spa.bucket
}
output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.spa.id
}
output "ecr_api" { value = aws_ecr_repository.api.repository_url }
output "ecr_runner" { value = aws_ecr_repository.runner.repository_url }
output "alb_dns" { value = aws_lb.api.dns_name }
output "rds_endpoint" {
  value     = aws_db_instance.pg.address
  sensitive = true
}
output "app_secret_arn" { value = aws_secretsmanager_secret.app.arn }
