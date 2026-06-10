# Marevlo Backend

Production-grade FastAPI backend for the Marevlo platform — auth, profiles, feed, chat, courses, problems, submissions, notebook launch, **learning system**, **notifications**, **moderation**, **bug reporting**, and **observability**.

## What's in here

```
app/
├── auth/              # signup / login / Google / refresh / password reset / WS-ticket
├── profile/           # bio, avatar, resume, XP, badges, stats
├── feed/              # social feed: posts, likes, comments, multi-image
├── chat/              # 1:1 DMs, follows, WebSockets (Redis pubsub fanout)
├── courses/           # YouTube-style like/dislike + comments per lesson
├── problems/          # problem catalog, sample testcases
├── submissions/       # code run + grading (auth-protected, awards XP)
├── notebook/          # JupyterHub launch token mint
├── moderation/        # reports, blocks, admin queue, profanity filter, soft-delete
├── learning/          # course enrollment, lesson progress, notes, bookmarks, dashboard
├── notifications/     # in-app notifications + admin announcements
├── bug_reports/       # user-submitted bug reports with optional screenshot upload
├── common/            # activity log + security audit log
└── core/              # config, db, security, storage, middleware, errors,
                       # rate-limiting, body-size cap, idempotency keys,
                       # file-validation (magic bytes + Pillow re-encode),
                       # metrics (Prometheus), slow-query logger

alembic/               # real op.create_table baseline migration (27 tables)
tests/                 # 125 tests across 17 files
scripts/smoke_test.py  # 38-check end-to-end test against a running API
Dockerfile             # multi-stage prod image, non-root, healthcheck
docker-compose.yml     # local dev (Postgres + Redis + API)
```

## Tech choices

- **FastAPI 0.115** + **Pydantic v2** for the HTTP layer.
- **SQLAlchemy 2.0** with `Mapped[]` typing and `psycopg2` for Postgres.
- **Alembic** for migrations — proper `op.create_table` baselines.
- **Redis** for refresh-token storage, rate-limiting, WebSocket pubsub, idempotency cache, WS-ticket store.
- **boto3** + **cachetools** for S3 with presigned-URL caching.
- **Pillow** for image re-encoding on upload (strips metadata, defeats polyglots).
- **slowapi** for per-IP rate limits, keyed off X-Forwarded-For.
- **gunicorn + uvicorn workers** in prod.

## Architecture principles

- **Layers**: routers (HTTP only) → services (business logic) → models (ORM). Routers stay thin; services are unit-testable without FastAPI.
- **No N+1, enforced by CI**: feed/chat/problems/courses/admin-reports/learning-dashboard list endpoints use `selectinload` + `IN`-clause subqueries. Six query-budget tests assert per-endpoint maxima.
- **Auth from the session, never from the body**: every state-changing endpoint takes `current_user: User = Depends(get_current_user)`. The original `/execute/run` body-`user_id` impersonation hole is closed and unit-tested against.
- **Refresh-token rotation**: every `/auth/refresh` revokes the old JTI.
- **Timezone-aware everywhere**: `DateTime(timezone=True)` on every timestamp.
- **Cross-dialect**: streak/activity queries are bucketed in Python from raw timestamps so the same code paths run on Postgres (prod) and SQLite (tests). The audit-log `meta` and notification `payload` columns use a custom `JSONBType` mapping to `JSONB` on Postgres and `JSON` on SQLite.
- **Best-effort observability never breaks the parent op**: audit log inserts, notification fanout, slow-query logging, Prometheus metrics, suspicious-login emails — all swallow their own errors so a failed audit/email never breaks login.

## Security posture

