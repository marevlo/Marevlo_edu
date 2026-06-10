# Marevlo — Research Section Architecture Overview

## Overview

The Research section is a self-contained frontend feature with **three pillars**: a Research Hub landing page, a curated Research Papers library, and structured Research Courses. All content is stored as **static HTML files** in the frontend's public directory — there is no backend API or database for research content.

---

## System Architecture

```
Browser (React + React Router)
    │
    └── /research  ──→  Research.jsx (Hub landing page)
            │
            ├── /research/papers  ──→  ResearchPapers.jsx (Paper catalog)
            │       └── /research/paper/:slug  ──→  ResearchPaperContent.jsx
            │               └── <iframe src={PAPER_HTML_MAP[slug]}>
            │                       └── fetches /ResearchPapers/{slug}.html
            │
            ├── /research/courses  ──→  ResearchCourses.jsx (Course catalog)
            │       └── /research/course/:id  ──→  ResearchCourseContent.jsx
            │               └── full-document mode: <iframe src={RESEARCH_HTML_MAP[id]}>
            │                       └── fetches /Research-courses/{track}/{file}.html
            │
            └── /research/track/recommender-system  ──→  T3TrackLanding.jsx
```

---

## Route Definitions

| Route | Component | Purpose |
|-------|-----------|---------|
| `/research` | `Research.jsx` | Hub landing — links to Papers, Courses, and live room topics |
| `/research/papers` | `ResearchPapers.jsx` | Filterable/searchable paper catalog |
| `/research/paper/:slug` | `ResearchPaperContent.jsx` | Single paper viewer (iframe) |
| `/research/courses` | `ResearchCourses.jsx` | Course catalog with module listings |
| `/research/course/:id` | `ResearchCourseContent.jsx` | Single lesson viewer (mode-based: full-document iframe or wrapped parsed content) |
| `/research/track/recommender-system` | `T3TrackLanding.jsx` | Recommender System track landing page |

All components are **lazy-loaded** via `React.lazy()` in `App.jsx`.

---

## Part 1 — Research Hub (`Research.jsx`)

The main landing page at `/research` presents three sections:

| Section | Label | Description | Navigation |
|---------|-------|-------------|------------|
| Part 01 | **Courses** | Research-track structured learning | → `/research/courses` |
| Part 02 | **Research Papers** | Curated paper library | → `/research/papers` |
| Part 03 | **The Frequency** | Live research discussion rooms | In-page display (7 topic rooms) |

### The Frequency — Live Room Topics

| Room | Topic Area |
|------|-----------|
| The Foundation Models | Core LLM architectures |
| Memory & Retrieval | Agent memory, vector search |
| The Agent Stack | Agentic AI systems |
| Seeing & Generating | Multimodal / generative |
| The Alignment Problem | Safety & alignment |
| Reasoning Machines | Chain-of-thought, planning |
| The Efficiency Lab | Optimization, quantization |

### UI Features
- Animated gradient cards with glow effects
- Component preloading on hover (ResearchCourses)
- Keyboard-accessible navigation
- Dark theme with purple/amber/green accent palette

---

## Part 2 — Research Papers

### Storage: Static HTML Files

```
frontend/public/ResearchPapers/
├── adapt.html           # Adaptation of Agentic AI
├── budgetmem.html       # BudgetMem — Budget-Tier Routing for Agent Memory
├── diskann (1).html     # DiskANN
├── dytopo (1).html      # DyTopo
├── experts (1).html     # Multi-Agent Teams Hold Experts Back
├── graphmem.html        # Graph-based Agent Memory
├── hnsw (1).html        # HNSW — Hierarchical Navigable Small World
├── orch (1).html        # ORCH — Many Analyses, One Merge
├── procmem (1).html     # ProcMEM — Learning Reusable Procedural Memory
└── roma (1).html        # ROMA — Recursive Open Meta-Agent Framework
```

