"""
Lab 05 · FAISS ANN Serving Benchmark
Marevlo Research — Recommender Systems Track

Covers: M28 (Serving at Scale — ANN Search)

Run: python Lab_05_faiss_serving.py

Requirements: numpy, rich, faiss-cpu (pip install faiss-cpu)
Note: Uses synthetic embeddings if Lab 04 hasn't been run.
"""

import numpy as np
import time

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, BarColumn, TextColumn, TimeElapsedColumn, SpinnerColumn
from rich import box

console = Console()

console.print(Panel(
    "[bold cyan]Lab 05 · FAISS ANN Serving Benchmark[/bold cyan]\n"
    "[dim]Marevlo Research — Recommender Systems Track[/dim]",
    border_style="cyan", expand=False
))

try:
    import faiss
    HAS_FAISS = True
    console.print(f"  [green]✓ FAISS loaded[/green]")
except ImportError:
    HAS_FAISS = False
    console.print("[bold red]✗ faiss not installed.[/bold red]  Run: pip install faiss-cpu")
    exit(1)


# ─────────────────────────────────────────────────────────────
# 1. GENERATE EMBEDDINGS
# ─────────────────────────────────────────────────────────────

def generate_embeddings(n_items=480_000, n_users=10_000, k=128):
    console.print(Panel(
        f"[bold]Generating embeddings[/bold]\n"
        f"  Items: [cyan]{n_items:,}[/cyan]   Users: [cyan]{n_users:,}[/cyan]   Dim: [cyan]{k}[/cyan]",
        border_style="blue", expand=False
    ))

    n_clusters      = 50
    cluster_centers = np.random.randn(n_clusters, k).astype(np.float32)
    item_embeddings = np.zeros((n_items, k), dtype=np.float32)
    for i in range(n_items):
        cluster            = i % n_clusters
        item_embeddings[i] = cluster_centers[cluster] + np.random.randn(k).astype(np.float32) * 0.3

    norms           = np.linalg.norm(item_embeddings, axis=1, keepdims=True)
    item_embeddings = item_embeddings / np.maximum(norms, 1e-8)

    user_embeddings = np.random.randn(n_users, k).astype(np.float32)
    user_norms      = np.linalg.norm(user_embeddings, axis=1, keepdims=True)
    user_embeddings = user_embeddings / np.maximum(user_norms, 1e-8)

    return item_embeddings, user_embeddings


# ─────────────────────────────────────────────────────────────
# 2. BRUTE FORCE BASELINE
# ─────────────────────────────────────────────────────────────

def brute_force_search(user_emb, item_embeddings, k=500):
    scores = item_embeddings @ user_emb
    top_k  = np.argpartition(scores, -k)[-k:]
    top_k  = top_k[np.argsort(scores[top_k])[::-1]]
    return top_k, scores[top_k]


# ─────────────────────────────────────────────────────────────
# 3. FAISS INDEX CONSTRUCTION
# ─────────────────────────────────────────────────────────────

def build_flat_index(item_embeddings):
    k     = item_embeddings.shape[1]
    index = faiss.IndexFlatIP(k)
    index.add(item_embeddings)
    return index


def build_ivf_pq_index(item_embeddings, nlist=1024, m=32, nbits=8):
    """IVF-PQ: cluster search + vector compression — ~100× faster at 95%+ recall."""
    k         = item_embeddings.shape[1]
    quantizer = faiss.IndexFlatIP(k)
    index     = faiss.IndexIVFPQ(quantizer, k, nlist, m, nbits)

    with Progress(
        SpinnerColumn(),
        TextColumn("  [cyan]Training IVF-PQ index...[/cyan]"),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    ) as progress:
        progress.add_task("train", total=None)
        index.train(item_embeddings)

    index.add(item_embeddings)
    console.print(f"  IVF-PQ built: [cyan]nlist={nlist}[/cyan]  [cyan]m={m}[/cyan]  "
                  f"[cyan]{item_embeddings.shape[0]:,}[/cyan] vectors")
    return index


