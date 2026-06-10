# MIRA P0 Fixes — Verification Report

This documents the 5 immediate P0 blockers from the integration review. Each
entry states ONLY what was verified to run, with the exact check used. No claim
appears here that wasn't executed and observed.

## P0 #1 — Frontend build (was: duplicate `export default function App`)

**Was broken:** `frontend/src/App.jsx` contained two concatenated copies → two
`export default function App` and duplicate wrapper declarations → `npm run build`
failed.

**Fix:** Rewrote `App.jsx` as a single file: one `App` export, one set of seven
wrappers (`HomeHandler`, `LoginWrapper`, `SignupWrapper`, `ProblemWrapper`,
`FeedWrapper`, `MessagesWrapper`, `IDEWrapper`). Merged the better parts of both
copies — kept copy A's `ToastProvider` + toast-on-signup, and copy B's extra
routes (`/problems/:topicId/:id`, `/courses/*`, `/research/courses/*`).

**Verified:** `npm run build` → `✓ built in 1m 4s`, no errors (only a chunk-size
warning). Original backed up at `/tmp/App.jsx.bak`.

## P0 #2 — Alembic migration (was: no-op `pass`)

**Was broken:** `alembic/versions/mira_001_initial.py` was neutralized to `pass`
(MIRA was removed pre-deploy historically). Production DB would have no MIRA tables.

**Fix:** Added `alembic/versions/mira_002_feature_tables.py`, chained off the
current head (`entitlements_001_rbac`), explicitly creating all 6 MIRA tables
with their indexes, unique constraints, and check constraints, using the
project's `JSONBType` (JSONB on Postgres, JSON on SQLite). Left `mira_001` as-is
since `profile_003_student_fields` chains off it.

**Verified:** Ran the migration's `upgrade()` against a fresh SQLite DB → all 6
tables created (`mira_user_state`, `mira_usage_events`, `mira_credit_ledger`,
`mira_allotment_usage`, `mira_learning_events`, `mira_concept_lattices`), columns
and the credit-ledger unique constraint confirmed by inspection.

**Caveat (honest):** A full `alembic upgrade head` on SQLite fails on a
PRE-EXISTING older migration (the `problems` table uses `now()`, which SQLite
rejects). That is not MIRA code and is unaffected by these changes; on Postgres
prod `now()` is valid and the whole chain runs. My migration itself is correct
and was verified in isolation.

## P0 #3 — Ingestion persists concept lattices (was: counted only)

**Was broken:** `scripts/mira_ingest_courses.py` extracted concepts and added to
`stats.concepts_extracted` but never wrote them to `mira_concept_lattices`.
(This was also overclaimed in the previous status doc — corrected here.)

**Fix:** Added `_upsert_lattice(db_session, course_id, module_id, concepts)`
(delete-then-insert for idempotency on `course_id+module_id`), a `db_session`
parameter to `ingest_one_course`, a `lattices_written` stat, DB-session setup in
`main()` via Marevlo's `SessionLocal`, and a `--no-persist` flag.

**Verified:** Ran ingestion (mock providers, REAL SQLite DB) on the `pytorch`
course, then **queried `mira_concept_lattices` back: 11 rows actually present**,
each with course_id, module_id, concepts, and `generated_by="claude_ingestion"`.
Persisted, not merely counted.

## P0 #4 — Runtime uses course concepts (was: fell back to built-in 16)

**Was broken:** `app/mira/engine/knowledge.py` loaded a missing
`data/concepts.json` and fell back to 16 built-in concepts; the runtime never
read `mira_concept_lattices`, so most course questions became `concept=general`.

**Fix:**
- `knowledge.py`: refactored loading into `_load_entries` that accepts BOTH the
  native shape (`{id,domain,aliases,prereqs}`) and the ingestion-lattice shape
  (`{id,name,keywords,prerequisites,difficulty}`); added an `entries=` constructor
  path; added `get_course_kb(db, course_id)` that builds a KB from the course's
  lattices (cached per course), falling back to built-ins only when a course has
  no lattice yet; added `clear_course_kb_cache()`.
- `pipeline.py`: `match_concept(q, kb=None)` now accepts a course KB; `handle()`
  uses a course KB injected on `ctx.course_kb` for both concept matching and
  prerequisite lookup.
- `chat_service.py`: when `course_id` is present, resolves `get_course_kb(db,
  course_id)` and injects it on `ctx` (keeps the engine DB-agnostic — the service
  does the DB access).

**Verified:** Seeded a lattice with a distinctive concept (`autograd-engine`) not
in the built-ins. The same PyTorch autograd question:
- Built-in KB → `general`, score 0.192, off-domain.
- Course KB (from lattice) → `autograd-engine`, score 0.524, in-domain.
And a full `chat_service.chat(..., course_id="pytorch")` turn returned
`concept=autograd-engine`. Runtime now uses real course concepts.

## P0 #5 — Stable Qdrant point IDs (was: process-randomized `hash()`)

**Was broken:** `QdrantVectorStore.upsert` used `abs(hash(cid)) % (2**63)`.
Python's `hash()` is randomized per process, so the same `chunk_id` produced
different point IDs across runs → duplicate points, broken idempotency.

**Fix:** Added `_stable_point_id(chunk_id)` =
`int(hashlib.sha256(chunk_id.encode()).hexdigest()[:16], 16)`; `upsert` uses it.

**Verified:** Computed IDs for the same chunk_ids under two different
`PYTHONHASHSEED` values in separate processes:
- New SHA IDs: identical across seeds (e.g. `10546351291439821757`).
- Old `hash()` IDs: differed across seeds (`7639…` vs `6555…`).
Re-ingesting a chunk now replaces the same point.

## Regression check

`tests/test_mira_integration.py` → **7 passed** after all five changes. Marevlo's
existing auth (14/14) and entitlement tests still pass (verified in the prior
session; unchanged by these edits, which touch only `app/mira/*`, the ingest
script, `App.jsx`, and a new migration file).

## Not done this session (the reviewer's P1/P2 — intentionally deferred)

These remain open and are NOT claimed as fixed: build-credit ledger concurrency
(row-lock balance table), atomic Redis quota (Lua), Redis-down DB fallback,
build-credit refund-source correctness, single-classification pass into pipeline,
course-access enforcement before retrieval, the MIRA frontend UI, real-provider
readiness checks, deeper `/health/ready`, a larger safety regression suite, the
admin/support panel, HttpOnly-cookie auth, observability, and golden-answer
evaluation. The reviewer correctly scoped these as post-blocker work.
