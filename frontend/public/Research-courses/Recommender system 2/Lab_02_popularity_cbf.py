# %% [markdown]
# # 🧪 Lab 2 · Popularity + Content-Based Pipeline
# **Marevlo Research — Recommender Systems Track**
#
# **Covers:** Modules 06–07 (Popularity Baselines + Content-Based Filtering)
#
# **What you'll build:**
# 1. All 4 popularity variants: raw count, time-windowed, exponential decay, Bayesian average
# 2. TF-IDF content-based filtering with cosine similarity
# 3. User profile construction from interaction history
# 4. Head-to-head comparison on the same test set from Lab 1
# 5. Growing leaderboard: random < popularity < ???
#
# **Time:** ~45 minutes
#
# **Prerequisites:** Complete Lab 1 (uses the same evaluation harness)
# Run `pip install numpy scipy pandas rich` if needed.

# %%
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from collections import Counter, defaultdict
import time

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, BarColumn, TextColumn, TimeElapsedColumn, SpinnerColumn
from rich import box

console = Console()

console.print(Panel(
    "[bold green]Evaluation harness loaded from Lab 1.[/bold green]",
    title="[bold cyan]🧪 Lab 02 · Popularity + CBF[/bold cyan]",
    border_style="cyan", expand=False
))

# === Rebuild from Lab 1 (or import if modularized) ===
np.random.seed(42)
n_users, n_items = 6040, 3952

def precision_at_k(ranked, rel, k):
    return len(set(ranked[:k]) & rel) / k

def recall_at_k(ranked, rel, k):
    return len(set(ranked[:k]) & rel) / max(len(rel), 1)

def ap_at_k(ranked, rel, k):
    h, s = 0, 0.0
    for i, item in enumerate(ranked[:k]):
        if item in rel:
            h += 1; s += h / (i + 1)
    return s / max(len(rel), 1)

def ndcg_at_k(ranked, rel, k):
    d     = sum(1 / np.log2(i + 2) for i, it in enumerate(ranked[:k]) if it in rel)
    ideal = sum(1 / np.log2(i + 2) for i in range(min(k, len(rel))))
    return d / ideal if ideal > 0 else 0.0

def evaluate_model(rec_fn, test_data, k=10):
    metrics = {'ndcg': [], 'precision': [], 'recall': [], 'map': []}
    for uid, rel_items in test_data.items():
        ranked = rec_fn(uid, k)
        rel    = set(rel_items)
        metrics['ndcg'].append(ndcg_at_k(ranked, rel, k))
        metrics['precision'].append(precision_at_k(ranked, rel, k))
        metrics['recall'].append(recall_at_k(ranked, rel, k))
        metrics['map'].append(ap_at_k(ranked, rel, k))
    return {m: np.mean(v) for m, v in metrics.items()}

# %% [markdown]
# ---
# ## Part 1: Generate Realistic Synthetic Data
#
# We need timestamps for decay and genre tags for CBF.

# %%
n_ratings  = 200000
users      = np.random.randint(0, n_users, n_ratings)
items      = np.random.randint(0, n_items, n_ratings)
ratings_vals = np.random.choice([1, 2, 3, 4, 5], n_ratings, p=[0.06, 0.11, 0.27, 0.34, 0.22])
timestamps = np.sort(np.random.randint(956_000_000, 1_046_000_000, n_ratings))

df = pd.DataFrame({'user_id': users, 'item_id': items,
                   'rating': ratings_vals, 'timestamp': timestamps})
df = df.drop_duplicates(['user_id', 'item_id'], keep='last')

cutoff   = df.timestamp.quantile(0.8)
train_df = df[df.timestamp < cutoff]
test_df  = df[df.timestamp >= cutoff]
test_df  = test_df[test_df.user_id.isin(train_df.user_id.unique())]

R_train = csr_matrix(
    (train_df.rating.values.astype(np.float32),
     (train_df.user_id.values, train_df.item_id.values)),
    shape=(n_users, n_items)
)

test_data = {}
for _, row in test_df[test_df.rating >= 4].iterrows():
    test_data.setdefault(row.user_id, []).append(row.item_id)

all_genres = ['action', 'comedy', 'drama', 'romance', 'thriller', 'scifi',
              'horror', 'documentary', 'animation', 'fantasy', 'mystery', 'adventure']
item_tags  = {i: list(np.random.choice(all_genres, np.random.randint(1, 4), replace=False))
              for i in range(n_items)}

console.print(Panel("[bold]Part 1[/bold] · Synthetic Data", border_style="blue", expand=False))
table = Table(box=box.ROUNDED, border_style="blue", header_style="bold blue")
table.add_column("Split",        style="bold cyan", justify="right")
table.add_column("Value",        style="bold white")
table.add_row("Train ratings",   f"{len(train_df):,}")
table.add_row("Test users",      f"{len(test_data):,}")
table.add_row("Items with tags", f"{len(item_tags):,}")
table.add_row("Tag vocab size",  f"{len(all_genres)}")
console.print(table)

