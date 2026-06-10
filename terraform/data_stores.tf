###############################################################################
# data_stores.tf — RDS Postgres, ElastiCache Redis, Secrets, ECR.
###############################################################################

# ── secrets ────────────────────────────────────────────────────────────────
resource "random_password" "db" {
  length  = 32
  special = false
}
resource "random_password" "redis_auth" {
  length  = 32
  special = false
}
resource "random_password" "jwt" {
  length  = 48
  special = false
}

# One secret holding the app's runtime config. ECS injects these as env vars.
resource "aws_secretsmanager_secret" "app" {
  name = "marevlo/${var.env}/app"
}
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_SECRET = random_password.jwt.result
    DATABASE_URL = "postgresql+psycopg2://marevlo:${random_password.db.result}@${aws_db_instance.pg.address}:5432/marevlo"
    REDIS_URL  = "redis://:${random_password.redis_auth.result}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0"
    # Fill these post-apply (Firebase JSON, SMTP creds from SES):
    FIREBASE_CREDENTIALS_JSON = ""
    SMTP_HOST                 = "email-smtp.${var.region}.amazonaws.com"
    SMTP_USER                 = ""
    SMTP_PASS                 = ""
    SMTP_FROM                 = "no-reply@${var.domain}"
  })
  lifecycle { ignore_changes = [secret_string] } # don't clobber manual edits
}

# ── RDS ──────────────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "pg" {
  name       = "marevlo-pg"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "pg" {
  identifier              = "marevlo-${var.env}"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.rds_instance_class
  allocated_storage       = var.rds_allocated_storage
  storage_type            = "gp3"
  db_name                 = "marevlo"
  username                = "marevlo"
  password                = random_password.db.result
  db_subnet_group_name    = aws_db_subnet_group.pg.name
  vpc_security_group_ids  = [aws_security_group.data.id]
  multi_az                = false # flip true for HA before heavy load
  publicly_accessible     = false
  storage_encrypted       = true
  backup_retention_period = 7 # automated daily backups + PITR window
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "marevlo-${var.env}-final"
  performance_insights_enabled = true
  apply_immediately       = false
}

# ── ElastiCache Redis (with auth token = the password the app uses) ──────────
resource "aws_elasticache_subnet_group" "redis" {
  name       = "marevlo-redis"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "marevlo-${var.env}"
  description                = "Marevlo refresh tokens, rate limit, ws pubsub"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1
  engine                     = "redis"
  engine_version             = "7.1"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.data.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result
  automatic_failover_enabled = false # set true + num_cache_clusters>=2 for HA
}

# ── ECR ──────────────────────────────────────────────────────────────────────
resource "aws_ecr_repository" "api" {
  name                 = "marevlo-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}
resource "aws_ecr_repository" "runner" {
  name                 = "marevlo-runner"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}