### Paper Metadata Structure (`ResearchPapers.jsx`)

Papers are defined as an in-component array — no database or API:

```jsx
const PAPERS = [
  {
    id: 1,
    title: 'BudgetMem — Query-Aware Budget-Tier Routing for Runtime Agent Memory',
    authors: ['Zhang, Y.', 'Liu, X.', 'Wang, Z.'],
    year: 2026,
    venue: 'arXiv',
    tags: ['Agentic AI', 'AI'],
    abstract: '...',
    slug: 'budgetmem',          // maps to HTML file via PAPER_HTML_MAP
    stars: 92,
    color: '#8b5cf6'
  },
  // ... 10 total papers
];
```

### Paper HTML Map (`ResearchPaperContent.jsx`)

```jsx
const PAPER_HTML_MAP = {
  budgetmem: '/ResearchPapers/budgetmem.html',
  diskann:   '/ResearchPapers/diskann%20(1).html',
  dytopo:    '/ResearchPapers/dytopo%20(1).html',
  graphmem:  '/ResearchPapers/graphmem.html',
  experts:   '/ResearchPapers/experts%20(1).html',
  hnsw:      '/ResearchPapers/hnsw%20(1).html',
  orch:      '/ResearchPapers/orch%20(1).html',
  procmem:   '/ResearchPapers/procmem%20(1).html',
  roma:      '/ResearchPapers/roma%20(1).html',
  adapt:     '/ResearchPapers/adapt.html',
};
```

### Paper Catalog Features (`ResearchPapers.jsx`)

| Feature | Implementation |
|---------|---------------|
| **Full-text search** | `Ctrl+K` shortcut, matches title, authors, topics |
| **Tag filtering** | 9 tag categories with multi-select |
| **Year filtering** | Range: 2018–2026 |
| **Sorting** | Newest, Oldest, Top Rated, A→Z |
| **Bookmarking** | Persisted in `localStorage` |
| **Status tracking** | Three states: To Read → Reading → Done |
| **Stats dashboard** | Total Papers, Bookmarked, Reading, Completed |

### Tag Color Map

```jsx
const TAG_COLORS = {
  'RL':                     '#6366f1',
  'gen AI':                 '#f59e0b',
  'Agentic AI':             '#8b5cf6',
  'Software Engineering':   '#06b6d4',
  'AI':                     '#ec4899',
  // ... 4 more categories
};
```

### Status Options

```jsx
const STATUS_OPTIONS = [
  { key: 'to-read',  label: 'To Read',  color: '#f59e0b', Icon: Circle },
  { key: 'reading',  label: 'Reading',  color: '#06b6d4', Icon: Clock },
  { key: 'done',     label: 'Done',     color: '#10b981', Icon: CheckCircle2 },
];
```

### Paper Rendering Flow

```
/research/papers                        → ResearchPapers.jsx
  ├─ Renders PAPERS array as filterable cards
  ├─ localStorage stores bookmarks + reading status
  └─ Click paper card → navigates to /research/paper/:slug

/research/paper/:slug                   → ResearchPaperContent.jsx
  ├─ htmlFile = PAPER_HTML_MAP[slug]
  └─ Render as <iframe src={htmlFile}>   ← static file from /public/ResearchPapers/
```

### Research Paper HTML Structure

Each paper HTML file is self-contained with:

```css
:root {
  --bg: #07090c;
  --bg-raise: #0d1117;
  --surf: rgba(255,255,255,0.025);
  --line: rgba(255,255,255,0.07);
  --ink: #f1f1f6;
  --c-amber: #f3c969;
  --c-sky: #67a3d9;
  --c-iris: #a38bfa;
  --grad-spine: linear-gradient(90deg, #f3c969 0%, #67a3d9 35%, #a38bfa 65%, #f0729a 90%);
  --max: 1180px;
  --reading: 760px;
}
```