# %% [markdown]
# ---
# ## Part 2: Four Popularity Variants
#
# **From DEEP M06:** Each variant uses a different scoring formula.
#
# **📝 Task:** Implement all four, evaluate each.

# %%
# Variant 1: Raw count
item_counts = np.array(R_train.getnnz(axis=0))
pop_raw     = np.argsort(item_counts)[::-1]

def recommend_raw_pop(uid, k=10):
    seen = set(R_train[uid].indices)
    return [i for i in pop_raw if i not in seen][:k]

# Variant 2: Time-windowed (last 20% of training time)
time_cutoff  = train_df.timestamp.quantile(0.8)
recent       = train_df[train_df.timestamp >= time_cutoff]
recent_counts = Counter(recent.item_id)
pop_recent   = sorted(range(n_items), key=lambda i: recent_counts.get(i, 0), reverse=True)

def recommend_windowed(uid, k=10):
    seen = set(R_train[uid].indices)
    return [i for i in pop_recent if i not in seen][:k]

# Variant 3: Exponential decay (λ=0.1 per day)
now  = train_df.timestamp.max()
lam  = 0.1 / 86400
decay_scores = defaultdict(float)
for _, row in train_df.iterrows():
    decay_scores[row.item_id] += np.exp(-lam * (now - row.timestamp))
pop_decay = sorted(range(n_items), key=lambda i: decay_scores.get(i, 0), reverse=True)

def recommend_decay(uid, k=10):
    seen = set(R_train[uid].indices)
    return [i for i in pop_decay if i not in seen][:k]

# Variant 4: Bayesian average (C=50)
C           = 50
global_mean = train_df.rating.mean()
item_stats  = train_df.groupby('item_id').rating.agg(['sum', 'count'])

bayesian_scores = {}
for i in range(n_items):
    if i in item_stats.index:
        s, n = item_stats.loc[i, 'sum'], item_stats.loc[i, 'count']
    else:
        s, n = 0, 0
    bayesian_scores[i] = (C * global_mean + s) / (C + n)
pop_bayesian = sorted(range(n_items), key=lambda i: bayesian_scores[i], reverse=True)

def recommend_bayesian(uid, k=10):
    seen = set(R_train[uid].indices)
    return [i for i in pop_bayesian if i not in seen][:k]

# Evaluate all four variants
console.print(Panel("[bold]Part 2[/bold] · Popularity Variants (M06)", border_style="yellow", expand=False))

results  = {}
variants = [
    ('Raw Count',    recommend_raw_pop),
    ('Windowed',     recommend_windowed),
    ('Exp Decay',    recommend_decay),
    ('Bayesian Avg', recommend_bayesian),
]

variant_times = {}
with Progress(
    SpinnerColumn(),
    TextColumn("[bold cyan]{task.description}"),
    BarColumn(bar_width=30),
    TextColumn("[green]{task.completed}/{task.total}"),
    TimeElapsedColumn(),
    console=console,
) as progress:
    task = progress.add_task("Evaluating popularity variants...", total=len(variants))
    for name, fn in variants:
        progress.update(task, description=f"Evaluating [bold]{name}[/bold]...")
        t0 = time.time()
        results[name] = evaluate_model(fn, test_data, k=10)
        variant_times[name] = time.time() - t0
        progress.advance(task)

best_ndcg = max(results[n]['ndcg'] for n in results)

table = Table(box=box.ROUNDED, border_style="yellow", header_style="bold yellow",
              title="Popularity Variants — nDCG@10 comparison")
table.add_column("Model",      style="bold",    justify="left")
table.add_column("nDCG@10",    style="cyan",    justify="right")
table.add_column("P@10",       style="green",   justify="right")
table.add_column("R@10",       style="yellow",  justify="right")
table.add_column("MAP",        style="magenta", justify="right")
table.add_column("Time",       style="dim",     justify="right")

for name, m in results.items():
    is_best = abs(m['ndcg'] - best_ndcg) < 1e-6
    prefix  = "🏆 " if is_best else "   "
    style   = "bold" if is_best else ""
    table.add_row(
        f"{prefix}{name}",
        f"[{style}]{m['ndcg']:.4f}[/{style}]" if style else f"{m['ndcg']:.4f}",
        f"{m['precision']:.4f}", f"{m['recall']:.4f}", f"{m['map']:.4f}",
        f"{variant_times[name]:.1f}s"
    )
console.print(table)

# %% [markdown]
# ### 🧠 Checkpoint 1
#
# **Questions:**
# 1. Which popularity variant performed best? Why?
# 2. Is the difference between variants statistically meaningful at this scale?
# 3. What does the Bayesian average do differently from raw count? (Recall DEEP M06)

# %% [markdown]
# ---
# ## Part 3: Content-Based Filtering (TF-IDF + Cosine)
#
# **From DEEP M07:** Represent each item as a TF-IDF vector over its tags.
# Build a user profile by averaging their liked items' vectors.
# Score unseen items by cosine similarity to the profile.

