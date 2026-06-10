# MIRA-in-Marevlo Integration Status

MIRA is now a **feature inside Marevlo**, not a standalone SaaS. It plugs into
Marevlo's users, entitlements, and courses. This maps the integration review's
requirements to what's implemented.

Module: `Backend/app/mira/` — 24 Python files. Tests:
`Backend/tests/test_mira_integration.py` (7/7 passing). Existing Marevlo tests
(auth 14/14, entitlements) still pass — integration is non-breaking.

## P0 — done

| # | Requirement | Status | Where |
|---|-------------|--------|-------|
| 1 | Clear ownership split | ✅ | Marevlo owns auth/payments/courses/admin/entitlements. MIRA owns tutoring/safety/quota/credits/learning memory. No overlap. |
| 2 | MIRA uses Marevlo users | ✅ | All MIRA tables keyed by `users.id`; router uses `get_current_user`. No MIRA-owned users. Test: `test_mira_chat_runs_for_authenticated_marevlo_user` |
| 3 | MIRA reads Marevlo entitlements | ✅ | `app/mira/services/entitlement_bridge.py` reads `EntitlementService.has_active` / active entitlements → MIRA plan+quota. Test: `test_plan_reflects_marevlo_entitlement` (all_access → pro) |
| 4 | No duplicate payment system | ✅ | MIRA exposes NO auth/payment endpoints — verified by `test_no_standalone_auth_or_payment_endpoints`. When PayU lands in Marevlo, its webhook calls `EntitlementService.grant()` and MIRA sees the plan automatically. |
| 5 | Usage audit inside MIRA | ✅ | `mira_usage_events` table + `state_service.log_usage` per turn (request_id, course/lesson, concept, intent, tokens est/actual/charged, credit delta, provider, cost, latency). |
| 6 | Build credits as durable ledger | ✅ | `mira_credit_ledger` (Postgres source of truth), idempotent purchase, entitlement-period allotment in `mira_allotment_usage`. Test: `test_build_credit_ledger` |
| 7 | MIRA consumes Marevlo courses | ✅ | Ingestion pipeline (`scripts/mira_ingest_courses.py`) walks the real course HTML → chunks → concepts → `mira_concept_lattices`. Dry-run verified: **337 files, 6890 sections, 7227 chunks, 337 concept sets, 0 failures.** |
| 8 | Course-aware chat context | ✅ | `chat_service._course_context` pulls completed lessons from Marevlo `LessonProgress`; `/mira/course-context` endpoint. Chat accepts `course_id`/`lesson_id`. |
| 9 | Safety layer inside MIRA | ✅ | `app/mira/engine/safety.py` runs before generation (14 harmful categories + LLM hook). Test: `test_safety_gate_blocks_harmful` |
| 10 | Provider failure ≠ full quota | ✅ | `chat_service` reconcile: real=actual tokens, cache/golden=small, redirect=tiny, provider-failure/queued=0. |

## P1 — done

| # | Requirement | Status | Where |
|---|-------------|--------|-------|
| 11 | MIRA as internal feature API | ✅ | `app/mira/routers/mira.py`: `/mira/chat`, `/mira/profile`, `/mira/quota`, `/mira/course-context`, `/mira/feedback`, `/mira/practice-answer`. Auth via Marevlo middleware. |
| 13 | Learning evidence events | ✅ | `mira_learning_events` + `/mira/practice-answer` + `/mira/feedback`. Records correct/wrong/hints. Test: `test_practice_answer_records_mastery_evidence` (accuracy computed from real attempts). |
| 14 | Course-to-concept extraction | ✅ | `scripts/mira_ingest_courses.py` + `app/mira/claude/*` + `app/mira/retrieval/*` + `mira_concept_lattices`. Runs in dry-run with FakeEmbedder/MockClaude; real with ANTHROPIC+OPENAI keys. |
| 15 | Feedback loop | ✅ | `/mira/feedback` maps ratings (too_basic/too_advanced/wrong) to learning events that nudge style + mastery. |

## Remaining (gated or hardening)

- **#16 real-provider validation** — needs GPT/MiniMax/Qwen + ANTHROPIC/OPENAI
  keys. Pipeline is wired for both (MIRA_REAL=1); shape is proven via fakes.
- **#12 admin/support MIRA tools** — Marevlo admin should surface MIRA usage,
  credits, failed provider calls, manual grants. Not yet built into the admin
  router (the data is all in `mira_usage_events` / `mira_credit_ledger`).
- **#17 HttpOnly cookie auth** — belongs to Marevlo's auth layer; MIRA inherits it.
- **#18 structured logging / #19 observability dashboard** — usage data is
  captured durably; log middleware + dashboard are ops work.
- **#20 golden-answer evaluation** — needs the concept lattices populated from a
  real ingestion run (keys), then top-30 golden answers authored.

## Migration note

The MIRA tables are registered in `app/models_registry.py`, so Alembic
autogenerate will pick them up. Generate a migration after pulling:
`alembic revision --autogenerate -m "add mira tables"` then `alembic upgrade head`.

## Old standalone prototype

The pre-integration standalone MIRA (its own auth + PayU) was a separate
prototype tree and is NOT part of this Marevlo codebase. Marevlo owns auth and
payments; MIRA here carries no payment or auth code.