- **Bcrypt** with 72-byte truncation guard.
- **OTPs** are HMAC-SHA256-with-pepper, single-use, 10-minute TTL.
- **JWT** with `jti`; refresh tokens stored in Redis as `refresh:{user_id}:{jti}` for per-user revocation.
- **WebSocket auth via one-shot tickets**: `POST /auth/ws-ticket` mints a 60s URL-safe token; `wss://api/chat/ws?ticket=<t>` consumes it atomically (Redis `GETDEL`). Dev `?token=` fallback hard-disabled when `ENV=prod`.
- **Insecure defaults refused in prod**: app refuses to start if `JWT_SECRET` is the default, `DEBUG=true`, or `S3_BUCKET` is unset when `ENV in ("staging","prod")`.
- **Rate limited per IP** (slowapi): signup 5/min, login 10/min, refresh 20/min, password forgot/reset 5/min, submission run 30/min, submit 20/min.
- **Rate limited per email** (Redis): forgot-password 5/hour, reset-attempt 10/hour.
- **Body size cap**: `MaxBodySizeMiddleware` rejects bodies above `MAX_REQUEST_BYTES` (default 10 MB).
- **Idempotency keys**: `Idempotency-Key` header on `/feed/posts`, comment creation, `/chat/messages` is hashed with `(user_id, method, path)` and cached in Redis for 10 minutes. Concurrent identical requests are de-duplicated via `SET NX`.
- **Security audit log** (`security_events` table): login success/failure, logout, password reset, Google login, admin moderation action, user block, **suspicious login**.
- **Suspicious-login alert**: returning user from a previously-unseen `(IP, user_agent)` pair triggers `EVT_SUSPICIOUS_LOGIN` audit row + email to the user. First-ever login (signup) does NOT alert.
- **Password-changed confirmation email** sent automatically after `/auth/password/reset`.
- **File upload validation**: magic-byte sniffing (JPEG/PNG/WebP/GIF/PDF) verifies the actual bytes match the declared `Content-Type` at avatar confirm, feed image attach, and resume upload. **Pillow re-encode** strips EXIF/metadata, downsizes oversized images to 2048px, defeats polyglots. Invalid bytes → S3 object deleted + 400.
- **Moderation**: report posts/comments, block users (bidirectional invisibility + DM rejection), admin queue, admin soft-delete, profanity filter on content creation. `is_admin` column; `require_admin` dependency.
- **CORS** is closed by default — `CORS_ORIGINS` is the only allowlist.

## Notifications

In-app notification system with admin-broadcast support:

- **Triggers wired**: post-comment, post-like, report-resolved, admin announcement.
- **Self-actions filtered**: liking your own post does not notify yourself.
- **Endpoints**: `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/mark-all-read`.
- **Admin**: `POST /admin/announcements` fans out to every active user.
- **Transactional email**: `send_otp`, `send_password_changed`, `send_suspicious_login`. SMTP via SES in prod; dev fallback prints to stdout.

## Bug reporting

Users can submit bug reports from the profile dropdown menu on the frontend.

- **Endpoint**: `POST /bug-reports` — multipart form (title, description, optional screenshot).
- **Screenshot upload**: JPEG/PNG/WebP accepted, ≤ 8 MB. Validated with magic-byte sniffing + Pillow re-encode. Stored in S3 at `bug-reports/{user_id}/{uuid}.{ext}`. Upload failure is non-fatal; the report is still saved.
- **DB schema**: `bug_reports` table — `id`, `user_id` (FK → users, SET NULL on delete), `title` (200), `description` (text), `screenshot_key` (S3 key, nullable), `status` (`open` / `resolved`, default `open`), `created_at`.
- **Auth**: requires authenticated user (`get_current_user`). Anonymous reports not accepted.
- **Frontend**: `BugReportModal` component — dark/light theme aware, inline validation, screenshot preview, success state. Mounted in the `Navigation` component and toggled via profile dropdown.

## User learning system

Course-enrollment + lesson-progress + notes + bookmarks. Frontend gets a single dashboard call.

- `POST /learning/enrollments/{course_id}` — idempotent self-enroll
- `GET /learning/enrollments` — list active enrollments
- `PUT /learning/progress/{lesson_id}` — upsert progress (status, last_position, time_delta_seconds). Auto-enrolls. Time deltas capped at 600s server-side.
- `GET /learning/progress/{lesson_id}` — fetch progress for a lesson
- `GET /learning/courses/{course_id}/progress` — list all progress for a course
- `GET /learning/dashboard` — **single aggregated call** returning per-course summaries + a "continue learning" resume row. ~5 queries regardless of how many lessons touched.
- `PUT/GET/DELETE /learning/notes/{lesson_id}` — personal notes per lesson
- `POST/DELETE /learning/bookmarks/{lesson_id}` — saved-for-later

`course_id` and `lesson_id` are strings (e.g. `"recsys.m01.l03"`) matching how the frontend already references content. Lessons live as files in the repo, not DB rows. Lesson completion is one-way (re-sending `in_progress` after `completed` does not unset).

## Observability

