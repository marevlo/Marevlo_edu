# Course Card → HTML Audit

**Scope:** every leaf "card" in [`src/pages/Courses.jsx`](src/pages/Courses.jsx) (`isLeaf: true`)
is routed to `/course/:id`, which loads `COURSE_HTML_MAP[id]` from
[`src/data/courseMap.js`](src/data/courseMap.js) and `fetch()`es that path from `public/`.
This audit resolves every mapping against the real files under `public/cources/`.

Machine-readable detail: `course_card_audit.json`.

## Headline

| Bucket | Count | Runtime behaviour |
|---|---:|---|
| ✅ Working (path resolves) | **30** | renders |
| 🔧 Fixable (content exists, **wrong path** in map) | **205** | "Module not found" → fix the path |
| ❌ Unavailable (no servable content) | **113** | "Module not found" |
| ⚠️ No mapping entry at all | **4** | "No content registered" |
| **Total leaf cards** | **330** | |

**Root cause of the 205:** `COURSE_HTML_MAP` was written against a folder tree that
doesn't exist on disk. The map says `…/generative-ai/RAG/…`, `…/Data_Science/DL/…`,
`…/LangGraph/…`; the real folders are `…/generative_Ai/rag-final/…`,
`…/deep_learning/…`, `…/generative_Ai/langgraph/…`. Only **Clustering (22)** and
**API Security (8)** were authored with paths that happen to match reality — hence the 30.

---

## 🔧 Fixable — content is on disk, only the path is wrong (205 cards)

These need a path rewrite only (full corrected paths are in `course_card_audit.json → corrected`).

| Family | Cards | Map path (wrong) | Real path |
|---|---:|---|---|
| Deep Learning `dl-module-*` + capstones | 33 | `/cources/Data_Science/DL/…` | `/cources/deep_learning/…` |
| Transformers | 25 | `/cources/generative-ai/Tranformers/…` | `/cources/generative_Ai/Tranformers/…` |
| Agentic AI — Atlas + tracks 0–4 | 44 | `/cources/generative-ai/Agentic-AI/…` | `/cources/generative_Ai/agentic_ai/…` |
| RAG tracks 0–9 | 37 | `/cources/generative-ai/RAG/track_*/…` | `/cources/generative_Ai/rag-final/track_*/…` |
| Stats & Probability (37 of 42) | 37 | `/cources/Data_Science/stats-prob/module_x_y.html` | `/cources/stats/module_x.y_<name>.html` |
| PyTorch (all 12) | 12 | `/cources/Data_Science/pytorch/moduleN_*.html` | `/cources/pytorch/module_N_*.html` (also renamed) |
| LLMOps | 9 | `/cources/generative-ai/LLMOPS/…` | `/cources/generative_Ai/LLMOPS/…` |
| LangGraph | 8 | `/cources/LangGraph/…` | `/cources/generative_Ai/langgraph/…` |
| Prompt Engineering+ | 4 | `…/Prompt_engineering_improved/Prompt_engineering_improved/…` | `…/generative_Ai/Prompt_engineering_improved/…` (no doubled dir) |

> Note: **Stats** and **PyTorch** also have *renamed files*, not just a moved folder, so
> they need per-file targets (already resolved in the JSON), not a blind folder swap.

---

## ❌ Unavailable — no servable content exists (113 cards)

### 1. RAG → Ingestion sub-tree — **85 cards, zero files** (largest gap)
The entire `RAG/Ingestion` and `RAG/quantisation` content was never added to `public/cources/`.

