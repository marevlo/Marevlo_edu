"""Embedding-based topic / subtopic classification.

Every concept MIRA touches — whether it's one of the built-in 16, a course
lattice concept, or a brand-new phrase that fell to "general" — gets placed on a
small, human-readable topic map: (domain, topic, subtopic). The frontend uses
this to group chat history (Topic -> Subtopic, collapsible), and the usage audit
records it so we can see WHAT learners ask about, not just which concept id matched.

How it works (cheap — no extra model call):
  - ~30 topic anchors, each a short bag of the words that name a topic.
  - Anchors are embedded ONCE with the SAME embedder the KB used for concepts,
    so a concept's precomputed embedding is directly comparable to them.
  - classify_topic() takes the concept's existing embedding and returns the
    nearest anchor's (domain, topic, subtopic). A small domain "soft filter"
    nudges ties toward the concept's own domain without hard-excluding others.
  - A tiny OVERRIDES map pins the known built-in concepts to exact topics so
    those never drift with embedder quality.

Grow the map by appending to _ANCHORS — no other code changes needed.
"""
from __future__ import annotations

import os
from functools import lru_cache

from .embeddings import build_embedder, cosine

# Below this best-anchor similarity the concept is treated as unclassifiable and
# lands in the catch-all bucket. Kept low because the local-hash dev embedder
# produces small magnitudes; tune via env for a real embedder.
MIN_SCORE = float(os.environ.get("MIRA_TOPIC_MIN_SCORE", "0.04"))
# Additive nudge applied to anchors whose domain matches the concept's own
# domain — breaks ties toward the right family without hard-excluding the rest.
DOMAIN_BONUS = float(os.environ.get("MIRA_TOPIC_DOMAIN_BONUS", "0.05"))

GENERAL = ("general", "General", "General")


# (domain, topic, subtopic, anchor-text). The anchor text is a rich bag of the
# words people use for that topic — it becomes the topic's embedding centroid.
_ANCHORS: list[tuple[str, str, str, str]] = [
    # ── machine learning ───────────────────────────────────────────────
    ("ml", "Neural Networks", "Architectures",
     "neural network mlp perceptron layers feedforward cnn convolutional rnn lstm "
     "architecture activation function relu sigmoid hidden units"),
    ("ml", "Neural Networks", "Training",
     "backpropagation backprop gradient descent sgd adam optimizer learning rate "
     "loss function training epochs batch chain rule weight update"),
    ("ml", "Model Generalization", "Regularization",
     "overfitting underfitting regularization dropout l1 l2 weight decay bias "
     "variance tradeoff generalization cross validation early stopping"),
    ("ml", "Classical ML", "Trees & Ensembles",
     "decision tree random forest gradient boosting xgboost bagging boosting "
     "ensemble isolation forest feature importance split"),
    ("ml", "Classical ML", "Linear Models",
     "linear regression logistic regression support vector machine svm ridge lasso "
     "coefficients least squares hyperplane margin"),
    ("ml", "Unsupervised Learning", "Clustering & Reduction",
     "kmeans clustering pca principal component dimensionality reduction tsne umap "
     "dbscan unsupervised centroid silhouette"),
    ("ml", "Evaluation", "Metrics",
     "accuracy precision recall f1 score roc auc confusion matrix evaluation "
     "metrics validation true positive false positive"),
    # ── ai / llms ──────────────────────────────────────────────────────
    ("ai", "Transformers & LLMs", "Attention",
     "transformer attention self-attention query key value multi-head positional "
     "encoding context window tokens sequence model"),
    ("ai", "Transformers & LLMs", "Fine-tuning",
     "fine-tuning lora peft adapter instruction tuning rlhf alignment prompt "
     "tuning quantization distillation pretraining"),
    ("ai", "Retrieval", "RAG",
     "rag retrieval augmented generation vector database chunking semantic search "
     "embeddings retriever context grounding knowledge base"),
    ("ai", "Representations", "Embeddings",
     "embedding vector representation word2vec sentence embedding dense vector "
     "similarity cosine latent space encode"),
    ("ai", "Interpretability", "Mechanistic",
     "interpretability sparse autoencoder monosemantic feature probing attribution "
     "explainability circuits saliency neuron"),
    ("ai", "Generative Models", "Diffusion & GANs",
     "generative adversarial network gan diffusion model vae variational autoencoder "
     "image generation sampling denoising latent"),
    ("ai", "Reinforcement Learning", "Core",
     "reinforcement learning q-learning policy gradient reward agent environment "
     "markov decision process exploration exploitation value function"),
    ("ai", "NLP", "Language Tasks",
     "natural language processing tokenization named entity recognition sentiment "
     "text classification language model parsing translation"),
    ("ai", "Computer Vision", "Core",
     "computer vision image classification object detection segmentation convolution "
     "feature map pooling pixels bounding box"),
    # ── data structures & algorithms ───────────────────────────────────
    ("dsa", "Searching & Sorting", "Core",
     "binary search sorting quicksort mergesort heapsort search sorted array pivot "
     "partition comparison order"),
    ("dsa", "Dynamic Programming", "Core",
     "dynamic programming memoization tabulation subproblem optimal substructure "
     "knapsack longest common subsequence overlapping"),
    ("dsa", "Graphs", "Traversal",
     "graph bfs dfs breadth first depth first shortest path dijkstra topological "
     "sort adjacency list traversal cycle"),
    ("dsa", "Data Structures", "Linear",
     "array linked list stack queue hash map hash table set deque ring buffer "
     "index collision pointer"),
    ("dsa", "Data Structures", "Trees & Heaps",
     "binary tree binary search tree bst heap priority queue trie balanced tree avl "
     "red black segment tree node height"),
    ("dsa", "Complexity", "Analysis",
     "big o notation time complexity space complexity asymptotic analysis amortized "
     "worst case logarithmic constant linear quadratic"),
    ("dsa", "Algorithms", "Greedy & Recursion",
     "greedy algorithm recursion backtracking divide and conquer two pointers "
     "sliding window invariant subproblem branch"),
    # ── data science / stats ───────────────────────────────────────────
    ("ds", "Statistics", "Probability",
     "probability distribution bayes theorem statistics hypothesis test p-value "
     "variance mean standard deviation sampling inference"),
    ("ds", "Data Wrangling", "Pipelines",
     "data cleaning pandas dataframe feature engineering etl preprocessing "
     "normalization scaling missing values transformation"),
    # ── systems ────────────────────────────────────────────────────────
    ("systems", "Databases", "SQL & Modeling",
     "database sql query index join transaction normalization relational nosql "
     "schema primary key foreign key acid"),
    ("systems", "Concurrency", "Parallelism",
     "concurrency thread lock mutex async await parallelism race condition deadlock "
     "atomic semaphore coroutine"),
    ("systems", "Networking", "Protocols",
     "network tcp ip http dns socket protocol latency bandwidth packet request "
     "response handshake"),
    ("systems", "Operating Systems", "Core",
     "operating system process thread memory scheduling cache paging virtual memory "
     "kernel system call context switch"),
    # ── web / programming ──────────────────────────────────────────────
    ("web", "Backend", "APIs",
     "rest api http server endpoint backend microservice authentication jwt route "
     "middleware request handler"),
    ("web", "Frontend", "UI",
     "frontend react javascript dom component css html browser rendering state "
     "hooks props virtual dom event"),
    ("prog", "Languages", "Fundamentals",
     "programming language syntax variable function loop conditional type system "
     "python javascript pointer reference scope"),
]


