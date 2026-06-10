"""
Lab 04 · BPR-MF — Train Your First Latent Factor Model
Marevlo Research — Recommender Systems Track

Covers: M14 (MF Decomposition), M16 (BPR Loss), DEEP M16 (BPR Derivation)

Run: python Lab_04_bpr_mf.py

Requirements: numpy, scipy, torch, pandas, rich
Dataset: MovieLens 100K (auto-downloaded)
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
from rich.live import Live
from rich.columns import Columns

console = Console()

console.print(Panel(
    "[bold cyan]Lab 04 · BPR-MF — Train Your First Latent Factor Model[/bold cyan]\n"
    "[dim]Marevlo Research — Recommender Systems Track[/dim]",
    border_style="cyan", expand=False
))

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
    console.print(f"  [green]✓ PyTorch {torch.__version__}[/green]")
except ImportError:
    HAS_TORCH = False
    console.print("[bold red]✗ PyTorch not installed.[/bold red]  Run: pip install torch")
    exit(1)


# ─────────────────────────────────────────────────────────────
# 1. DATA LOADING
# ─────────────────────────────────────────────────────────────

def load_movielens_100k(min_rating=4.0):
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
            parts = line.strip().split("\t")
            uid, iid, rating, ts = int(parts[0]), int(parts[1]), float(parts[2]), int(parts[3])
            if rating >= min_rating:
                ratings.append((uid - 1, iid - 1, ts))
    ratings.sort(key=lambda x: x[2])
    return ratings


def temporal_split(ratings, test_fraction=0.2):
    split_idx = int(len(ratings) * (1 - test_fraction))
    return ratings[:split_idx], ratings[split_idx:]


# ─────────────────────────────────────────────────────────────
# 2. BPR-MF MODEL (DEEP M16)
# ─────────────────────────────────────────────────────────────

class BPR_MF(nn.Module):
    """
    Bayesian Personalized Ranking with Matrix Factorization.

    P(u prefers i over j) = σ(x_uij)  where  x_uij = u·i − u·j
    Loss = −Σ log σ(x_uij) + λ‖Θ‖²
    """

    def __init__(self, n_users, n_items, k=64):
        super().__init__()
        self.user_emb = nn.Embedding(n_users, k)
        self.item_emb = nn.Embedding(n_items, k)
        nn.init.normal_(self.user_emb.weight, std=0.01)
        nn.init.normal_(self.item_emb.weight, std=0.01)

    def forward(self, users, pos_items, neg_items):
        u     = self.user_emb(users)
        i_pos = self.item_emb(pos_items)
        i_neg = self.item_emb(neg_items)
        return (u * i_pos).sum(dim=1) - (u * i_neg).sum(dim=1)

    def predict(self, user_idx):
        u      = self.user_emb.weight[user_idx]
        scores = self.item_emb.weight @ u
        return scores.detach().cpu().numpy()


# ─────────────────────────────────────────────────────────────
# 3. BPR TRAINING LOOP
# ─────────────────────────────────────────────────────────────

def train_bpr(model, train_interactions, n_items, epochs=20, lr=0.005,
              reg=0.001, batch_size=4096, label=""):
    optimizer  = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=reg)
    device     = next(model.parameters()).device

    user_items = defaultdict(set)
    for u, i, t in train_interactions:
        user_items[u].add(i)

    users_arr = np.array([u for u, i, t in train_interactions])
    items_arr = np.array([i for u, i, t in train_interactions])
    loss_history = []

    with Progress(
        SpinnerColumn(),
        TextColumn(f"  [cyan]{label or 'Training BPR-MF'}[/cyan]  epoch {{task.fields[ep]}}/{epochs}"),
        BarColumn(bar_width=30),
        TextColumn("[green]loss={task.fields[loss]:.4f}[/green]"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("train", total=epochs, ep=0, loss=0.0)

        for epoch in range(epochs):
            model.train()
            perm      = np.random.permutation(len(train_interactions))
            epoch_loss = 0.0
            n_batches  = 0

            for start in range(0, len(perm), batch_size):
                batch_idx  = perm[start:start + batch_size]
                batch_users = torch.LongTensor(users_arr[batch_idx]).to(device)
                batch_pos   = torch.LongTensor(items_arr[batch_idx]).to(device)

                neg_items = []
                for idx in batch_idx:
                    u   = users_arr[idx]
                    neg = np.random.randint(n_items)
                    while neg in user_items[u]:
                        neg = np.random.randint(n_items)
                    neg_items.append(neg)
                batch_neg = torch.LongTensor(neg_items).to(device)

                x_uij = model(batch_users, batch_pos, batch_neg)
                loss  = -torch.log(torch.sigmoid(x_uij) + 1e-10).mean()

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

                epoch_loss += loss.item()
                n_batches  += 1

            avg_loss = epoch_loss / n_batches
            loss_history.append(avg_loss)
            progress.update(task, advance=1, ep=epoch + 1, loss=avg_loss)

    return loss_history


# ─────────────────────────────────────────────────────────────
# 4. EVALUATION
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

def evaluate_bpr(model, R_train, test_dict, k=10, n_eval=500):
    model.eval()
    ndcgs, precs, recalls = [], [], []
    eval_users = [u for u in test_dict if len(test_dict[u]) > 0][:n_eval]

    with Progress(
        SpinnerColumn(),
        TextColumn("  [cyan]Evaluating[/cyan]"),
        BarColumn(bar_width=30),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    ) as progress:
        task = progress.add_task("eval", total=len(eval_users))
        with torch.no_grad():
            for user_idx in eval_users:
                scores = model.predict(user_idx)
                seen   = set(R_train[user_idx].nonzero()[1])
                scores[list(seen)] = -np.inf
                top_k    = np.argsort(scores)[-k:][::-1]
                relevant = test_dict[user_idx]
                ndcgs.append(ndcg_at_k(top_k, relevant, k))
                precs.append(precision_at_k(top_k, relevant, k))
                recalls.append(recall_at_k(top_k, relevant, k))
                progress.advance(task)

    return {"nDCG@10": np.mean(ndcgs), "P@10": np.mean(precs), "R@10": np.mean(recalls)}


# ─────────────────────────────────────────────────────────────
# 5. MAIN
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Load data
    ratings = load_movielens_100k()
    train, test = temporal_split(ratings)
    n_users = max(r[0] for r in ratings) + 1
    n_items = max(r[1] for r in ratings) + 1

    R_train = csr_matrix(
        ([1.0] * len(train), ([u for u, i, t in train], [i for u, i, t in train])),
        shape=(n_users, n_items)
    )
    test_dict = defaultdict(set)
    for u, i, t in test:
        test_dict[u].add(i)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    ds_table = Table(box=box.ROUNDED, border_style="blue", header_style="bold blue")
    ds_table.add_column("Property", style="bold cyan", justify="right")
    ds_table.add_column("Value",    style="bold white")
    ds_table.add_row("Users",  f"{n_users:,}")
    ds_table.add_row("Items",  f"{n_items:,}")
    ds_table.add_row("Train",  f"{len(train):,}")
    ds_table.add_row("Test",   f"{len(test):,}")
    ds_table.add_row("Device", f"[green]{device}[/green]")
    console.print(ds_table)

    # ── Hyperparameter search ──
    configs = [
        {"k": 64,  "lr": 0.005, "reg": 0.001},
        {"k": 128, "lr": 0.005, "reg": 0.001},
        {"k": 128, "lr": 0.001, "reg": 0.01},
    ]

    cfg_results = []
    best_ndcg   = 0
    best_model  = None
    best_config = None
    best_losses = None

    console.print(Panel("[bold]Hyperparameter Search[/bold]", border_style="magenta", expand=False))

    for cfg in configs:
        label = f"k={cfg['k']}  lr={cfg['lr']}  reg={cfg['reg']}"
        console.print(f"\n  [bold]{label}[/bold]")
        model  = BPR_MF(n_users, n_items, k=cfg["k"]).to(device)
        t0     = time.time()
        losses = train_bpr(model, train, n_items, epochs=15,
                           lr=cfg["lr"], reg=cfg["reg"], label=label)
        elapsed = time.time() - t0
        results = evaluate_bpr(model, R_train, test_dict)
        results["time"] = elapsed
        results["cfg"]  = label
        cfg_results.append(results)

        if results["nDCG@10"] > best_ndcg:
            best_ndcg   = results["nDCG@10"]
            best_model  = model
            best_config = cfg
            best_losses = losses

    # Config comparison table
    console.print(Panel("[bold]Hyperparameter Results[/bold]", border_style="yellow", expand=False))
    cfg_table = Table(box=box.ROUNDED, border_style="yellow", header_style="bold yellow")
    cfg_table.add_column("Config",   style="bold",    justify="left")
    cfg_table.add_column("nDCG@10", style="cyan",    justify="right")
    cfg_table.add_column("P@10",    style="green",   justify="right")
    cfg_table.add_column("R@10",    style="yellow",  justify="right")
    cfg_table.add_column("Time",    style="dim",     justify="right")

    for r in cfg_results:
        is_best = abs(r["nDCG@10"] - best_ndcg) < 1e-6
        cfg_table.add_row(
            f"{'🏆 ' if is_best else '   '}{r['cfg']}",
            f"[bold green]{r['nDCG@10']:.4f}[/bold green]" if is_best else f"{r['nDCG@10']:.4f}",
            f"{r['P@10']:.4f}", f"{r['R@10']:.4f}", f"{r['time']:.1f}s"
        )
    console.print(cfg_table)

    # ── Loss curve ──
    console.print(Panel("[bold]Loss Curve[/bold] · Best Model", border_style="cyan", expand=False))
    loss_min = min(best_losses)
    loss_max = max(best_losses)
    loss_range = max(loss_max - loss_min, 1e-6)

    loss_table = Table(box=box.SIMPLE, show_header=False, padding=(0, 1))
    loss_table.add_column("Epoch", style="dim",   justify="right", width=7)
    loss_table.add_column("Loss",  style="cyan",  justify="right", width=7)
    loss_table.add_column("Bar",   justify="left", width=40)
    for ep, loss in enumerate(best_losses, 1):
        filled  = int((loss - loss_min) / loss_range * 35) + 1
        color   = "green" if ep == len(best_losses) else "cyan"
        loss_table.add_row(
            f"Epoch {ep:>2d}",
            f"{loss:.4f}",
            f"[{color}]{'█' * filled}[/{color}]"
        )
    console.print(loss_table)

    # ── Embedding analysis ──
    item_emb = best_model.item_emb.weight.detach().cpu().numpy()
    console.print(Panel("[bold]Embedding Analysis[/bold]", border_style="magenta", expand=False))
    emb_table = Table(box=box.ROUNDED, border_style="magenta", header_style="bold magenta")
    emb_table.add_column("Property",    style="bold cyan", justify="right")
    emb_table.add_column("Value",       style="bold white")
    emb_table.add_row("Shape",          f"{item_emb.shape[0]:,} × {item_emb.shape[1]}")
    emb_table.add_row("Mean norm",      f"{np.linalg.norm(item_emb, axis=1).mean():.4f}")
    emb_table.add_row("Std norm",       f"{np.linalg.norm(item_emb, axis=1).std():.4f}")
    console.print(emb_table)

    # ── Sample recommendations ──
    console.print(Panel("[bold]Sample Recommendations[/bold] · 3 test users", border_style="blue", expand=False))
    sample_users = [u for u in test_dict if len(test_dict[u]) >= 3][:3]
    rec_table    = Table(box=box.ROUNDED, border_style="blue", header_style="bold blue")
    rec_table.add_column("User",       style="bold cyan", justify="right")
    rec_table.add_column("Top-5 items",                  justify="left")
    rec_table.add_column("Hits",                         justify="center")
    rec_table.add_column("Relevant set", style="dim",    justify="left")

    for u in sample_users:
        scores = best_model.predict(u)
        seen   = set(R_train[u].nonzero()[1])
        scores[list(seen)] = -np.inf
        top5     = np.argsort(scores)[-5:][::-1]
        relevant = test_dict[u]
        hits     = " ".join("[green]✓[/green]" if i in relevant else "[dim]·[/dim]" for i in top5)
        rec_table.add_row(
            str(u),
            str(top5.tolist()),
            hits,
            str(sorted(list(relevant))[:5])
        )
    console.print(rec_table)

    console.print(Panel(
        f"[bold green]✓ Lab 04 complete![/bold green]\n"
        f"Best: [bold cyan]{best_config['k']}[/bold cyan]-dim embeddings  "
        f"lr=[bold cyan]{best_config['lr']}[/bold cyan]  "
        f"reg=[bold cyan]{best_config['reg']}[/bold cyan]  "
        f"nDCG@10=[bold green]{best_ndcg:.4f}[/bold green]\n\n"
        f"[dim]Next → Lab 05: FAISS ANN Serving Benchmark[/dim]",
        border_style="green", expand=False
    ))
