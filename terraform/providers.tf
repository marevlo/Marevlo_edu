###############################################################################
# providers.tf
#
# TWO providers on purpose:
#   - aws            : your main region (ap-south-1 / Mumbai — closest to you).
#   - aws.us_east_1  : us-east-1 ONLY for the CloudFront ACM certificate.
#     CloudFront can ONLY read certs from us-east-1, no matter where your app
#     runs. The ALB cert lives in your main region. This split is the #1 thing
#     people get wrong with apex + CloudFront. It is handled for you here.
###############################################################################
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Recommended: store state in S3 + DynamoDB lock. Fill and uncomment once the
  # state bucket exists (chicken-and-egg: create it manually or in a bootstrap).
  # backend "s3" {
  #   bucket         = "marevlo-tfstate"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "marevlo-tflock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project = "marevlo"
      Env     = var.env
      Managed = "terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project = "marevlo"
      Env     = var.env
      Managed = "terraform"
    }
  }
}
