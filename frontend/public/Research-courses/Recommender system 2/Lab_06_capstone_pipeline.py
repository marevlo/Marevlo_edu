"""
Lab 06 · Full Capstone Pipeline — End to End
Marevlo Research — Recommender Systems Track

Covers: M32 (Capstone Retrieval), M33 (Capstone Ranking), M34 (Full Pipeline)

Run: python Lab_06_capstone_pipeline.py

Requirements: numpy, scipy, torch, rich
"""

import numpy as np
import time
from scipy.sparse import csr_matrix
from collections import defaultdict
import os, urllib.request, zipfile

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, BarColumn, TextColumn, TimeElapsedColumn, SpinnerColumn, MofNCompleteColumn
from rich import box

console = Console()

console.print(Panel(
    "[bold cyan]Lab 06 · Full Capstone Pipeline — End to End[/bold cyan]\n"
    "[dim]Marevlo Research — Recommender Systems Track[/dim]",
    border_style="cyan", expand=False
))

try:
    import torch
    import torch.nn as nn
    console.print(f"  [green]✓ PyTorch {torch.__version__}[/green]")
except ImportError:
    console.print("[bold red]✗ PyTorch required.[/bold red]  Run: pip install torch")
    exit(1)


# ─────────────────────────────────────────────────────────────
# 1. DATA LOADING
# ─────────────────────────────────────────────────────────────

def load_data():
    data_dir = "ml-100k"
    if not os.path.exists(data_dir):
        console.print("[yellow]Downloading MovieLens 100K...[/yellow]")
        url = "https://files.grouplens.org/datasets/movielens/ml-100k.zip"
        urllib.request.urlretrieve(url, "ml-100k.zip")
        with zipfile.ZipFile("ml-100k.zip", "r") as z:
            z.extractall(".")

    ratings = []
    with open(f"{data_dir}/u.data", "r") as f:
        for line in f:
            p  = line.strip().split("\t")
            uid, iid, r, ts = int(p[0]) - 1, int(p[1]) - 1, float(p[2]), int(p[3])
            if r >= 4.0:
                ratings.append((uid, iid, ts))
    ratings.sort(key=lambda x: x[2])

    split   = int(len(ratings) * 0.8)
    train   = ratings[:split]
    test    = ratings[split:]
    n_users = max(r[0] for r in ratings) + 1
    n_items = max(r[1] for r in ratings) + 1

    R_train = csr_matrix(
        ([1.0] * len(train), ([u for u, i, t in train], [i for u, i, t in train])),
        shape=(n_users, n_items)
    )
    test_dict = defaultdict(set)
    for u, i, t in test:
        test_dict[u].add(i)

    return train, test_dict, R_train, n_users, n_items


# ─────────────────────────────────────────────────────────────
# 2. EVALUATION HARNESS
# ─────────────────────────────────────────────────────────────