**Key elements per paper HTML:**
- Reading progress bar (gradient-filled, tracks scroll position)
- Fixed navigation header with paper citation
- Hero section with title, metadata, and abstract
- KaTeX math rendering for equations
- Responsive layout with `max-width` constraints
- Dark theme consistent with the app

---

## Part 3 — Research Courses

### Storage: Static HTML Files

```
frontend/public/Research-courses/
├── Agentic Search/                          # Track 1 — 7 modules
│   ├── M0_what_makes_search_agentic.html
│   ├── M1_search_tool_design.html
│   ├── M2_multi_step_retrieval_planning.html
│   ├── M3_web_search_integration.html
│   ├── M4_structured_and_code_search.html
│   ├── M5_search_evaluation_and_reliability.html
│   └── M6_production_agentic_search_systems.html
│
├── Context engineering/
│   └── Context engineering/                 # Track 2 — 9 modules
│       ├── T2_M0_context_window_as_resource.html
│       ├── T2_M1_information_architecture.html
│       ├── T2_M2_dynamic_context_assembly.html
│       ├── T2_M3_system_prompt_engineering.html
│       ├── T2_M4_few_shot_in_context_learning.html
│       ├── T2_M5_memory_systems.html
│       ├── T2_M6_multimodal_context.html
│       ├── T2_M7_context_for_agents_and_tools.html
│       └── T2_M8_evaluation_and_optimization.html
│
└── Recommender system/                      # Track 3 — 14 modules + 14 deep-dives
    ├── T3_M0_the_recommendation_problem.html
    ├── T3_M0_DEEP_formal_foundations.html
    ├── T3_M1_baselines_and_content_based.html
    ├── T3_M1_DEEP_baselines_math.html
    ├── T3_M2_collaborative_filtering_neighborhood.html
    ├── T3_M2_DEEP_cf_neighborhood_math.html
    ├── T3_M3_matrix_factorization.html
    ├── T3_M3_DEEP_matrix_factorization_derivation.html
    ├── T3_M4_deep_collaborative_filtering.html
    ├── T3_M4_DEEP_deep_cf_derivations.html
    ├── T3_M5_sequential_and_session_based.html
    ├── T3_M5_DEEP_sequential_derivations.html
    ├── T3_M6_context_aware_ctr.html
    ├── T3_M6_DEEP_ctr_derivations.html
    ├── T3_M7_system_design.html
    ├── T3_M7_DEEP_system_design_math.html
    ├── T3_M8_graph_based_recsys.html
    ├── T3_M8_DEEP_gnn_derivations.html
    ├── T3_M9_knowledge_aware_recsys.html
    ├── T3_M9_DEEP_knowledge_graph_math.html
    ├── T3_M10_llms_in_recsys.html
    ├── T3_M10_DEEP_llm_recsys_math.html
    ├── T3_M11_generative_recsys.html
    ├── T3_M11_DEEP_generative_recsys_math.html
    ├── T3_M12_agentic_conversational_recsys.html
    ├── T3_M12_DEEP_agentic_math.html
    ├── T3_M13_evaluation_responsible_deployment.html
    ├── T3_M13_DEEP_evaluation_math.html
    ├── T3_Recommender_Systems_Track_Plan.html
    └── T3_Track_Landing_Page.html
```

**Total: 46 HTML files** (7 + 9 + 30)

### Course Catalog Data (`ResearchCourses.jsx`)

Three research tracks defined as an in-component array:

