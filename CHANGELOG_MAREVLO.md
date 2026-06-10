# Marevlo — changes applied in this build

This zip is the full repo with the following work applied. Nothing else was altered.

## Security
- **Runner sandbox stopgap** (`runner/workers/python_worker.py`): forked child now
  `setsid()`s so timeouts `killpg` the whole subtree (fork-bomb/orphan safe);
  added `RLIMIT_FSIZE`. `docker-compose.yml`: runner moved to an ISOLATED network
  (no path to Postgres/Redis), Redis now requires `REDIS_PASSWORD`, `pids_limit`
  on the runner. NOTE: real fix (gVisor / per-exec isolation) still pending before
  open/public launch.

## Paid access (entitlement + RBAC)
- New `Backend/app/entitlements/` module: model, service, schemas, user router
  (`GET /me/access`), admin router (`POST /admin/entitlements/grant|revoke`).
- `Backend/app/core/access.py`: `require_entitlement("dsa"|"courses"|"all_access")`.
- DSA gated: `problems` list/detail + `submissions` run/submit now require `dsa`.
- `users.role` column added (`student|staff|admin`); `require_admin` honors it.
- `grant()` is the seam a future PayU webhook calls — payments stay decoupled.
- Migration `entitlements_001_rbac` ALSO merges the two open alembic heads
  (a fresh `alembic upgrade head` was previously failing). Single head now.
- Tests: `Backend/tests/test_entitlements.py` (9 cases).

## MIRA removed (re-add after deploy)
- `Backend/app/mira/` and `frontend/src/components/mira/` deleted.
- `main.py`, `models_registry.py`, `App.jsx` cleaned; `requirements.txt` dropped
  anthropic/openai/qdrant-client; compose qdrant + MIRA env removed.
- `alembic/versions/mira_001_initial.py` NEUTRALIZED to a no-op (kept to preserve
  the migration chain — profile_003 chains off it). Do NOT delete it.

## De-Vercel (now AWS-only)
- `frontend/vercel.json` deleted (replaced by CloudFront behaviors in terraform/).
- Self-hosted noise texture `frontend/public/noise.svg`; `LandingPage.jsx`
  repointed off `grainy-gradients.vercel.app`.
- `frontend/.env.example` + backend `.env.example` updated (VITE_API_URL=/api,
  CORS_ORIGINS=marevlo.com).

## AWS deploy layer (new)
- `terraform/` — VPC, RDS, ElastiCache(Redis auth), ECR, Secrets, ALB,
  ECS Fargate (api + isolated runner), S3+CloudFront (apex marevlo.com, dual
  origin: S3 + /api ALB), Route53, ACM (us-east-1 for CF, region for ALB).
- `.github/workflows/` — frontend (S3+CloudFront) and backend (ECR+ECS via TF).
- `README_DEPLOY.md` — Squarespace steps, deploy order, cost, caveats.
  Terraform is NOT `plan`-tested (no AWS account here) — run plan before apply.

## Still open (post-deploy / PayU batch)
- Course-content gating, server-scored assessments, account deletion (DPDP),
  legal pages, CMS, anti-paste IDE, WAF, alerting alarms, SES prod access.
