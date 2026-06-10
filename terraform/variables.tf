###############################################################################
# variables.tf
###############################################################################
variable "region" {
  description = "Primary AWS region (closest to your users)."
  type        = string
  default     = "ap-south-1" # Mumbai
}

variable "env" {
  type    = string
  default = "prod"
}

variable "domain" {
  description = "Apex domain. The SPA is served here; API at /api/*."
  type        = string
  default     = "marevlo.com"
}

variable "api_subdomain" {
  description = "Origin hostname the CloudFront /api behavior points at."
  type        = string
  default     = "api.marevlo.com"
}

# --- networking ---
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

# --- data stores (2k-user starting point; scale up later) ---
variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "rds_allocated_storage" {
  type    = number
  default = 20
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

# --- ECS task sizing ---
variable "api_cpu" {
  type    = number
  default = 512
}
variable "api_memory" {
  type    = number
  default = 1024
}
variable "api_desired_count" {
  type    = number
  default = 2
}
variable "runner_cpu" {
  type    = number
  default = 1024
}
variable "runner_memory" {
  type    = number
  default = 2048
}
variable "runner_desired_count" {
  type    = number
  default = 1
}

# --- container images (set by CI to the ECR digest/tag it just pushed) ---
variable "api_image" {
  description = "Full ECR image URI for the API (e.g. <acct>.dkr.ecr.<region>.amazonaws.com/marevlo-api:sha)."
  type        = string
  default     = ""
}
variable "runner_image" {
  type    = string
  default = ""
}
