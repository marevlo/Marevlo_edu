"""
Lab 03 · Item-kNN with Shrinkage
Marevlo Research — Recommender Systems Track

Covers: M09 (Item-kNN), M10 (Similarity Metrics), M11 (Shrinkage)

Run: python Lab_03_item_knn_shrinkage.py

Requirements: numpy, scipy, pandas, rich
Dataset: MovieLens 100K (auto-downloaded if missing)
"""

import numpy as np
import os, urllib.request, zipfile, time
from scipy.sparse import csr_matrix
from collections import defaultdict

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, BarColumn, TextColumn, TimeElapsedColumn, SpinnerColumn, MofNCompleteColumn
from rich import box

console = Console()

console.print(Panel(
    "[bold cyan]Lab 03 · Item-kNN with Shrinkage[/bold cyan]\n"
    "[dim]Marevlo Research — Recommender Systems Track[/dim]",
    border_style="cyan", expand=False
))

# ─────────────────────────────────────────────────────────────
# 1. DATA LOADING — MovieLens 100K
# ─────────────────────────────────────────────────────────────

def load_movielens_100k(min_rating=4.0):
    """Download and load MovieLens 100K as implicit interactions."""
    data_dir = "ml-100k"
    if not os.path.exists(data_dir):
        console.print("[yellow]Downloading MovieLens 100K...[/yellow]")
        url = "https://files.grouplens.org/datasets/movielens/ml-100k.zip"
        urllib.request.urlretrieve(url, "ml-100k.zip")
        with zipfile.ZipFile("ml-100k.zip", "r") as z:
            z.extractall(".")
        console.print("[green]Downloaded.[/green]")

    ratings = []
    with open(f"{data_dir}/u.data", "r") as f:
        for line in f:
            parts = line.strip().split("\t")
            uid, iid, rating, ts = int(parts[0]), int(parts[1]), float(parts[2]), int(parts[3])
            if rating >= min_rating:
                ratings.append((uid, iid, ts))

    ratings.sort(key=lambda x: x[2])
    console.print(f"  Loaded [bold]{len(ratings):,}[/bold] positive interactions "
                  f"(rating ≥ {min_rating})")
    return ratings


def temporal_split(ratings, test_fraction=0.2):
    split_idx = int(len(ratings) * (1 - test_fraction))
    return ratings[:split_idx], ratings[split_idx:]


def build_matrix(interactions, n_users, n_items):
    rows = [u - 1 for u, i, t in interactions]
    cols = [i - 1 for u, i, t in interactions]
    vals = [1.0] * len(interactions)
    return csr_matrix((vals, (rows, cols)), shape=(n_users, n_items))


# ─────────────────────────────────────────────────────────────
# 2. ITEM-KNN WITH SHRINKAGE (Module 09 + 11)
# ─────────────────────────────────────────────────────────────

def compute_item_similarity(R, shrinkage=100, k_neighbors=50, silent=False):
    """
    Cosine similarity with shrinkage.
    sim_shrunk(i,j) = (n_ij / (n_ij + λ)) * cos(i,j)
    """
    n_items    = R.shape[1]
    item_norms = np.sqrt(np.array(R.power(2).sum(axis=0)).flatten())
    item_norms[item_norms == 0] = 1.0

    RtR       = (R.T @ R).toarray()
    co_counts = RtR.copy()

    norms_outer = np.outer(item_norms, item_norms)
    cosine_sim  = RtR / norms_outer
    shrink_w    = co_counts / (co_counts + shrinkage)
    similarity  = cosine_sim * shrink_w
    np.fill_diagonal(similarity, 0.0)

    for i in range(n_items):
        row = similarity[i]
        if np.count_nonzero(row) > k_neighbors:
            threshold = np.partition(row, -k_neighbors)[-k_neighbors]
            row[row < threshold] = 0.0

    if not silent:
        nnz     = np.count_nonzero(similarity)
        density = nnz / (n_items * n_items) * 100
        console.print(
            f"  Similarity matrix: [cyan]{n_items}×{n_items}[/cyan]  "
            f"λ=[yellow]{shrinkage}[/yellow]  "
            f"non-zeros=[green]{nnz:,}[/green]  "
            f"density=[dim]{density:.2f}%[/dim]"
        )
    return similarity


def item_knn_recommend(user_idx, R_train, similarity, k=10):
    user_items = R_train[user_idx].toarray().flatten()
    interacted = np.where(user_items > 0)[0]
    if len(interacted) == 0:
        return []
    scores             = similarity[interacted].sum(axis=0)
    scores[interacted] = -np.inf
    return np.argsort(scores)[-k:][::-1]