| Sub-course | Cards | IDs |
|---|---:|---|
| Document Layout Analysis | 18 | `dla-module-0 … 17` |
| OCR — Text | 14 | `ocr-text-module-0 … 13` |
| DIT (Document Image Transformer) | 12 | `dit-module-0 … 11` |
| InfoNCE | 12 | `infonce-module-0 … 11` |
| DocFormer | 10 | `docformer-module-1 … 10` |
| MFP | 5 | `mfp-module-0 … 4` |
| VMI | 4 | `vmi-module-0 … 3` |
| Quantisation | 4 | `quant-module-0 … 3` |
| Ingestion landing pages | 6 | `rag-ingestion`, `rag-ingestion-ocr`, `rag-ingestion-ocr-layout`, `rag-ingestion-ocr-text`, `rag-ingestion-dit`, `rag-ingestion-msp` |

### 2. Legacy Deep-Learning "with_examples" set — **13 cards** (superseded)
These point at old single-file DL pages (`CNN.html`, `GAN.html`, `NLP.html`, …) that don't
exist. The same topics are already covered by the working `dl-module-*` cards → **remove these cards**.
`dl-attention-transformers, dl-builder-guide, dl-classification, dl-cnn, dl-computational-performance, dl-gan, dl-gaussian-processes, dl-linear-regression, dl-nlp, dl-optimization-technique, dl-perceptron-ff, dl-preliminaries, dl-rnn`

### 3. Stats orphan slots — **5 cards**
The card grid assumes sub-modules the real 64-file `stats/` folder doesn't contain:
`module_1_7, module_2_6, module_2_7, module_3_7, module_3_8` → remove these 5 cards.

### 4. `/courses/*` typo targets — **3 cards** (folder never existed)
`prompt-engineering-0` → `/courses/Prompt_Engineering_Moduless.html`,
`video-processing-0` & `vectorless-rag` → `/courses/videoingestion.html`.

### 5. Content exists, but not as servable HTML — **6 cards**
| Card(s) | Issue | Real content |
|---|---|---|
| `ds-python` | mapped to `python.html` | `Python-Mastery-Course/` is 58 `.ipynb` |
| `matplotlib-fundamentals`, `matplotlib-advanced` | mapped to `.html` | `data-analysis/matplotlib/*.ipynb` |
| `mcp` | single `mcp/MCP.html` absent | real `mcp/` is a 31-module HTML course (unlinked) |
| `ml-module-1/2/3` | coarse 3-card grid | real `ml/track_*` is ~30 modules (different structure) |

---

## ⚠️ No mapping entry (4 cards) — "No content registered"
`numpy, pandas, matplotlib, seaborn` are leaf cards with **no key** in `COURSE_HTML_MAP`.
Their content exists only as notebooks under `data-analysis/`.

---

## Orphan content (exists on disk, but NO card points to it)
- **MCP** full course — 31 module HTML files (`mcp/track_0…5/`)
- **ML** full course — `ml/track_0…3/` (~30 modules)
- **Python Mastery** — 58 notebooks (9 tracks)
- **data-analysis** — numpy / pandas / seaborn notebooks
- PDF sets: `deep_learning/optimizers`, `scholar use case`, `*/worked_by_hand`, `rag-final/Marevlo_Production_RAG_Course`

---

## Recommended actions (in priority order)
1. **Re-map the 205 fixable cards** — mechanical path rewrite (corrected paths in `course_card_audit.json`). Restores the bulk of the catalog. *(Note the `.ipynb`/iframe viewer only renders HTML — does not affect these 205, all HTML.)*
2. **Remove or hide the 113 unavailable cards** (or gate them behind a "coming soon" flag) so users never hit "Module not found":
   - Delete the RAG-Ingestion sub-tree (85), legacy DL set (13), stats orphan slots (5), `/courses/*` cards (3).
   - Decide product intent for the 6 "exists-but-not-HTML" + add `numpy/pandas/seaborn/matplotlib` mappings (or convert notebooks to HTML).
3. **Wire up the orphan MCP & ML courses** — content is authored but unreachable; add cards.
4. **Add a CI guard**: a test that asserts every `COURSE_HTML_MAP` value resolves to a file in `public/` (the script behind this audit). Prevents regression.
