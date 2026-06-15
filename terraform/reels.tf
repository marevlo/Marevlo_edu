###############################################################################
# reels.tf — async reels processing pipeline (Phase 1).
#
# A reel is LIVE the moment it's uploaded (direct-publish). This stack runs the
# AFTER-publish enhancement: the API enqueues a job to SQS, a Fargate worker
# (`python -m app.reels.worker`) consumes it and runs Whisper captions + an
# AWS MediaConvert HLS transcode. Nothing here gates publication.
#
# The worker reuses the API container image (same Dockerfile) with a different
# command, so no extra ECR repo or build is required for HLS. (Whisper needs
# faster-whisper in the image — see var.reels_worker_image to point at a worker
# image built with Backend/requirements-worker.txt when you enable captions.)
###############################################################################

# ── variables ────────────────────────────────────────────────────────────────
variable "reels_worker_cpu" {
  type    = number
  default = 1024
}
variable "reels_worker_memory" {
  type    = number
  default = 2048 # bump to 4096 if running Whisper on larger models
}
variable "reels_worker_desired_count" {
  type    = number
  default = 1
}
variable "reels_worker_image" {
  description = "Worker image URI. Empty = reuse var.api_image (HLS only; no Whisper). Set to an image built with requirements-worker.txt to enable auto-captions."
  type        = string
  default     = ""
}
variable "mediaconvert_endpoint_url" {
  description = "Account-specific MediaConvert endpoint. Empty = let boto3 resolve it."
  type        = string
  default     = ""
}
variable "mediaconvert_queue_arn" {
  description = "MediaConvert queue ARN. Empty = account Default queue."
  type        = string
  default     = ""
}
variable "reels_cdn_base_url" {
  description = "CloudFront base URL serving HLS (e.g. https://media.marevlo.com). Empty = presigned S3 GETs."
  type        = string
  default     = ""
}
variable "whisper_model" {
  type    = string
  default = "base"
}

locals {
  reels_worker_image = var.reels_worker_image != "" ? var.reels_worker_image : var.api_image
  # Worker only needs DB + Redis + JWT; not SMTP/Firebase.
  worker_secret_keys = ["JWT_SECRET", "DATABASE_URL", "REDIS_URL"]
  worker_secrets     = [for k in local.worker_secret_keys : { name = k, valueFrom = "${aws_secretsmanager_secret.app.arn}:${k}::" }]
}

# ── SQS: processing queue + dead-letter queue ────────────────────────────────
resource "aws_sqs_queue" "reels_dlq" {
  name                      = "marevlo-reels-${var.env}-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "reels" {
  name                       = "marevlo-reels-${var.env}"
  visibility_timeout_seconds = 600    # must cover the longest transcode/transcribe
  message_retention_seconds  = 345600 # 4 days
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.reels_dlq.arn
    maxReceiveCount     = 3
  })
}

# ── API gains permission to enqueue ──────────────────────────────────────────
resource "aws_iam_role_policy" "api_reels_enqueue" {
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sqs:SendMessage"]
      Resource = aws_sqs_queue.reels.arn
    }]
  })
}

# ── MediaConvert service role (MediaConvert assumes this to read/write S3) ────
resource "aws_iam_role" "mediaconvert" {
  name = "marevlo-mediaconvert-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "mediaconvert.amazonaws.com" }
    }]
  })
}
resource "aws_iam_role_policy" "mediaconvert" {
  role = aws_iam_role.mediaconvert.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = "${aws_s3_bucket.uploads.arn}/*"
    }]
  })
}

# ── Worker task role: S3 + SQS consume + MediaConvert + PassRole ─────────────
resource "aws_iam_role" "reels_worker_task" {
  name = "marevlo-reels-worker-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}
resource "aws_iam_role_policy" "reels_worker_task" {
  role = aws_iam_role.reels_worker_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.uploads.arn}/*" },
      { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.reels.arn },
      { Effect = "Allow", Action = ["mediaconvert:CreateJob", "mediaconvert:GetJob", "mediaconvert:DescribeEndpoints"], Resource = "*" },
      { Effect = "Allow", Action = ["iam:PassRole"], Resource = aws_iam_role.mediaconvert.arn }
    ]
  })
}

# ── logs ─────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "reels_worker" {
  name              = "/ecs/marevlo-reels-worker"
  retention_in_days = 14
}

# ── worker task + service (no ALB; private subnets; API SG for data access) ───
resource "aws_ecs_task_definition" "reels_worker" {
  family                   = "marevlo-reels-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.reels_worker_cpu
  memory                   = var.reels_worker_memory
  execution_role_arn       = aws_iam_role.task_exec.arn
  task_role_arn            = aws_iam_role.reels_worker_task.arn
  container_definitions = jsonencode([{
    name      = "reels-worker"
    image     = local.reels_worker_image
    essential = true
    command   = ["python", "-m", "app.reels.worker"]
    environment = [
      { name = "ENV", value = var.env },
      { name = "DEBUG", value = "false" },
      { name = "LOG_FORMAT", value = "json" },
      { name = "AWS_REGION", value = var.region },
      { name = "S3_BUCKET", value = aws_s3_bucket.uploads.bucket },
      { name = "REELS_SQS_QUEUE_URL", value = aws_sqs_queue.reels.url },
      { name = "MEDIACONVERT_ROLE_ARN", value = aws_iam_role.mediaconvert.arn },
      { name = "MEDIACONVERT_ENDPOINT_URL", value = var.mediaconvert_endpoint_url },
      { name = "MEDIACONVERT_QUEUE_ARN", value = var.mediaconvert_queue_arn },
      { name = "REELS_CDN_BASE_URL", value = var.reels_cdn_base_url },
      { name = "WHISPER_MODEL", value = var.whisper_model }
    ]
    secrets = local.worker_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.reels_worker.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "reels-worker"
      }
    }
  }])
}

resource "aws_ecs_service" "reels_worker" {
  name            = "reels-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.reels_worker.arn
  desired_count   = var.reels_worker_desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets = aws_subnet.private[*].id
    # Reuse the API SG: the data-tier SG only accepts the API SG, and the
    # worker needs Postgres + Redis. No load balancer is attached, so the
    # inbound :8000 rule is never exercised.
    security_groups = [aws_security_group.api.id]
  }
}

# ── outputs ──────────────────────────────────────────────────────────────────
output "reels_sqs_queue_url" {
  value = aws_sqs_queue.reels.url
}
output "reels_mediaconvert_role_arn" {
  value = aws_iam_role.mediaconvert.arn
}