# ─────────────────────────────────────────────────────────────
# 3. POPULARITY BASELINE
# ─────────────────────────────────────────────────────────────

def popularity_recommend(R_train, k=10, exclude_items=None):
    pop = np.array(R_train.sum(axis=0)).flatten()
    if exclude_items is not None:
        pop[list(exclude_items)] = -np.inf
    return np.argsort(pop)[-k:][::-1]


# ─────────────────────────────────────────────────────────────
# 4. EVALUATION (Lab 01 harness)
# ─────────────────────────────────────────────────────────────

def ndcg_at_k(recommended, relevant_set, k):
    relevance = [1.0 if item in relevant_set else 0.0 for item in recommended[:k]]
    dcg   = sum(r / np.log2(p + 2) for p, r in enumerate(relevance))
    ideal = sum(1.0 / np.log2(p + 2) for p in range(min(k, len(relevant_set))))
    return dcg / ideal if ideal > 0 else 0.0

def precision_at_k(recommended, relevant_set, k):
    return sum(1 for item in recommended[:k] if item in relevant_set) / k

def recall_at_k(recommended, relevant_set, k):
    if not relevant_set: return 0.0
    return sum(1 for item in recommended[:k] if item in relevant_set) / len(relevant_set)

def evaluate_model(recommend_fn, R_train, test_dict, k=10, n_eval=500, label=""):
    ndcgs, precs, recalls = [], [], []
    eval_users = [u for u in test_dict if len(test_dict[u]) > 0][:n_eval]

    with Progress(
        SpinnerColumn(),
        TextColumn(f"  [cyan]{label or 'Evaluating'}[/cyan]"),
        BarColumn(bar_width=30),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task("eval", total=len(eval_users))
        for user_idx in eval_users:
            relevant    = test_dict[user_idx]
            recommended = recommend_fn(user_idx)
            ndcgs.append(ndcg_at_k(recommended, relevant, k))
            precs.append(precision_at_k(recommended, relevant, k))
            recalls.append(recall_at_k(recommended, relevant, k))
            progress.advance(task)

    return {
        "nDCG@10": np.mean(ndcgs),
        "P@10":    np.mean(precs),
        "R@10":    np.mean(recalls),
        "n_users": len(eval_users),
    }


# ─────────────────────────────────────────────────────────────
# 5. MAIN
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Load data
    ratings  = load_movielens_100k(min_rating=4.0)
    train, test = temporal_split(ratings)
    n_users  = max(r[0] for r in ratings)
    n_items  = max(r[1] for r in ratings)
    R_train  = build_matrix(train, n_users, n_items)

    test_dict = defaultdict(set)
    for u, i, t in test:
        test_dict[u - 1].add(i - 1)

    sparsity = 1.0 - len(train) / (n_users * n_items)

    console.print(Panel("[bold]Dataset Info[/bold]", border_style="blue", expand=False))
    ds_table = Table(box=box.ROUNDED, border_style="blue", header_style="bold blue")
    ds_table.add_column("Property",  style="bold cyan", justify="right")
    ds_table.add_column("Value",     style="bold white")
    ds_table.add_row("Users",        f"{n_users:,}")
    ds_table.add_row("Items",        f"{n_items:,}")
    ds_table.add_row("Train",        f"{len(train):,} interactions")
    ds_table.add_row("Test",         f"{len(test):,} interactions  ({len(test_dict):,} users)")
    ds_table.add_row("Sparsity",     f"[yellow]{sparsity * 100:.3f}%[/yellow]")
    console.print(ds_table)

    # ── Popularity baseline ──
    console.print(Panel("[bold]Baseline[/bold] · Popularity", border_style="yellow", expand=False))
    pop_fn = lambda u: list(popularity_recommend(
        R_train, k=10,
        exclude_items=np.where(R_train[u].toarray().flatten() > 0)[0]
    ))
    pop_results = evaluate_model(pop_fn, R_train, test_dict, label="Popularity")

    # ── Item-kNN WITHOUT shrinkage ──
    console.print(Panel("[bold]Item-kNN[/bold] · No shrinkage (λ=0)", border_style="magenta", expand=False))
    sim_no_shrink = compute_item_similarity(R_train, shrinkage=0, k_neighbors=50)
    knn_fn        = lambda u: list(item_knn_recommend(u, R_train, sim_no_shrink, k=10))
    knn_results   = evaluate_model(knn_fn, R_train, test_dict, label="kNN (no shrinkage)")

    # ── Item-kNN WITH shrinkage ──
    console.print(Panel("[bold]Item-kNN[/bold] · With shrinkage (λ=100)", border_style="green", expand=False))
    sim_shrink  = compute_item_similarity(R_train, shrinkage=100, k_neighbors=50)
    knn_s_fn    = lambda u: list(item_knn_recommend(u, R_train, sim_shrink, k=10))
    knn_s_results = evaluate_model(knn_s_fn, R_train, test_dict, label="kNN (λ=100)")

    # ── Shrinkage sweep ──
    console.print(Panel("[bold]Shrinkage λ Sweep[/bold] · Module 11", border_style="cyan", expand=False))
    sweep_lambdas  = [0, 10, 50, 100, 200, 500]
    sweep_results  = {}

    with Progress(
        SpinnerColumn(),
        TextColumn("  [cyan]λ={task.fields[lam]}[/cyan]"),
        BarColumn(bar_width=30),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("sweep", total=len(sweep_lambdas), lam="?")
        for lam in sweep_lambdas:
            progress.update(task, lam=lam)
            sim = compute_item_similarity(R_train, shrinkage=lam, k_neighbors=50, silent=True)
            fn  = lambda u, s=sim: list(item_knn_recommend(u, R_train, s, k=10))
            res = evaluate_model(fn, R_train, test_dict, n_eval=200, label=f"λ={lam}")
            sweep_results[lam] = res['nDCG@10']
            progress.advance(task)

    best_lam = max(sweep_results, key=sweep_results.get)

    sweep_table = Table(box=box.ROUNDED, border_style="cyan", header_style="bold cyan",
                        title="Shrinkage λ Sweep — nDCG@10")
    sweep_table.add_column("λ",        style="bold cyan", justify="right")
    sweep_table.add_column("nDCG@10",  justify="right")
    sweep_table.add_column("",         justify="left")
    for lam, val in sweep_results.items():
        is_best = lam == best_lam
        bar     = "█" * int(val * 300)
        sweep_table.add_row(
            str(lam),
            f"[bold green]{val:.4f}[/bold green]" if is_best else f"{val:.4f}",
            f"[green]{bar}[/green]" if is_best else f"[dim]{bar}[/dim]"
        )
    console.print(sweep_table)

    # ── Final Leaderboard ──
    all_results = {
        "Popularity":           pop_results,
        "Item-kNN (no shrink)": knn_results,
        f"Item-kNN (λ=100)":    knn_s_results,
    }

    def lift_vs(val, base):
        pct = (val - base) / max(base, 1e-10) * 100
        return f"[green]+{pct:.1f}%[/green]" if pct > 0 else f"[red]{pct:.1f}%[/red]"

    pop_ndcg = pop_results["nDCG@10"]

    console.print(Panel("[bold]🏆 Leaderboard — Lab 03[/bold]", border_style="cyan", expand=False))
    lb_table = Table(box=box.ROUNDED, border_style="cyan", header_style="bold cyan")
    lb_table.add_column("Model",       style="bold",    justify="left")
    lb_table.add_column("nDCG@10",     style="cyan",    justify="right")
    lb_table.add_column("P@10",        style="green",   justify="right")
    lb_table.add_column("R@10",        style="yellow",  justify="right")
    lb_table.add_column("vs Popularity", justify="right")

    sorted_lb = sorted(all_results.items(), key=lambda x: x[1]["nDCG@10"], reverse=True)
    medals    = ["🥇", "🥈", "🥉"]
    for rank, (name, m) in enumerate(sorted_lb, 1):
        medal = medals[rank - 1] if rank <= 3 else f"  {rank}."
        lb_table.add_row(
            f"{medal} {name}",
            f"{m['nDCG@10']:.4f}", f"{m['P@10']:.4f}", f"{m['R@10']:.4f}",
            lift_vs(m["nDCG@10"], pop_ndcg)
        )
    console.print(lb_table)

    lift = (knn_s_results["nDCG@10"] / pop_ndcg - 1) * 100 if pop_ndcg > 0 else 0
    console.print(Panel(
        f"[bold green]✓ Lab 03 complete![/bold green]\n"
        f"kNN with shrinkage vs popularity: [bold cyan]+{lift:.1f}%[/bold cyan] nDCG@10\n\n"
        f"[dim]Next → Lab 04: BPR-MF — train your first latent factor model[/dim]",
        border_style="green", expand=False
    ))
