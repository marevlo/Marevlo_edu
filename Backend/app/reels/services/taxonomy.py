"""Canonical reels taxonomy — single source of truth.

Format: (slug, name, kind, parent_slug)
  kind: "topic" (browsable area) | "concept" (specific technique, parented
        to a topic so rails and search can roll concepts up).

Imported by ReelService.seed_topics() (idempotent — inserts only missing
slugs) and mirrored literally in migration reels_v2_0003. Extend here, then
either re-run seed_topics or add rows to reel_topics directly.
"""

TAXONOMY = [
    # ── DSA topics ──────────────────────────────────────────────
    ("arrays", "Arrays", "topic", None),
    ("strings", "Strings", "topic", None),
    ("linked-list", "Linked list", "topic", None),
    ("stacks-queues", "Stacks & queues", "topic", None),
    ("hashing", "Hashing & hash maps", "topic", None),
    ("recursion", "Recursion", "topic", None),
    ("sorting", "Sorting", "topic", None),
    ("searching", "Searching", "topic", None),
    ("trees", "Trees & BSTs", "topic", None),
    ("heaps", "Heaps & priority queues", "topic", None),
    ("graphs", "Graphs", "topic", None),
    ("dynamic-programming", "Dynamic programming", "topic", None),
    ("greedy", "Greedy", "topic", None),
    ("backtracking", "Backtracking", "topic", None),
    ("bit-manipulation", "Bit manipulation", "topic", None),
    ("math-for-dsa", "Math & number theory", "topic", None),
    ("matrix", "Matrix / 2-D grids", "topic", None),
    ("intervals", "Intervals", "topic", None),
    ("tries", "Tries", "topic", None),
    ("advanced-data-structures", "Segment & Fenwick trees", "topic", None),

    # ── DSA concepts ────────────────────────────────────────────
    ("two-pointers", "Two pointers", "concept", "arrays"),
    ("sliding-window", "Sliding window", "concept", "arrays"),
    ("prefix-sums", "Prefix sums", "concept", "arrays"),
    ("kadanes-algorithm", "Kadane's algorithm", "concept", "dynamic-programming"),
    ("memoization", "Memoization", "concept", "dynamic-programming"),
    ("tabulation", "Tabulation", "concept", "dynamic-programming"),
    ("knapsack-patterns", "Knapsack patterns", "concept", "dynamic-programming"),
    ("lcs-patterns", "LCS / string DP", "concept", "dynamic-programming"),
    ("binary-search", "Binary search", "concept", "searching"),
    ("bfs", "Breadth-first search", "concept", "graphs"),
    ("dfs", "Depth-first search", "concept", "graphs"),
    ("topological-sort", "Topological sort", "concept", "graphs"),
    ("dijkstra", "Dijkstra & shortest paths", "concept", "graphs"),
    ("union-find", "Union-Find / DSU", "concept", "graphs"),
    ("monotonic-stack", "Monotonic stack", "concept", "stacks-queues"),
    ("fast-slow-pointers", "Fast & slow pointers", "concept", "linked-list"),
    ("divide-and-conquer", "Divide & conquer", "concept", "sorting"),
    ("tree-traversals", "Tree traversals", "concept", "trees"),

    # ── CS / general topics ─────────────────────────────────────
    ("python", "Python", "topic", None),
    ("sql-databases", "SQL & databases", "topic", None),
    ("system-design", "System design", "topic", None),
    ("oops", "OOP concepts", "topic", None),

    # ── Software engineering topics (third browser section) ─────
    ("frontend", "Frontend", "topic", None),
    ("backend", "Backend", "topic", None),
    ("cybersecurity", "Cybersecurity", "topic", None),
    ("networking", "Networking", "topic", None),
    ("docker-containers", "Docker & containers", "topic", None),
    ("kubernetes", "Kubernetes", "topic", None),
    ("cloud-computing", "Cloud computing", "topic", None),
    ("devops-cicd", "DevOps & CI/CD", "topic", None),
    ("git-version-control", "Git & version control", "topic", None),
    ("linux-shell", "Linux & shell", "topic", None),
    ("apis-microservices", "APIs & microservices", "topic", None),
    ("testing-qa", "Testing & QA", "topic", None),
    ("mobile-development", "Mobile development", "topic", None),

    # ── Data science / AI topics ────────────────────────────────
    ("machine-learning", "Machine learning", "topic", None),
    ("deep-learning", "Deep learning", "topic", None),
    ("nlp", "NLP", "topic", None),
    ("computer-vision", "Computer vision", "topic", None),
    ("generative-ai", "Generative AI", "topic", None),
    ("llms", "LLMs", "topic", None),
    ("reinforcement-learning", "Reinforcement learning", "topic", None),
    ("recommender-systems", "Recommender systems", "topic", None),
    ("agentic-ai", "Agentic AI", "topic", None),
    ("rag", "RAG", "topic", None),
    ("time-series", "Time series", "topic", None),
    ("statistics-probability", "Statistics & probability", "topic", None),
    ("data-analysis", "Data analysis (EDA)", "topic", None),
    ("data-engineering", "Data engineering", "topic", None),
    ("mlops", "MLOps", "topic", None),

    # ── Data science / AI concepts ──────────────────────────────
    ("gradient-descent", "Gradient descent", "concept", "machine-learning"),
    ("regularization", "Regularization", "concept", "machine-learning"),
    ("bias-variance-tradeoff", "Bias–variance tradeoff", "concept", "machine-learning"),
    ("feature-engineering", "Feature engineering", "concept", "machine-learning"),
    ("model-evaluation", "Model evaluation & metrics", "concept", "machine-learning"),
    ("ensemble-methods", "Ensembles & boosting", "concept", "machine-learning"),
    ("clustering", "Clustering", "concept", "machine-learning"),
    ("dimensionality-reduction", "Dimensionality reduction", "concept", "machine-learning"),
    ("backpropagation", "Backpropagation", "concept", "deep-learning"),
    ("cnns", "CNNs", "concept", "deep-learning"),
    ("rnns-lstms", "RNNs & LSTMs", "concept", "deep-learning"),
    ("transformers", "Transformers", "concept", "deep-learning"),
    ("attention-mechanism", "Attention mechanism", "concept", "deep-learning"),
    ("optimizers", "Optimizers (SGD/Adam)", "concept", "deep-learning"),
    ("embeddings", "Embeddings", "concept", "nlp"),
    ("tokenization", "Tokenization", "concept", "nlp"),
    ("fine-tuning", "Fine-tuning", "concept", "llms"),
    ("prompt-engineering", "Prompt engineering", "concept", "llms"),
    ("context-windows", "Context & memory", "concept", "llms"),
    ("vector-databases", "Vector databases", "concept", "rag"),
    ("chunking-strategies", "Chunking strategies", "concept", "rag"),
    ("retrieval-reranking", "Retrieval & re-ranking", "concept", "rag"),
    ("q-learning", "Q-learning", "concept", "reinforcement-learning"),
    ("policy-gradients", "Policy gradients", "concept", "reinforcement-learning"),
    ("multi-agent-systems", "Multi-agent systems", "concept", "reinforcement-learning"),
    ("tool-calling", "Tool / function calling", "concept", "agentic-ai"),
    ("agent-orchestration", "Agent orchestration", "concept", "agentic-ai"),
    ("collaborative-filtering", "Collaborative filtering", "concept", "recommender-systems"),
    ("ranking-models", "Ranking & retrieval models", "concept", "recommender-systems"),
    ("forecasting-models", "Forecasting models", "concept", "time-series"),
    ("hypothesis-testing", "Hypothesis & A/B testing", "concept", "statistics-probability"),
    ("probability-distributions", "Probability distributions", "concept", "statistics-probability"),
]