def evaluate(recommend_fn, test_dict, k=10, n_eval=500, label=""):
    ndcgs, precs, recalls = [], [], []
    users = [u for u in test_dict if len(test_dict[u]) > 0][:n_eval]

    with Progress(
        SpinnerColumn(),
        TextColumn(f"  [cyan]{label or 'Evaluating'}[/cyan]"),
        BarColumn(bar_width=30),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task("eval", total=len(users))
        for u in users:
            recs      = recommend_fn(u)[:k]
            rel       = test_dict[u]
            relevance = [1.0 if i in rel else 0.0 for i in recs]
            dcg       = sum(r / np.log2(p + 2) for p, r in enumerate(relevance))
            ideal     = sum(1.0 / np.log2(p + 2) for p in range(min(k, len(rel))))
            ndcgs.append(dcg / ideal if ideal > 0 else 0)
            precs.append(sum(relevance) / k)
            recalls.append(sum(relevance) / len(rel) if rel else 0)
            progress.advance(task)

    return {"nDCG@10": np.mean(ndcgs), "P@10": np.mean(precs), "R@10": np.mean(recalls)}


# ─────────────────────────────────────────────────────────────
# 3. STAGE 1: RETRIEVAL MODELS
# ─────────────────────────────────────────────────────────────

def popularity_model(R_train):
    pop = np.array(R_train.sum(axis=0)).flatten()
    def recommend(u, k=100):
        scores = pop.copy()
        seen   = set(R_train[u].nonzero()[1])
        for s in seen:
            scores[s] = -np.inf
        return np.argsort(scores)[-k:][::-1]
    return recommend


def item_knn_model(R_train, shrinkage=100, n_neighbors=50):
    RtR        = (R_train.T @ R_train).toarray()
    norms      = np.sqrt(np.array(R_train.power(2).sum(axis=0)).flatten())
    norms[norms == 0] = 1.0
    cosine     = RtR / np.outer(norms, norms)
    shrink_w   = RtR / (RtR + shrinkage)
    sim        = cosine * shrink_w
    np.fill_diagonal(sim, 0)

    def recommend(u, k=100):
        items      = R_train[u].toarray().flatten()
        interacted = np.where(items > 0)[0]
        if len(interacted) == 0:
            return np.array([], dtype=int)
        scores             = sim[interacted].sum(axis=0)
        scores[interacted] = -np.inf
        return np.argsort(scores)[-k:][::-1]
    return recommend


class BPR_MF(nn.Module):
    def __init__(self, n_users, n_items, k=64):
        super().__init__()
        self.user_emb = nn.Embedding(n_users, k)
        self.item_emb = nn.Embedding(n_items, k)
        nn.init.normal_(self.user_emb.weight, std=0.01)
        nn.init.normal_(self.item_emb.weight, std=0.01)

    def forward(self, users, pos, neg):
        u = self.user_emb(users)
        return (u * self.item_emb(pos)).sum(1) - (u * self.item_emb(neg)).sum(1)

    def predict_all(self, u):
        with torch.no_grad():
            return (self.item_emb.weight @ self.user_emb.weight[u]).cpu().numpy()


def train_bpr(n_users, n_items, train_data, k=64, epochs=15, lr=0.005, reg=0.001):
    model      = BPR_MF(n_users, n_items, k)
    opt        = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=reg)
    user_items = defaultdict(set)
    for u, i, t in train_data:
        user_items[u].add(i)
    users_a = np.array([u for u, i, t in train_data])
    items_a = np.array([i for u, i, t in train_data])
    bs      = 4096

    with Progress(
        SpinnerColumn(),
        TextColumn("  [cyan]BPR-MF[/cyan]  epoch {task.fields[ep]}/{total_ep}"),
        BarColumn(bar_width=30),
        TextColumn("[green]loss={task.fields[loss]:.4f}[/green]"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("train", total=epochs, ep=0, loss=0.0, total_ep=epochs)
        for ep in range(epochs):
            model.train()
            perm       = np.random.permutation(len(train_data))
            epoch_loss = 0.0
            n_batches  = 0
            for start in range(0, len(perm), bs):
                idx = perm[start:start + bs]
                bu  = torch.LongTensor(users_a[idx])
                bp  = torch.LongTensor(items_a[idx])
                bn  = torch.LongTensor([
                    next(x for x in iter(lambda: np.random.randint(n_items), None)
                         if x not in user_items[users_a[j]])
                    for j in idx
                ])
                x    = model(bu, bp, bn)
                loss = -torch.log(torch.sigmoid(x) + 1e-10).mean()
                opt.zero_grad(); loss.backward(); opt.step()
                epoch_loss += loss.item()
                n_batches  += 1
            avg = epoch_loss / n_batches
            progress.update(task, advance=1, ep=ep + 1, loss=avg)

    return model


# ─────────────────────────────────────────────────────────────
# 4. STAGE 2: RANKING (feature-based reranking)
# ─────────────────────────────────────────────────────────────

def build_ranker(R_train, model):
    item_pop     = np.array(R_train.sum(axis=0)).flatten().astype(float)
    item_pop     = item_pop / item_pop.max()

    def rerank(user_id, candidates, k=20):
        ret_scores = model.predict_all(user_id)[candidates]
        ret_norm   = (ret_scores - ret_scores.min()) / (ret_scores.max() - ret_scores.min() + 1e-10)
        pop_scores = item_pop[candidates]
        rank_scores = np.linspace(1.0, 0.0, len(candidates))
        combined   = 0.6 * ret_norm + 0.25 * pop_scores + 0.15 * rank_scores
        top_k_idx  = np.argsort(combined)[-k:][::-1]
        return candidates[top_k_idx]

    return rerank


# ─────────────────────────────────────────────────────────────
# 5. STAGE 3: MMR DIVERSITY (Module 27)
# ─────────────────────────────────────────────────────────────

def mmr_rerank(items, item_embeddings, k=10, lam=0.7):
    if len(items) <= k:
        return items
    selected  = [items[0]]
    remaining = list(items[1:])
    while len(selected) < k and remaining:
        best_score, best_idx = -np.inf, 0
        for idx, item in enumerate(remaining):
            relevance = 1.0 - (idx / len(remaining))
            item_vec  = item_embeddings[item]
            max_sim   = max(
                np.dot(item_vec, item_embeddings[s]) /
                (np.linalg.norm(item_vec) * np.linalg.norm(item_embeddings[s]) + 1e-10)
                for s in selected
            )
            mmr = lam * relevance - (1 - lam) * max_sim
            if mmr > best_score:
                best_score, best_idx = mmr, idx
        selected.append(remaining.pop(best_idx))
    return np.array(selected)


# ─────────────────────────────────────────────────────────────
# 6. FULL PIPELINE
# ─────────────────────────────────────────────────────────────

def full_pipeline(user_id, retrieval_fn, ranker_fn, item_embeddings, k=10):
    candidates = retrieval_fn(user_id, k=100)
    ranked     = ranker_fn(user_id, candidates, k=30)
    return mmr_rerank(ranked, item_embeddings, k=k, lam=0.7)


# ─────────────────────────────────────────────────────────────
# 7. MAIN
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    train, test_dict, R_train, n_users, n_items = load_data()

    ds_table = Table(box=box.ROUNDED, border_style="blue", header_style="bold blue")
    ds_table.add_column("Property", style="bold cyan", justify="right")
    ds_table.add_column("Value",    style="bold white")
    ds_table.add_row("Users",   f"{n_users:,}")
    ds_table.add_row("Items",   f"{n_items:,}")
    ds_table.add_row("Train",   f"{len(train):,} interactions")
    console.print(ds_table)

    leaderboard = {}   # {model_name: metrics}

    # ── Stage 1: Retrieval ──
    console.print(Panel("[bold]Stage 1[/bold] · Retrieval Models", border_style="blue", expand=False))

    console.print("  [cyan]Popularity baseline...[/cyan]")
    pop_fn  = popularity_model(R_train)
    pop_res = evaluate(pop_fn, test_dict, label="Popularity")
    leaderboard["Popularity (M06)"] = pop_res

    console.print("  [cyan]Item-kNN (λ=100)...[/cyan]")
    knn_fn  = item_knn_model(R_train, shrinkage=100)
    knn_res = evaluate(knn_fn, test_dict, label="Item-kNN")
    leaderboard["Item-kNN + shrinkage (M09-M11)"] = knn_res

    console.print("  [cyan]BPR-MF (k=64, 15 epochs)...[/cyan]")
    bpr_model = train_bpr(n_users, n_items, train, k=64, epochs=15)

    def bpr_fn(u, k=100):
        scores = bpr_model.predict_all(u)
        seen   = set(R_train[u].nonzero()[1])
        for s in seen:
            scores[s] = -np.inf
        return np.argsort(scores)[-k:][::-1]

    bpr_res = evaluate(bpr_fn, test_dict, label="BPR-MF retrieval")
    leaderboard["BPR-MF retrieval (M16)"] = bpr_res

    # ── Stage 2: Ranking ──
    console.print(Panel("[bold]Stage 2[/bold] · Feature Reranking", border_style="yellow", expand=False))
    ranker = build_ranker(R_train, bpr_model)

    def ranked_fn(u, k=10):
        candidates = bpr_fn(u, k=100)
        return ranker(u, candidates, k=k)

    ranked_res = evaluate(ranked_fn, test_dict, label="BPR + ranking")
    leaderboard["BPR-MF + ranking (M21/M33)"] = ranked_res

    # ── Stage 3: Full Pipeline ──
    console.print(Panel("[bold]Stage 3[/bold] · Full Pipeline (retrieval → ranking → MMR)", border_style="green", expand=False))
    item_emb = bpr_model.item_emb.weight.detach().cpu().numpy()

    def pipeline_fn(u, k=10):
        return full_pipeline(u, bpr_fn, ranker, item_emb, k=k)

    pipeline_res = evaluate(pipeline_fn, test_dict, label="Full pipeline")
    leaderboard["Full pipeline + MMR (M27/M34)"] = pipeline_res

    # ── Latency benchmark ──
    console.print(Panel("[bold]Latency Benchmark[/bold] · Full pipeline", border_style="magenta", expand=False))
    latencies = []
    for u in list(test_dict.keys())[:100]:
        t0 = time.perf_counter()
        full_pipeline(u, bpr_fn, ranker, item_emb, k=10)
        latencies.append((time.perf_counter() - t0) * 1000)

    lat_table = Table(box=box.ROUNDED, border_style="magenta", header_style="bold magenta")
    lat_table.add_column("Percentile", style="bold cyan", justify="right")
    lat_table.add_column("Latency (ms)", style="bold white", justify="right")
    lat_table.add_column("Target",       justify="center")
    for pct, label in [(50, "P50"), (95, "P95"), (99, "P99")]:
        val = np.percentile(latencies, pct)
        ok  = val < 100
        sym = "[green]✓[/green]" if ok else "[red]✗[/red]"
        lat_table.add_row(label, f"{val:.1f}ms", sym)
    lat_table.add_row("Mean", f"{np.mean(latencies):.1f}ms", "")
    console.print(lat_table)

    # ── Final Leaderboard ──
    console.print(Panel("[bold]🏆 Capstone Leaderboard[/bold]", border_style="cyan", expand=False))

    sorted_lb = sorted(leaderboard.items(), key=lambda x: x[1]["nDCG@10"], reverse=True)
    pop_ndcg  = leaderboard["Popularity (M06)"]["nDCG@10"]
    prev_ndcg = None

    lb_table = Table(box=box.ROUNDED, border_style="cyan", header_style="bold cyan",
                     title="All Stages — nDCG@10 progression")
    lb_table.add_column("Rank",        justify="center")
    lb_table.add_column("Model",       style="bold",    justify="left")
    lb_table.add_column("nDCG@10",     style="cyan",    justify="right")
    lb_table.add_column("P@10",        style="green",   justify="right")
    lb_table.add_column("R@10",        style="yellow",  justify="right")
    lb_table.add_column("vs Popularity", justify="right")
    lb_table.add_column("vs Prev",     justify="right")

    medals = ["🥇", "🥈", "🥉", " 4.", " 5."]
    for rank, (name, m) in enumerate(sorted_lb, 1):
        medal    = medals[rank - 1] if rank <= 5 else f" {rank}."
        is_top   = rank == 1
        vs_pop   = (m["nDCG@10"] / max(pop_ndcg, 1e-10) - 1) * 100
        vs_pop_s = f"[green]+{vs_pop:.1f}%[/green]" if vs_pop > 0 else f"[red]{vs_pop:.1f}%[/red]"

        if prev_ndcg is not None:
            vs_prev   = (m["nDCG@10"] / max(prev_ndcg, 1e-10) - 1) * 100
            vs_prev_s = f"[green]+{vs_prev:.1f}%[/green]" if vs_prev > 0 else f"[dim]{vs_prev:.1f}%[/dim]"
        else:
            vs_prev_s = "–"
        prev_ndcg = m["nDCG@10"]

        lb_table.add_row(
            medal,
            f"[bold]{name}[/bold]" if is_top else name,
            f"[bold green]{m['nDCG@10']:.4f}[/bold green]" if is_top else f"{m['nDCG@10']:.4f}",
            f"{m['P@10']:.4f}", f"{m['R@10']:.4f}",
            vs_pop_s, vs_prev_s
        )
    console.print(lb_table)

    bpr_ndcg = leaderboard["BPR-MF retrieval (M16)"]["nDCG@10"]
    lift      = (bpr_ndcg / max(pop_ndcg, 1e-10) - 1) * 100
    p99_lat   = np.percentile(latencies, 99)

    console.print(Panel(
        f"[bold green]✓ CAPSTONE COMPLETE[/bold green]\n\n"
        f"  BPR-MF vs Popularity:  [bold cyan]+{lift:.0f}%[/bold cyan] nDCG@10\n"
        f"  Full pipeline P99:     [bold cyan]{p99_lat:.0f}ms[/bold cyan]\n\n"
        f"  [dim]popularity → kNN → BPR-MF → ranking → MMR reranking[/dim]\n"
        f"  [dim]Each stage measured. Pipeline runs end-to-end.[/dim]",
        border_style="green", expand=False
    ))