def build_hnsw_index(item_embeddings, M=32, ef_construction=200):
    """HNSW: hierarchical graph — excellent recall, memory-efficient."""
    k     = item_embeddings.shape[1]
    index = faiss.IndexHNSWFlat(k, M)
    index.hnsw.efConstruction = ef_construction

    with Progress(
        SpinnerColumn(),
        TextColumn("  [cyan]Building HNSW index...[/cyan]"),
        TimeElapsedColumn(),
        console=console,
        transient=True,
    ) as progress:
        progress.add_task("build", total=None)
        index.add(item_embeddings)

    console.print(f"  HNSW built: [cyan]M={M}[/cyan]  [cyan]efConstruction={ef_construction}[/cyan]  "
                  f"[cyan]{item_embeddings.shape[0]:,}[/cyan] vectors")
    return index


# ─────────────────────────────────────────────────────────────
# 4. BENCHMARKING
# ─────────────────────────────────────────────────────────────

def benchmark_latency(index, user_embeddings, k=500, n_queries=1000, nprobe=None):
    if nprobe is not None and hasattr(index, 'nprobe'):
        index.nprobe = nprobe
    latencies = []
    for i in range(min(n_queries, len(user_embeddings))):
        query = user_embeddings[i:i + 1]
        t0    = time.perf_counter()
        index.search(query, k)
        latencies.append((time.perf_counter() - t0) * 1000)
    latencies = np.array(latencies)
    return {"P50_ms": np.percentile(latencies, 50),
            "P99_ms": np.percentile(latencies, 99),
            "mean_ms": np.mean(latencies)}


def benchmark_recall(index, item_embeddings, user_embeddings, k=500,
                     n_queries=100, nprobe=None):
    if nprobe is not None and hasattr(index, 'nprobe'):
        index.nprobe = nprobe
    recalls = []
    for i in range(min(n_queries, len(user_embeddings))):
        query      = user_embeddings[i]
        gt_indices, _ = brute_force_search(query, item_embeddings, k)
        gt_set     = set(gt_indices)
        _, ann_idx = index.search(user_embeddings[i:i + 1], k)
        ann_set    = set(ann_idx[0])
        recalls.append(len(gt_set & ann_set) / len(gt_set))
    return np.mean(recalls)