```jsx
const RESEARCH_COURSES = [
  {
    id: 'agentic-search',
    num: '01',
    label: 'Agentic Search',
    topic: 'Agentic AI',
    tagline: 'AI-Powered Retrieval',
    description: '...',
    icon: Search,
    accentPrimary: '#6366f1',
    accentSecondary: '#818cf8',
    bgGradient: 'linear-gradient(...)',
    modules: [
      { id: 'as-m0', label: 'What Makes Search Agentic?', level: 'Beginner', duration: '~25m' },
      { id: 'as-m1', label: 'Search Tool Design',         level: 'Beginner', duration: '~25m' },
      // ... 7 total modules
    ]
  },
  {
    id: 'context-engineering',
    num: '02',
    label: 'Context Engineering',
    topic: 'Agentic AI',
    accentPrimary: '#8b5cf6',
    modules: [/* 9 modules: ce-m0 .. ce-m8 */]
  },
  {
    id: 'recommender-system',
    num: '03',
    label: 'Recommender System',
    topic: 'Agentic AI',
    accentPrimary: '#7c3aed',
    modules: [/* 14 modules: rs-m0 .. rs-m13  (each has optional deep-dive) */]
  }
];
```

### Course HTML Map (`ResearchCourseContent.jsx`)

Maps every module ID to its static HTML file path (29 entries + 14 deep-dives):

```jsx
const RESEARCH_HTML_MAP = {
  // Agentic Search — 7 modules
  'as-m0': '/Research-courses/Agentic Search/M0_what_makes_search_agentic.html',
  'as-m1': '/Research-courses/Agentic Search/M1_search_tool_design.html',
  'as-m2': '/Research-courses/Agentic Search/M2_multi_step_retrieval_planning.html',
  'as-m3': '/Research-courses/Agentic Search/M3_web_search_integration.html',
  'as-m4': '/Research-courses/Agentic Search/M4_structured_and_code_search.html',
  'as-m5': '/Research-courses/Agentic Search/M5_search_evaluation_and_reliability.html',
  'as-m6': '/Research-courses/Agentic Search/M6_production_agentic_search_systems.html',

  // Context Engineering — 9 modules
  'ce-m0': '/Research-courses/Context engineering/Context engineering/T2_M0_context_window_as_resource.html',
  'ce-m1': '/Research-courses/Context engineering/Context engineering/T2_M1_information_architecture.html',
  // ... ce-m2 through ce-m8

  // Recommender System — 14 base + 14 deep-dive
  'rs-m0':      '/Research-courses/Recommender system/T3_M0_the_recommendation_problem.html',
  'rs-m0-deep': '/Research-courses/Recommender system/T3_M0_DEEP_formal_foundations.html',
  // ... rs-m1 through rs-m13 (each with -deep variant)
};
```

### Rendering Modes (Critical)

`ResearchCourseContent.jsx` supports two rendering modes:

1. **Full-document mode (native lesson layout)**
  - Triggered when module ID is in `FULL_DOCUMENT_MODULES`
  - Renders only:
    - `<iframe src={RESEARCH_HTML_MAP[id]}>`
  - Used when lesson HTML already has its own complete shell (sidebar/header/progress UI)

2. **Wrapped mode (app chrome + parsed body)**
  - Used only when module ID is not in `FULL_DOCUMENT_MODULES`
  - App renders its own sidebar/topbar/module cards, then injects parsed lesson body

Current policy in this repo:
- Agentic Search (`as-m0` ... `as-m6`) uses full-document mode
- Context Engineering (`ce-m0` ... `ce-m8`) uses full-document mode
- Recommender System base + deep (`rs-m0` ... `rs-m13`, `rs-m0-deep` ... `rs-m13-deep`) uses full-document mode

This policy is intentional and should be preserved unless explicitly changed.

### Course Config Metadata (`ResearchCourseContent.jsx`)

Each lesson has a config object for navigation context:

```jsx
const RESEARCH_COURSE_CONFIGS = {
  'as-m0': {
    courseId: 'agentic-search',
    courseLabel: 'Agentic Search',
    title: 'What Makes Search Agentic?',
    duration: '~25m',
    level: 'Beginner',
    siblings: ['as-m0', 'as-m1', 'as-m2', 'as-m3', 'as-m4', 'as-m5', 'as-m6']
  },
  // ... configs for all 30+ lessons
};
```

### Level Color Scheme

