PRODUCTION RAG — a Marevlo course
Building Retrieval-Augmented Generation Systems That Survive Real Users

Read the modules in numbered order. Each is a standalone PDF.

PART I — FOUNDATIONS
  Module 00  Why Most RAG Projects Fail        (the 35-fault field guide + diagnostic tree)
  Module 02  Loading & Chunking               (cutting documents into the right pieces)
  Module 03  Embeddings                       (the "meaning fingerprint")
  Module 04  Vector Databases                 (storing & searching; 10 faults)
  Module 05  Building a Basic RAG System       (the query pipeline; the prompt)

PART II — MAKING IT WORK
  Module 06  Debugging RAG                    (print-the-chunks-first; the diagnostic)
  Module 07  Hybrid Search & Token Budgeting   (exact-term recall; controlled context)
  Module 08  Observability                    (tracing, metrics, feedback, the eval set)
  Module 09  Optimization                     (the ladder; query rewriting; re-ranking)

PART III — PRODUCTION
  Module 10  Scaling & the Real Costs of Vector Search

NOT YET BUILT (the remaining gaps in the full outline):
  Module 01  RAG Fundamentals & Architecture   (the two pipelines, end to end)
  Module 11  Production Hosting (Postgres/pgvector)
  Module 12/13  Production Project + Security  (LangGraph + FastAPI + the security layer)
  (Advanced RAG, originally Modules 14-15, was deliberately dropped.)

NOTE ON CODE: every code example is original, built around one running
example (a fictional coffee-machine manual). Library import paths and
specific method signatures are version-sensitive and should be verified
against your pinned stack before going live. A single consolidated
verification pass across all code-bearing modules is recommended.
