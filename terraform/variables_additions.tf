# Add to variables.tf

variable "cutover_to_cloudfront" {
  description = "false = apex/www point at legacy server; true = CloudFront."
  type        = bool
  default     = false
}

variable "legacy_server_ip" {
  description = "Current production server IP."
  type        = string
  default     = "13.205.159.122"
}

# Add to outputs.tf

output "route53_nameservers" {
  description = "Set these in Squarespace nameserver settings."
  value       = aws_route53_zone.main.name_servers
}