```jsx
const LEVEL_COLORS = {
  Beginner:     { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.3)' },
  Intermediate: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  Advanced:     { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
};
```

### Static Lesson HTML Theme Contract (Important)

Research lesson HTML files are self-contained and may define their own CSS variables inside each file.
To keep lesson pages visually consistent with the outer Research UI, track-level accent palettes must stay aligned:

| Track | `--accent` | `--accent-2` | Glow RGB literal |
|------|------------|--------------|------------------|
| Agentic Search | `#818cf8` | `#6366f1` | `99,102,241` |
| Context Engineering | `#a78bfa` | `#8b5cf6` | `139,92,246` |
| Recommender System | `#a78bfa` | `#7c3aed` | `124,58,237` |

### Theme Regression Checklist (Static HTML)

Before merging styling changes for Research course HTML files:

1. Verify no lesson HTML still uses legacy amber accents (`#d4a574`, `#b8895a`, `212,165,116`) unless explicitly intended.
2. Verify a sample lesson from each track renders with the track palette above.
3. Confirm contrast/readability remains acceptable for headings, callouts, links, and code blocks.
4. Keep layout/content untouched when doing palette-only updates (color token changes only).
5. Re-check full-document iframe modules at:
  - `/research/course/as-m0`
  - `/research/course/ce-m0`
  - `/research/course/rs-m0`

### Course Rendering Flow

```
/research/courses                           → ResearchCourses.jsx
  ├─ Renders 3 track cards from RESEARCH_COURSES array
  ├─ Each card expands to show module list
  └─ Click module → navigates to /research/course/:id

/research/course/:id                        → ResearchCourseContent.jsx
  ├─ config = RESEARCH_COURSE_CONFIGS[id]
  ├─ htmlFile = RESEARCH_HTML_MAP[id]
  ├─ if id ∈ FULL_DOCUMENT_MODULES:
  │    └─ render full-page <iframe src={htmlFile}>   ← native HTML shell from /public/Research-courses/
  └─ else:
       ├─ render app sidebar/topbar + sibling module cards
       ├─ fetch + parse lesson body content
       └─ render wrapped lesson with Prev/Next navigation
```

### Recommender System Track Landing

The Recommender System track has a dedicated landing page at `/research/track/recommender-system` rendered by `T3TrackLanding.jsx`, providing an overview of the 14-module + deep-dive curriculum.

---

## Key Frontend Structures Summary

| Structure | File | Purpose |
|-----------|------|---------|
| `PAPERS` | `ResearchPapers.jsx` | Array of 10 paper metadata objects (title, authors, tags, slug, etc.) |
| `PAPER_HTML_MAP` | `ResearchPaperContent.jsx` | Maps paper slug → `/ResearchPapers/{slug}.html` (10 entries) |
| `RESEARCH_COURSES` | `ResearchCourses.jsx` | Array of 3 track objects, each with module definitions |
| `RESEARCH_HTML_MAP` | `ResearchCourseContent.jsx` | Maps module ID → `/Research-courses/{track}/{file}.html` (44 entries) |
| `FULL_DOCUMENT_MODULES` | `ResearchCourseContent.jsx` | Declares which module IDs must render in native full-document iframe mode |
| `RESEARCH_COURSE_CONFIGS` | `ResearchCourseContent.jsx` | Per-lesson metadata: title, duration, level, sibling navigation |
| `TAG_COLORS` | `ResearchPapers.jsx` | Color map for 9 paper tag categories |
| `STATUS_OPTIONS` | `ResearchPapers.jsx` | Reading status definitions (To Read / Reading / Done) |
| `LEVEL_COLORS` | `ResearchCourseContent.jsx` | Color scheme for Beginner/Intermediate/Advanced levels |

---

## File Inventory