- **Structured logs**: `LOG_FORMAT=json` outputs CloudWatch-friendly JSON. Every request logs `request_id`, `method`, `path`, `path_template`, `status`, `elapsed_ms`.
- **Request tracing**: `X-Request-ID` middleware (idempotent — passes through if client supplies one).
- **Prometheus metrics**: `GET /metrics` exposes:
  - `http_requests_total{method,path,status}` (counter)
  - `http_request_duration_ms_*` (histogram with 12 buckets from 1ms to 10s)
  - `websocket_active_connections` (gauge)
  - `db_slow_queries_total{path}` (counter)
  - `app_info{version,env}` (gauge=1)
  - **Path templates collapse path parameters**: `/posts/123/like` and `/posts/456/like` both report under `path="/feed/posts/{post_id}/like"`. Bounded cardinality.
- **Slow query logger**: SQLAlchemy event listener logs any query above `SLOW_QUERY_THRESHOLD_MS` (default 500) at WARNING level with statement (truncated 500 chars), params (redacted if batched), and elapsed time.
- **Sentry SDK** wired (`SENTRY_DSN` env var).
- **RDS Performance Insights** is one click to enable on the RDS instance.

## Local development

### Quick (with Docker)

```bash
docker compose up
# API: http://localhost:8000  | Health: http://localhost:8000/health/ready
# Metrics: http://localhost:8000/metrics
```

### Native

```bash
service postgresql start
redis-server --daemonize yes
sudo -u postgres psql -c "CREATE USER marevlo WITH PASSWORD 'marevlo' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE marevlo_dev OWNER marevlo;"
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

### Run tests

```bash
pytest tests/                    # 125 tests, ~100s
pytest tests/test_learning.py    # learning system
pytest tests/test_notifications.py
pytest tests/test_query_budgets.py  # N+1 regression check
pytest -k "audit"                # audit log
```

### Run smoke test (E2E)

```bash
python scripts/smoke_test.py
```

## AWS deployment (target: ap-south-1, 2k users)

### One-time AWS setup

1. **VPC** — note public subnet IDs and the VPC CIDR.
2. **RDS Postgres**: `db.t4g.micro`, 20 GB gp3, single-AZ. **Enable Performance Insights** (free for 7-day retention).
3. **ElastiCache Redis**: `cache.t4g.micro`, single-node.
4. **S3 bucket**: `marevlo-user-uploads-prod`. Block all public access. CORS for your frontend origin. **Enable versioning** + lifecycle to expire non-current versions after 90 days.
5. **ECR repository**: `marevlo-api`.
6. **ALB** with HTTPS listener (ACM cert). WebSocket idle timeout: 300s+.
7. **Secrets Manager**: `marevlo/prod` containing `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `FIREBASE_CREDENTIALS_JSON`, `SMTP_*`.
8. **SES**: verify `marevlo.com`, set up DKIM + SPF, request production access (24h).
9. **Sentry project**: get `SENTRY_DSN`.

### Required env vars

```bash
ENV=prod
JWT_SECRET=<from Secrets Manager>
DATABASE_URL=postgresql+psycopg2://marevlo:<pw>@<rds-endpoint>:5432/marevlo
REDIS_URL=redis://<elasticache-endpoint>:6379/0
S3_BUCKET=marevlo-user-uploads-prod
AWS_REGION=ap-south-1
CORS_ORIGINS=https://marevlo.com,https://marevlo.vercel.app
TRUSTED_PROXIES=10.0.0.0/16
LOG_FORMAT=json
SENTRY_DSN=<from Sentry>
SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
SMTP_USER=<from SES SMTP credentials>
SMTP_PASS=<from SES SMTP credentials>
SMTP_FROM=no-reply@marevlo.com
FIREBASE_CREDENTIALS_JSON=<from Secrets Manager>
```

### Bootstrap your first admin

```sql
UPDATE users SET is_admin = true WHERE email = 'you@marevlo.com';
```

### CloudWatch alarms (set on day 1)

- 5xx rate > 1% of requests for 5 minutes
- RDS CPU > 80% for 10 minutes
- RDS connection count > 50
- RDS free storage < 20%
- ECS task count < 1
- New rows in `security_events WHERE event_type = 'login_failure' > 100/min`
- New rows in `security_events WHERE event_type = 'suspicious_login' > 10/min`
- `db_slow_queries_total` increase > 50/min (Prometheus → CloudWatch via custom metric)

### Backups (mostly AWS configuration)

- RDS automated backups: retention 30 days (one click)
- S3 versioning + lifecycle (configured during setup above)
- Quarterly: restore latest snapshot to a test DB and run `python scripts/smoke_test.py` against it
- Every Alembic migration has an autogenerated `downgrade()` — test it on dev before applying to prod

### Cost estimate (2k users, 200 DAU, 50 concurrent)

