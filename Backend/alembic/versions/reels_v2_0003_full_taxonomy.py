"""reels — full DSA + Data Science/AI taxonomy

Revision ID: reels_v2_0003
Revises: reels_v2_0002

Idempotent: inserts only slugs not already in reel_topics, so it is safe
both on fresh databases (after 0001 seeded the initial set) and on
databases where reels are already live.
"""
from alembic import op
import sqlalchemy as sa

revision = "reels_v2_0003"
down_revision = "reels_v2_0002"
branch_labels = None
depends_on = None

TAXONOMY = [
    ('arrays', 'Arrays', 'topic', None),
    ('strings', 'Strings', 'topic', None),
    ('linked-list', 'Linked list', 'topic', None),
    ('stacks-queues', 'Stacks & queues', 'topic', None),
    ('hashing', 'Hashing & hash maps', 'topic', None),
    ('recursion', 'Recursion', 'topic', None),
    ('sorting', 'Sorting', 'topic', None),
    ('searching', 'Searching', 'topic', None),
    ('trees', 'Trees & BSTs', 'topic', None),
    ('heaps', 'Heaps & priority queues', 'topic', None),
    ('graphs', 'Graphs', 'topic', None),
    ('dynamic-programming', 'Dynamic programming', 'topic', None),
    ('greedy', 'Greedy', 'topic', None),
    ('backtracking', 'Backtracking', 'topic', None),
    ('bit-manipulation', 'Bit manipulation', 'topic', None),
    ('math-for-dsa', 'Math & number theory', 'topic', None),
    ('matrix', 'Matrix / 2-D grids', 'topic', None),
    ('intervals', 'Intervals', 'topic', None),
    ('tries', 'Tries', 'topic', None),
    ('advanced-data-structures', 'Segment & Fenwick trees', 'topic', None),
    ('two-pointers', 'Two pointers', 'concept', 'arrays'),
    ('sliding-window', 'Sliding window', 'concept', 'arrays'),
    ('prefix-sums', 'Prefix sums', 'concept', 'arrays'),
    ('kadanes-algorithm', "Kadane's algorithm", 'concept', 'dynamic-programming'),
    ('memoization', 'Memoization', 'concept', 'dynamic-programming'),
    ('tabulation', 'Tabulation', 'concept', 'dynamic-programming'),
    ('knapsack-patterns', 'Knapsack patterns', 'concept', 'dynamic-programming'),
    ('lcs-patterns', 'LCS / string DP', 'concept', 'dynamic-programming'),
    ('binary-search', 'Binary search', 'concept', 'searching'),
    ('bfs', 'Breadth-first search', 'concept', 'graphs'),
    ('dfs', 'Depth-first search', 'concept', 'graphs'),
    ('topological-sort', 'Topological sort', 'concept', 'graphs'),
    ('dijkstra', 'Dijkstra & shortest paths', 'concept', 'graphs'),
    ('union-find', 'Union-Find / DSU', 'concept', 'graphs'),
    ('monotonic-stack', 'Monotonic stack', 'concept', 'stacks-queues'),
    ('fast-slow-pointers', 'Fast & slow pointers', 'concept', 'linked-list'),
    ('divide-and-conquer', 'Divide & conquer', 'concept', 'sorting'),
    ('tree-traversals', 'Tree traversals', 'concept', 'trees'),
    ('python', 'Python', 'topic', None),
    ('sql-databases', 'SQL & databases', 'topic', None),
    ('system-design', 'System design', 'topic', None),
    ('oops', 'OOP concepts', 'topic', None),
    ('machine-learning', 'Machine learning', 'topic', None),
    ('deep-learning', 'Deep learning', 'topic', None),
    ('nlp', 'NLP', 'topic', None),
    ('computer-vision', 'Computer vision', 'topic', None),
    ('generative-ai', 'Generative AI', 'topic', None),
    ('llms', 'LLMs', 'topic', None),
    ('reinforcement-learning', 'Reinforcement learning', 'topic', None),
    ('recommender-systems', 'Recommender systems', 'topic', None),
    ('agentic-ai', 'Agentic AI', 'topic', None),
    ('rag', 'RAG', 'topic', None),
    ('time-series', 'Time series', 'topic', None),
    ('statistics-probability', 'Statistics & probability', 'topic', None),
    ('data-analysis', 'Data analysis (EDA)', 'topic', None),
    ('data-engineering', 'Data engineering', 'topic', None),
    ('mlops', 'MLOps', 'topic', None),
    ('gradient-descent', 'Gradient descent', 'concept', 'machine-learning'),
    ('regularization', 'Regularization', 'concept', 'machine-learning'),
    ('bias-variance-tradeoff', 'Bias–variance tradeoff', 'concept', 'machine-learning'),
    ('feature-engineering', 'Feature engineering', 'concept', 'machine-learning'),
    ('model-evaluation', 'Model evaluation & metrics', 'concept', 'machine-learning'),
    ('ensemble-methods', 'Ensembles & boosting', 'concept', 'machine-learning'),
    ('clustering', 'Clustering', 'concept', 'machine-learning'),
    ('dimensionality-reduction', 'Dimensionality reduction', 'concept', 'machine-learning'),
    ('backpropagation', 'Backpropagation', 'concept', 'deep-learning'),
    ('cnns', 'CNNs', 'concept', 'deep-learning'),
    ('rnns-lstms', 'RNNs & LSTMs', 'concept', 'deep-learning'),
    ('transformers', 'Transformers', 'concept', 'deep-learning'),
    ('attention-mechanism', 'Attention mechanism', 'concept', 'deep-learning'),
    ('optimizers', 'Optimizers (SGD/Adam)', 'concept', 'deep-learning'),
    ('embeddings', 'Embeddings', 'concept', 'nlp'),
    ('tokenization', 'Tokenization', 'concept', 'nlp'),
    ('fine-tuning', 'Fine-tuning', 'concept', 'llms'),
    ('prompt-engineering', 'Prompt engineering', 'concept', 'llms'),
    ('context-windows', 'Context & memory', 'concept', 'llms'),
    ('vector-databases', 'Vector databases', 'concept', 'rag'),
    ('chunking-strategies', 'Chunking strategies', 'concept', 'rag'),
    ('retrieval-reranking', 'Retrieval & re-ranking', 'concept', 'rag'),
    ('q-learning', 'Q-learning', 'concept', 'reinforcement-learning'),
    ('policy-gradients', 'Policy gradients', 'concept', 'reinforcement-learning'),
    ('multi-agent-systems', 'Multi-agent systems', 'concept', 'reinforcement-learning'),
    ('tool-calling', 'Tool / function calling', 'concept', 'agentic-ai'),
    ('agent-orchestration', 'Agent orchestration', 'concept', 'agentic-ai'),
    ('collaborative-filtering', 'Collaborative filtering', 'concept', 'recommender-systems'),
    ('ranking-models', 'Ranking & retrieval models', 'concept', 'recommender-systems'),
    ('forecasting-models', 'Forecasting models', 'concept', 'time-series'),
    ('hypothesis-testing', 'Hypothesis & A/B testing', 'concept', 'statistics-probability'),
    ('probability-distributions', 'Probability distributions', 'concept', 'statistics-probability'),
]


def upgrade() -> None:
    conn = op.get_bind()
    existing = {r[0] for r in conn.execute(sa.text("SELECT slug FROM reel_topics"))}
    t = sa.table(
        "reel_topics",
        sa.column("slug", sa.String), sa.column("name", sa.String),
        sa.column("kind", sa.String), sa.column("parent_slug", sa.String),
        sa.column("sort_order", sa.Integer), sa.column("is_active", sa.Boolean),
    )
    new = [
        {"slug": s, "name": n, "kind": k, "parent_slug": p, "sort_order": i, "is_active": True}
        for i, (s, n, k, p) in enumerate(TAXONOMY) if s not in existing
    ]
    if new:
        op.bulk_insert(t, new)
    # backfill parent links for slugs seeded earlier without a parent
    parents = {s: p for s, _, _, p in TAXONOMY if p}
    for slug, parent in parents.items():
        conn.execute(sa.text(
            "UPDATE reel_topics SET parent_slug = :p WHERE slug = :s AND parent_slug IS NULL"
        ), {"p": parent, "s": slug})


def downgrade() -> None:
    pass  # additive seed; nothing to remove safely