| Area | Files | Type | Location |
|------|-------|------|----------|
| Research Papers | 10 | Static HTML | `frontend/public/ResearchPapers/` |
| Agentic Search | 7 | Static HTML | `frontend/public/Research-courses/Agentic Search/` |
| Context Engineering | 9 | Static HTML | `frontend/public/Research-courses/Context engineering/Context engineering/` |
| Recommender System | 30 | Static HTML | `frontend/public/Research-courses/Recommender system/` |
| **Total HTML files** | **56** | | |

| Page Component | File |
|----------------|------|
| Research Hub | `src/pages/Research.jsx` |
| Paper Catalog | `src/pages/ResearchPapers.jsx` |
| Paper Viewer | `src/pages/ResearchPaperContent.jsx` |
| Course Catalog | `src/pages/ResearchCourses.jsx` |
| Course Viewer | `src/pages/ResearchCourseContent.jsx` |
| RecSys Track Landing | `src/pages/T3TrackLanding.jsx` |

---

## Adding New Content

### Adding a New Research Paper

1. Place the HTML file in `frontend/public/ResearchPapers/`
2. Add a metadata entry to the `PAPERS` array in `ResearchPapers.jsx`
3. Add a slug → path mapping in `PAPER_HTML_MAP` in `ResearchPaperContent.jsx`

### Adding a New Research Course Module

1. Place the HTML file in the appropriate `frontend/public/Research-courses/{track}/` folder
2. Add a module entry to the track's `modules` array in `ResearchCourses.jsx`
3. Add an ID → path mapping in `RESEARCH_HTML_MAP` in `ResearchCourseContent.jsx`
4. Add a config entry in `RESEARCH_COURSE_CONFIGS` in `ResearchCourseContent.jsx`
5. If the lesson HTML has its own complete page shell (recommended for Research tracks), add the module ID to `FULL_DOCUMENT_MODULES`

### Regression Prevention Checklist (Required)

Before merging any new/edited research module mapping:

1. Open `/research/course/:id` and verify the lesson appears as native full-page HTML (not wrapped in the app content shell)
2. Confirm the module ID is present in both `RESEARCH_HTML_MAP` and `FULL_DOCUMENT_MODULES`
3. Confirm the path resolves to the expected file under `frontend/public/Research-courses/...`
4. Confirm module labels match lesson title and filename intent across:
  - `ResearchCourses.jsx`
  - `ResearchCourseContent.jsx` (`RESEARCH_COURSE_CONFIGS` + `MODULE_LABELS`)

### Adding a New Research Track

1. Create a new folder under `frontend/public/Research-courses/`
2. Add HTML files for each module
3. Add a track object to `RESEARCH_COURSES` in `ResearchCourses.jsx`
4. Add all module mappings to `RESEARCH_HTML_MAP`
5. Add all module configs to `RESEARCH_COURSE_CONFIGS`
6. Add all module IDs to `FULL_DOCUMENT_MODULES` when using native full-page lesson HTML
7. Optionally add a track landing page and route in `App.jsx`

---

## Comparison: Courses vs Research

| Aspect | Main Courses | Research Section |
|--------|-------------|-----------------|
| Content location | `public/cources/` | `public/Research-courses/` + `public/ResearchPapers/` |
| Content map | `COURSE_HTML_MAP` (~130 entries) | `RESEARCH_HTML_MAP` (44) + `PAPER_HTML_MAP` (10) |
| Tree structure | `COURSE_TREE` (nested folders/cards) | Flat track → module hierarchy |
| Rendering | iframe or parsed HTML | Mode-based: full-document iframe (default for current tracks) with wrapped parsed fallback |
| Interactive code blocks | Yes (`<python>`, `<sql>`, `<code>` tags) | No (papers are read-only) |
| Backend dependency | None | None |
| Search/filter | No | Yes (papers: tags, years, text search) |
| Reading status | No | Yes (papers: To Read / Reading / Done) |
| Bookmarking | No | Yes (papers, localStorage) |
| Deep-dive layers | No | Yes (Recommender System: base + DEEP variants) |
