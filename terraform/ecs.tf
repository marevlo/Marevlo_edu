###############################################################################
# ecs.tf — ALB + ECS Fargate cluster (api + runner).
#
# api    : behind the ALB, reachable from CloudFront's /api/* behavior.
# runner : internal only, reachable from the API SG on 4002, no data access.
###############################################################################

data "aws_caller_identity" "me" {}

# ── ALB ───────────────────────────────────────────────────────────────────--
resource "aws_lb" "api" {
  name               = "marevlo-api"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 300 # WebSockets (chat) need a long idle timeout
}

resource "aws_lb_target_group" "api" {
  name        = "marevlo-api"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path                = "/health/ready"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  stickiness {
    type            = "lb_cookie"
    enabled         = true # keep WS connections pinned
    cookie_duration = 3600
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.api.certificate_arn
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ── ECS cluster ──────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = "marevlo-${var.env}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ── IAM ──────────────────────────────────────────────────────────────────────
resource "aws_iam_role" "task_exec" {
  name = "marevlo-task-exec"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}
resource "aws_iam_role_policy_attachment" "task_exec" {
  role       = aws_iam_role.task_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
data "aws_secretsmanager_secret" "firebase" {
  name = "marevlo-prod-firebase"
}

# Allow the execution role to read the app secret and firebase secret (injected as env).
resource "aws_iam_role_policy" "read_secret" {
  role = aws_iam_role.task_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.app.arn,
        data.aws_secretsmanager_secret.firebase.arn
      ]
    }]
  })
}
# Task role for the API (S3 uploads, SES, etc.). Tighten resources later.
resource "aws_iam_role" "api_task" {
  name = "marevlo-api-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}
resource "aws_iam_role_policy" "api_task" {
  role = aws_iam_role.api_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.uploads.arn}/*" },
      { Effect = "Allow", Action = ["ses:SendEmail", "ses:SendRawEmail"], Resource = "*" }
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/marevlo-api"
  retention_in_days = 30
}
resource "aws_cloudwatch_log_group" "runner" {
  name              = "/ecs/marevlo-runner"
  retention_in_days = 14
}

# helper: secret env mapping
locals {
  secret_keys = ["JWT_SECRET", "DATABASE_URL", "REDIS_URL", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]
  app_secrets = [for k in local.secret_keys : { name = k, valueFrom = "${aws_secretsmanager_secret.app.arn}:${k}::" }]
  api_secrets = concat(
    local.app_secrets,
    [{ name = "FIREBASE_CREDENTIALS_JSON", valueFrom = data.aws_secretsmanager_secret.firebase.arn }]
  )
}

# ── runner task + service (internal, isolated) ───────────────────────────────
resource "aws_ecs_task_definition" "runner" {
  family                   = "marevlo-runner"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.runner_cpu
  memory                   = var.runner_memory
  execution_role_arn       = aws_iam_role.task_exec.arn
  container_definitions = jsonencode([{
    name         = "runner"
    image        = var.runner_image
    essential    = true
    portMappings = [{ containerPort = 4002 }]
    environment = [
      { name = "PORT", value = "4002" },
      { name = "PYTHON_POOL_SIZE", value = "4" },
      { name = "MAX_CONCURRENT", value = "20" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.runner.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "runner"
      }
    }
  }])
}

resource "aws_service_discovery_private_dns_namespace" "internal" {
  name = "marevlo.internal"
  vpc  = aws_vpc.main.id
}
resource "aws_service_discovery_service" "runner" {
  name = "runner"
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.internal.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_ecs_service" "runner" {
  name            = "runner"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.runner.arn
  desired_count   = var.runner_desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.runner.id]
  }
  service_registries { registry_arn = aws_service_discovery_service.runner.arn }
}

# ── api task + service ───────────────────────────────────────────────────────
resource "aws_ecs_task_definition" "api" {
  family                   = "marevlo-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.task_exec.arn
  task_role_arn            = aws_iam_role.api_task.arn
  container_definitions = jsonencode([{
    name         = "api"
    image        = var.api_image
    essential    = true
    portMappings = [{ containerPort = 8000 }]
    environment = [
      { name = "ENV", value = var.env },
      { name = "DEBUG", value = "false" },
      { name = "LOG_FORMAT", value = "json" },
      { name = "AWS_REGION", value = var.region },
      { name = "S3_BUCKET", value = aws_s3_bucket.uploads.bucket },
      { name = "CORS_ORIGINS", value = "https://${var.domain},https://www.${var.domain}" },
      { name = "TRUSTED_PROXIES", value = var.vpc_cidr },
      # Runner reachable via Cloud Map private DNS on the API SG path:
      { name = "IDE_RUNNER_URL", value = "http://runner.marevlo.internal:4002" },
      { name = "NOTEBOOK_BASE_URL", value = "https://${var.domain}/notebook" },
      # Compliance gates. REQUIRE_EMAIL_VERIFICATION blocks password login for
      # unverified emails — flip to "true" only after SES production access is
      # granted and SMTP secrets are filled, or new signups cannot log in.
      { name = "REQUIRE_EMAIL_VERIFICATION", value = "false" },
      { name = "REQUIRE_TOS_ACCEPT", value = "true" },
      { name = "TOS_VERSION", value = "1.0" }
    ]
    secrets = local.api_secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "api"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.api.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 8000
  }
  depends_on = [aws_lb_listener.https]
}