| Item | Spec | $/month |
|---|---|---|
| ECS Fargate | 1 task × 0.5 vCPU × 1 GB | ~15 |
| RDS Postgres | db.t4g.micro single-AZ + 20GB gp3 | ~15 |
| ElastiCache Redis | cache.t4g.micro | ~11 |
| S3 + CloudFront | a few GB | ~2 |
| ALB + ACM | 1 ALB | ~18 |
| SES | first 62k emails free | 0 |
| Secrets Manager | 4 secrets | ~2 |
| **Total** | | **~$60–65** |

The Anthropic API for MIRA dwarfs this — your infra is essentially noise compared to inference.

## Test summary

```
$ pytest tests/ -q
125 passed in ~100s
```

| File | Tests | What it locks down |
|---|---|---|
| `test_auth.py` | 14 | login/logout/refresh + per-email rate limit on password reset |
| `test_ws_ticket.py` | 5 | one-shot tickets, can't be replayed, prod disables `?token=` |
| `test_feed.py` | 4 | post CRUD + N+1 regression (10 posts → ≤14 SQL stmts) |
| `test_chat.py` | 4 | DM flow + N+1 regression on chat list |
| `test_courses.py` | 3 | reaction toggle + comments |
| `test_profile.py` | 4 | profile + badges + stats |
| `test_submissions_security.py` | 4 | auth required + body `user_id` ignored |
| `test_moderation.py` | 15 | profanity, reports, blocks, admin queue, soft-delete |
| `test_audit_log.py` | 8 | login + logout + reset + block + admin write `security_events` |
| `test_idempotency.py` | 3 | same key = same row |
| `test_body_limit.py` | 2 | 11 MB body rejected, normal passes |
| `test_query_budgets.py` | 5 | feed/chat/problems/courses/admin lists O(1) |
| `test_learning.py` | 17 | enrollment idempotent, progress upsert + resume + completion one-way + course-mismatch reject + dashboard aggregation + dashboard query budget |
| `test_notifications.py` | 13 | comment/like trigger, self-actions filtered, mark-read flow, admin announcement fanout, report-resolved → reporter notification |
| `test_suspicious_login.py` | 6 | first login not flagged, repeat same-device not flagged, new UA flagged + audited, login succeeds even when email fails, password-changed email sent on reset |
| `test_file_validation.py` | 14 | magic-byte detection (JPEG/PNG/WebP/GIF/PDF), validate rejects lying Content-Type, Pillow re-encode strips metadata + downsizes huge images + rejects garbage |
| `test_observability.py` | 4 | `/metrics` emits valid Prometheus format, path templates collapse, slow-query logger fires + skips when threshold high |

E2E smoke test: **38 checks against real Postgres + Redis, all green.** Verified by inspection of the live tables after the run:
- `security_events` rows: 5 distinct event types written
- `notifications` rows: post_like + post_comment, self-actions correctly filtered
- `/metrics` endpoint returns 463 lines of valid Prometheus exposition

## Reviewer scorecard

Original 7.4/10 review:

| # | Reviewer concern | Status |
|---|---|---|
| 1 | Code grading is too weak | **Deferred** per your call |
| 2 | No admin/content management | **Deferred** per your call |
| 3 | No subscription/payment layer | **Deferred** per your call |
| 4 | Moderation is weak | ✅ 15 tests |
| 5 | `len(query.all())` for counting | ✅ Replaced with `func.count()` |
| 6 | WebSocket access token in query string | ✅ One-shot ticket flow |
| 7 | Tests couldn't be run | N/A — 125/125 pass |

Self-added improvements:

| Self-added | Tests |
|---|---|
| Per-email password-reset rate limiting | 2 |
| Body size limit middleware | 2 |
| Idempotency keys on POST endpoints | 3 |
| Security audit log + 8 emission points | 8 |
| CI N+1 query budget regression | 5 |

Items from your follow-up checklist built this round:

| Follow-up item | Status |
|---|---|
| User learning system (enrollment, progress, resume, notes, bookmarks, dashboard) | ✅ 17 tests |
| Notification system (in-app + transactional email + admin announcement) | ✅ 13 tests |
| Suspicious login alert | ✅ 6 tests |
| File upload malware/type validation | ✅ 14 tests |
| API latency metrics | ✅ Prometheus `/metrics` endpoint |
| DB slow query logs | ✅ SQLAlchemy event listener |

Items skipped per your direction: search system, content versioning, community discussion layer extensions, payments, real grader, admin CRUD. Decide when SJBIT signs.
# Marevlo-V1