# Exact pins for the built-in concept lattice — guarantees these never drift
# with embedder quality. Concept ids not listed fall through to embedding match.
OVERRIDES: dict[str, tuple[str, str, str]] = {
    "transformer":        ("ai", "Transformers & LLMs", "Attention"),
    "attention":          ("ai", "Transformers & LLMs", "Attention"),
    "embedding":          ("ai", "Representations", "Embeddings"),
    "neural_network":     ("ml", "Neural Networks", "Architectures"),
    "backprop":           ("ml", "Neural Networks", "Training"),
    "gradient_descent":   ("ml", "Neural Networks", "Training"),
    "overfitting":        ("ml", "Model Generalization", "Regularization"),
    "rag":                ("ai", "Retrieval", "RAG"),
    "chunking":           ("ai", "Retrieval", "RAG"),
    "lora":               ("ai", "Transformers & LLMs", "Fine-tuning"),
    "sparse_autoencoder": ("ai", "Interpretability", "Mechanistic"),
    "isolation_forest":   ("ml", "Classical ML", "Trees & Ensembles"),
    "binary_search":      ("dsa", "Searching & Sorting", "Core"),
    "dynamic_programming": ("dsa", "Dynamic Programming", "Core"),
    "graph_bfs":          ("dsa", "Graphs", "Traversal"),
    "graph_dfs":          ("dsa", "Graphs", "Traversal"),
}


@lru_cache(maxsize=1)
def _anchor_embeddings() -> list[dict]:
    """Embed every anchor ONCE with the same embedder the KB used for concepts,
    so a concept embedding is directly comparable. Cached for the process life."""
    embedder = build_embedder()
    out = []
    for domain, topic, subtopic, text in _ANCHORS:
        out.append({"domain": domain, "topic": topic, "subtopic": subtopic,
                    "emb": embedder.embed(text)})
    return out


@lru_cache(maxsize=1)
def _embedder():
    return build_embedder()


def classify_topic(concept_id: str, embedding: list[float] | None = None,
                   domain_hint: str | None = None) -> tuple[str, str, str]:
    """Place a concept on the topic map -> (domain, topic, subtopic).

    Prefers an exact OVERRIDE for known built-ins; otherwise finds the nearest
    topic anchor by cosine similarity to `embedding` (the concept's precomputed
    vector, reused — no new embedding call), with a small additive bonus for
    anchors that share `domain_hint`. Falls back to ("general","General",
    "General") when the concept has no usable vector or nothing clears MIN_SCORE.
    """
    if concept_id in OVERRIDES:
        return OVERRIDES[concept_id]

    if not embedding:
        # last resort: embed the concept id text itself (cheap, deterministic)
        text = (concept_id or "").replace("_", " ").replace("-", " ").strip()
        if not text or text == "general":
            return GENERAL
        embedding = _embedder().embed(text)

    best = None
    best_score = -2.0
    for a in _anchor_embeddings():
        s = cosine(embedding, a["emb"])
        if domain_hint and a["domain"] == domain_hint:
            s += DOMAIN_BONUS
        if s > best_score:
            best_score, best = s, a

    if best is None or best_score < MIN_SCORE:
        return GENERAL
    return (best["domain"], best["topic"], best["subtopic"])