# Topics with a practice-problem bank behind them. "Practice similar
# problems" CTAs route only for these; everything else (ML, GenAI, agentic
# AI, RAG, …) resolves to MIRA — no redirect, the conversation continues
# in place.
PRACTICE_TOPIC_SLUGS = {
    "arrays", "strings", "linked-list", "stacks-queues", "hashing",
    "recursion", "sorting", "searching", "trees", "heaps", "graphs",
    "dynamic-programming", "greedy", "backtracking", "bit-manipulation",
    "math-for-dsa", "matrix", "intervals", "tries",
    "advanced-data-structures", "python", "sql-databases",
}


# Section grouping for the Reels browser (floater panel shows exactly two
# sections). Anything not listed here — DSA topics, Python, SQL, system
# design, OOP — belongs to the "dsa" section. Concepts inherit their
# parent topic's section.
AI_TOPIC_SLUGS = {
    "machine-learning", "deep-learning", "nlp", "computer-vision",
    "generative-ai", "llms", "reinforcement-learning",
    "recommender-systems", "agentic-ai", "rag", "time-series",
    "statistics-probability", "data-analysis", "data-engineering", "mlops",
}

# Software-engineering section. Like AI topics these have no problem bank,
# so their reels resolve to MIRA (they are NOT in PRACTICE_TOPIC_SLUGS).
ENG_TOPIC_SLUGS = {
    "frontend", "backend", "system-design", "oops", "cybersecurity",
    "networking", "docker-containers", "kubernetes", "cloud-computing",
    "devops-cicd", "git-version-control", "linux-shell",
    "apis-microservices", "testing-qa", "mobile-development",
}

_PARENT = {slug: parent for slug, _, _, parent in TAXONOMY}


def category_for(slug: str) -> str:
    """'dsa' | 'ai' | 'eng' — concepts resolve through their parent topic."""
    seen = set()
    cur = slug
    while cur is not None and cur not in seen:
        if cur in AI_TOPIC_SLUGS:
            return "ai"
        if cur in ENG_TOPIC_SLUGS:
            return "eng"
        seen.add(cur)
        cur = _PARENT.get(cur)
    return "dsa"