# %%
all_tags_set = set()
for tags in item_tags.values():
    all_tags_set.update(tags)
vocab = {tag: idx for idx, tag in enumerate(sorted(all_tags_set))}
V     = len(vocab)

doc_freq = Counter()
for tags in item_tags.values():
    for t in set(tags):
        doc_freq[t] += 1
idf = np.zeros(V)
for tag, idx in vocab.items():
    idf[idx] = np.log(n_items / max(doc_freq[tag], 1))

item_vectors = np.zeros((n_items, V))
for i, tags in item_tags.items():
    for t in tags:
        if t in vocab:
            item_vectors[i, vocab[t]] = 1.0 * idf[vocab[t]]

norms = np.linalg.norm(item_vectors, axis=1, keepdims=True)
norms[norms == 0] = 1
item_vectors_normed = item_vectors / norms

console.print(Panel("[bold]Part 3[/bold] · Content-Based Filtering (M07)", border_style="magenta", expand=False))
table = Table(box=box.ROUNDED, border_style="magenta", header_style="bold magenta")
table.add_column("Property",      style="bold cyan", justify="right")
table.add_column("Value",         style="bold white")
table.add_row("Item vector shape", f"{item_vectors.shape[0]:,} × {item_vectors.shape[1]}")
table.add_row("Vocabulary size",   f"{V} unique tags")
table.add_row("IDF range",         f"{idf.min():.2f} → {idf.max():.2f}")
console.print(table)

def cbf_recommend(uid, k=10):
    """Content-based: user profile = avg of liked item vectors, score by cosine."""
    liked = R_train[uid].indices[R_train[uid].data >= 3]
    if len(liked) == 0:
        return list(range(k))
    profile    = item_vectors_normed[liked].mean(axis=0)
    prof_norm  = np.linalg.norm(profile)
    if prof_norm == 0:
        return list(range(k))
    profile    = profile / prof_norm
    scores     = item_vectors_normed @ profile
    seen       = set(R_train[uid].indices)
    for s in seen:
        scores[s] = -np.inf
    return np.argsort(scores)[-k:][::-1].tolist()

t0          = time.time()
cbf_metrics = evaluate_model(cbf_recommend, test_data, k=10)
cbf_elapsed = time.time() - t0
results['CBF (TF-IDF)'] = cbf_metrics

# %% [markdown]
# ---
# ## Part 4: Leaderboard — Growing Model Comparison
#
# **📝 This leaderboard grows with each lab.** Lab 3 adds kNN. Lab 4 adds BPR-MF.

# %%
console.print(Panel("[bold]Part 4[/bold] · 🏆 Leaderboard — Labs 1–2", border_style="cyan", expand=False))

sorted_results = sorted(results.items(), key=lambda x: x[1]['ndcg'], reverse=True)
best_ndcg_all  = sorted_results[0][1]['ndcg']

table = Table(box=box.ROUNDED, border_style="cyan", header_style="bold cyan",
              title="Growing Leaderboard (add new models each lab)")
table.add_column("Rank",    justify="center")
table.add_column("Model",   style="bold", justify="left")
table.add_column("nDCG@10", style="cyan",    justify="right")
table.add_column("P@10",    style="green",   justify="right")
table.add_column("R@10",    style="yellow",  justify="right")
table.add_column("MAP",     style="magenta", justify="right")

medals = ["🥇", "🥈", "🥉"]
for rank, (name, m) in enumerate(sorted_results, 1):
    medal = medals[rank - 1] if rank <= 3 else f" {rank}."
    is_top = rank == 1
    table.add_row(
        medal,
        f"[bold]{name}[/bold]" if is_top else name,
        f"[bold green]{m['ndcg']:.4f}[/bold green]" if is_top else f"{m['ndcg']:.4f}",
        f"{m['precision']:.4f}", f"{m['recall']:.4f}", f"{m['map']:.4f}"
    )

console.print(table)
console.print(Panel(
    "[bold green]✓ Lab 02 complete![/bold green]\n"
    "4 popularity variants · TF-IDF CBF · growing leaderboard\n\n"
    "[dim]Next → Lab 03: Item-kNN with Shrinkage — can CF beat popularity?[/dim]",
    border_style="green", expand=False
))

# %% [markdown]
# ---
# ## ✅ Lab 2 Complete
#
# **What you built:**
# - ✓ All 4 popularity variants from M06 (raw, windowed, decay, Bayesian)
# - ✓ TF-IDF content-based filtering from M07 (vocabulary, IDF, user profiles, cosine scoring)
# - ✓ Head-to-head comparison on same temporal test set
# - ✓ Growing leaderboard
#
# **Key insight from this lab:**
# Popularity baselines are non-personalized but can be surprisingly strong.
# CBF personalizes from day one but is limited by tag vocabulary.
# The real test comes in Lab 3 when collaborative filtering enters —
# can it discover patterns that tags miss?
#
# **Next:** Lab 3 → Item-kNN with Shrinkage (M08–M13)