# ─────────────────────────────────────────────────────────────
# 5. MAIN
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    N_ITEMS = 100_000   # Change to 480_000 for Kartify-scale
    N_USERS = 1_000
    K_DIM   = 128

    item_emb, user_emb = generate_embeddings(N_ITEMS, N_USERS, K_DIM)

    results = {}   # {method: {P50, P99, recall}}

    # ── 1. Brute Force ──
    console.print(Panel("[bold]1. Brute Force[/bold] (exact baseline)", border_style="blue", expand=False))
    flat_index  = build_flat_index(item_emb)
    bf_latency  = benchmark_latency(flat_index, user_emb, k=500, n_queries=200)
    bf_recall   = 1.0
    results["Brute Force"] = {**bf_latency, "recall": bf_recall}
    console.print(f"  P50: [cyan]{bf_latency['P50_ms']:.2f}ms[/cyan]  "
                  f"P99: [yellow]{bf_latency['P99_ms']:.2f}ms[/yellow]  "
                  f"Recall: [green]1.000[/green]")

    # ── 2. IVF-PQ sweep ──
    console.print(Panel("[bold]2. IVF-PQ[/bold] · nprobe sweep", border_style="magenta", expand=False))
    ivf_index   = build_ivf_pq_index(item_emb, nlist=256, m=32)
    nprobes     = [4, 8, 16, 32]
    ivf_table   = Table(box=box.ROUNDED, border_style="magenta", header_style="bold magenta",
                        title="IVF-PQ — nprobe Sweep")
    ivf_table.add_column("nprobe",     style="bold cyan", justify="right")
    ivf_table.add_column("P50 (ms)",   style="green",     justify="right")
    ivf_table.add_column("P99 (ms)",   style="yellow",    justify="right")
    ivf_table.add_column("Recall@500", style="cyan",      justify="right")
    ivf_table.add_column("Latency",    justify="center")
    ivf_table.add_column("Recall",     justify="center")

    best_ivf_key = None
    for nprobe in nprobes:
        lat = benchmark_latency(ivf_index, user_emb, k=500, n_queries=200, nprobe=nprobe)
        rec = benchmark_recall(ivf_index, item_emb, user_emb, k=500, n_queries=50, nprobe=nprobe)
        key = f"IVF-PQ (nprobe={nprobe})"
        results[key] = {**lat, "recall": rec}

        lat_ok  = lat["P99_ms"] < 10
        rec_ok  = rec > 0.95
        lat_sym = "[bold green]✓[/bold green]" if lat_ok else "[bold red]✗[/bold red]"
        rec_sym = "[bold green]✓[/bold green]" if rec_ok else ("[yellow]~[/yellow]" if rec > 0.90 else "[bold red]✗[/bold red]")

        if lat_ok and rec_ok and best_ivf_key is None:
            best_ivf_key = key

        ivf_table.add_row(
            str(nprobe),
            f"{lat['P50_ms']:.2f}", f"{lat['P99_ms']:.2f}",
            f"{rec:.3f}", lat_sym, rec_sym
        )
    console.print(ivf_table)

    # ── 3. HNSW ──
    console.print(Panel("[bold]3. HNSW[/bold] · M=32", border_style="green", expand=False))
    hnsw_index  = build_hnsw_index(item_emb, M=32)
    hnsw_lat    = benchmark_latency(hnsw_index, user_emb, k=500, n_queries=200)
    hnsw_rec    = benchmark_recall(hnsw_index, item_emb, user_emb, k=500, n_queries=50)
    results["HNSW (M=32)"] = {**hnsw_lat, "recall": hnsw_rec}
    console.print(f"  P50: [cyan]{hnsw_lat['P50_ms']:.2f}ms[/cyan]  "
                  f"P99: [yellow]{hnsw_lat['P99_ms']:.2f}ms[/yellow]  "
                  f"Recall: [green]{hnsw_rec:.3f}[/green]")

    # ── Summary table ──
    console.print(Panel("[bold]🏆 Serving Benchmark Summary[/bold]", border_style="cyan", expand=False))
    summ_table = Table(box=box.ROUNDED, border_style="cyan", header_style="bold cyan",
                       title=f"N_ITEMS={N_ITEMS:,}  K={K_DIM}  k@500")
    summ_table.add_column("Method",      style="bold",    justify="left")
    summ_table.add_column("P50 (ms)",    style="green",   justify="right")
    summ_table.add_column("P99 (ms)",    style="yellow",  justify="right")
    summ_table.add_column("Recall@500",  style="cyan",    justify="right")
    summ_table.add_column("Speedup",     style="magenta", justify="right")
    summ_table.add_column("P99 <10ms",   justify="center")

    bf_p99 = results["Brute Force"]["P99_ms"]
    display_methods = ["Brute Force"] + [f"IVF-PQ (nprobe={p})" for p in nprobes] + ["HNSW (M=32)"]
    for method in display_methods:
        if method not in results:
            continue
        r       = results[method]
        speedup = bf_p99 / r["P99_ms"] if r["P99_ms"] > 0 else 0
        ok      = r["P99_ms"] < 10
        sym     = "[bold green]✓[/bold green]" if ok else "[dim]–[/dim]"
        summ_table.add_row(
            method,
            f"{r['P50_ms']:.2f}", f"{r['P99_ms']:.2f}",
            f"{r['recall']:.3f}",
            f"{speedup:.0f}×" if speedup > 1.1 else "1×",
            sym
        )
    console.print(summ_table)

    best_ivf_key = best_ivf_key or "IVF-PQ (nprobe=16)"
    speedup_best = bf_p99 / results.get(best_ivf_key, results["Brute Force"])["P99_ms"]
    console.print(Panel(
        f"[bold green]✓ Lab 05 complete![/bold green]\n"
        f"Best ANN speedup over brute force: [bold cyan]{speedup_best:.0f}×[/bold cyan]  "
        f"({N_ITEMS:,} items indexed)\n\n"
        f"[dim]Retrieval is production-ready when P99 < 10ms AND Recall > 95%[/dim]\n"
        f"[dim]Next → Lab 06: Full capstone pipeline (retrieval → ranking → MMR)[/dim]",
        border_style="green", expand=False
    ))
