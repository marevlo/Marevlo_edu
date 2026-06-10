#!/usr/bin/env python3
"""
benchmark_attention_kernels.py

Measure attention kernel wall-clock time for vanilla PyTorch, FlashAttention-2,
and FlashAttention-3 across several sequence lengths. Produces the numbers
you paste into a benchmarking section of an RFC.

Why this exists:
  The "FA-3 is 2x faster than FA-2" claim is true for certain sequence lengths
  on certain hardware. For short contexts it is not. For prefill it is. For
  decode (seqlen_q=1) the kernels behave completely differently. You need to
  benchmark on your actual shape before you commit to a kernel choice.

Usage:
  # Benchmark attention on a Llama-3-8B shape at four sequence lengths
  python benchmark_attention_kernels.py --model-shape llama-3-8b \\
      --seq-lens 1024,4096,16384,65536

  # Benchmark decode vs prefill (decode: seqlen_q=1, seqlen_k=ctx)
  python benchmark_attention_kernels.py --mode decode --seq-lens 1024,4096,16384

Notes:
  - Vanilla attention OOMs around seqlen=8192 on 80GB HBM for bs=4; expected.
  - FA-3 requires H100 or newer AND flash-attn >= 2.6 with the hopper build.
  - All numbers are mean of 50 iterations after 10 warmup; std-dev printed too.
"""

import argparse
import sys
import time
from contextlib import suppress


# ─── Model shape presets ──────────────────────────────────────────────────────

SHAPES = {
    # (num_heads_q, num_heads_kv, head_dim, hidden)
    "llama-3-8b":   (32,  8,  128, 4096),
    "llama-3-70b":  (64,  8,  128, 8192),
    "mixtral-8x7b": (32,  8,  128, 4096),
    "qwen-7b":      (32, 32,  128, 4096),  # MHA — useful contrast
}


# ─── Lazy imports so the script prints a useful message without GPU ──────────

def import_deps():
    """Return (torch, F) or a reason string if unavailable."""
    try:
        import torch
        import torch.nn.functional as F
    except ImportError:
        return None, "PyTorch not installed. `pip install torch`"
    if not torch.cuda.is_available():
        return None, "No CUDA device available. Benchmarks require a GPU."
    return (torch, F), None


def try_fa2():
    with suppress(ImportError):
        from flash_attn import flash_attn_func  # noqa: F401
        return flash_attn_func
    return None


def try_fa3():
    """FA-3 lives in a different module path in flash-attn 2.6+."""
    with suppress(ImportError):
        from flash_attn.flash_attn_interface import flash_attn_func as _fa3  # type: ignore
        # FA-3 exposes the same signature but dispatches to the hopper kernel
        # when running on H100/H200 with the correct build. We can only detect
        # FA-3 for real by inspecting the torch op registry at runtime; we
        # approximate here by checking version.
        import flash_attn
        ver = tuple(int(x) for x in flash_attn.__version__.split(".")[:2])
        if ver >= (2, 6):
            return _fa3
    return None


# ─── Benchmark core ───────────────────────────────────────────────────────────

def time_kernel(torch, fn, n_warmup=10, n_iter=50):
    """CUDA-accurate timing using events."""
    # Warmup
    for _ in range(n_warmup):
        fn()
    torch.cuda.synchronize()

    starts = [torch.cuda.Event(enable_timing=True) for _ in range(n_iter)]
    ends = [torch.cuda.Event(enable_timing=True) for _ in range(n_iter)]

    for i in range(n_iter):
        starts[i].record()
        fn()
        ends[i].record()
    torch.cuda.synchronize()

    times_ms = [s.elapsed_time(e) for s, e in zip(starts, ends)]
    mean = sum(times_ms) / len(times_ms)
    var = sum((t - mean) ** 2 for t in times_ms) / len(times_ms)
    std = var ** 0.5
    return mean, std


def make_qkv(torch, batch, seq_q, seq_k, h_q, h_kv, d, dtype):
    """Build Q, K, V in the (batch, seq, heads, head_dim) layout FA expects."""
    Q = torch.randn(batch, seq_q, h_q, d, dtype=dtype, device="cuda")
    K = torch.randn(batch, seq_k, h_kv, d, dtype=dtype, device="cuda")
    V = torch.randn(batch, seq_k, h_kv, d, dtype=dtype, device="cuda")
    return Q, K, V


def vanilla_attention(torch, F, Q, K, V):
    """
    Manual scaled dot-product attention. OOMs for long seqs because it
    materializes the (seq_q x seq_k) attention matrix.
    """
    # reshape to (bs, heads, seq, d) for matmul
    Qr = Q.transpose(1, 2)
    Kr = K.transpose(1, 2)
    Vr = V.transpose(1, 2)
    # GQA: repeat K and V groups to match Q head count
    if Qr.shape[1] != Kr.shape[1]:
        rep = Qr.shape[1] // Kr.shape[1]
        Kr = Kr.repeat_interleave(rep, dim=1)
        Vr = Vr.repeat_interleave(rep, dim=1)
    scale = Qr.shape[-1] ** -0.5
    scores = (Qr @ Kr.transpose(-2, -1)) * scale
    # causal mask
    mask = torch.triu(torch.ones_like(scores, dtype=torch.bool), diagonal=1)
    scores = scores.masked_fill(mask, float("-inf"))
    probs = F.softmax(scores, dim=-1)
    out = probs @ Vr
    return out.transpose(1, 2)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model-shape", default="llama-3-8b", choices=list(SHAPES.keys()))
    p.add_argument("--seq-lens", default="1024,4096,16384",
                   help="Comma-separated sequence lengths to test")
    p.add_argument("--batch", type=int, default=4)
    p.add_argument("--mode", default="prefill", choices=["prefill", "decode"],
                   help="prefill: seqlen_q=seqlen_k. decode: seqlen_q=1, seqlen_k=context.")
    p.add_argument("--dtype", default="bf16", choices=["fp16", "bf16"])
    p.add_argument("--skip-vanilla", action="store_true",
                   help="Skip vanilla attention (it OOMs at long seqs)")
    p.add_argument("--n-iter", type=int, default=50)
    args = p.parse_args()

    deps, err = import_deps()
    if err:
        print(f"⚠  {err}")
        print("   Reading sample_output_h100.txt is the alternative.")
        sys.exit(1)
    torch, F = deps

    fa2 = try_fa2()
    fa3 = try_fa3()

    h_q, h_kv, d, _hidden = SHAPES[args.model_shape]
    dtype = torch.bfloat16 if args.dtype == "bf16" else torch.float16
    seq_lens = [int(s) for s in args.seq_lens.split(",")]

    print(f"\n{'═'*78}")
    print(f" ATTENTION KERNEL BENCHMARK")
    print(f"{'═'*78}")
    print(f" Model shape: {args.model_shape} · Q heads={h_q} KV heads={h_kv} "
          f"head_dim={d}")
    print(f" Batch: {args.batch} · Mode: {args.mode} · dtype: {args.dtype}")
    print(f" GPU: {torch.cuda.get_device_name(0)} · Iterations: {args.n_iter}")
    print(f" FA-2: {'available' if fa2 else 'NOT installed'}   "
          f"FA-3: {'available (H100+)' if fa3 else 'NOT installed'}")
    print(f"{'═'*78}\n")

    header = f" {'seq_len':>10} {'vanilla (ms)':>16} {'FA-2 (ms)':>14} "\
             f"{'FA-3 (ms)':>14} {'FA-3 vs vanilla':>18}"
    print(header)
    print(" " + "-" * (len(header) - 1))

    for seq in seq_lens:
        seq_q = 1 if args.mode == "decode" else seq
        seq_k = seq
        Q, K, V = make_qkv(torch, args.batch, seq_q, seq_k, h_q, h_kv, d, dtype)

        # Vanilla
        v_str = "—"
        if not args.skip_vanilla and seq_k <= 8192:
            try:
                mean, std = time_kernel(torch, lambda: vanilla_attention(torch, F, Q, K, V),
                                        n_iter=args.n_iter)
                v_str = f"{mean:7.2f} ± {std:4.2f}"
                v_mean = mean
            except torch.cuda.OutOfMemoryError:
                v_str = "OOM"
                v_mean = None
                torch.cuda.empty_cache()
        else:
            v_str = "skipped"
            v_mean = None

        # FA-2
        fa2_str = "n/a"
        fa2_mean = None
        if fa2:
            try:
                mean, std = time_kernel(torch, lambda: fa2(Q, K, V, causal=True),
                                        n_iter=args.n_iter)
                fa2_str = f"{mean:7.2f} ± {std:4.2f}"
                fa2_mean = mean
            except Exception as e:
                fa2_str = f"error: {type(e).__name__}"

        # FA-3 — same call shape; only faster on H100 hopper builds
        fa3_str = "n/a"
        fa3_mean = None
        if fa3 and fa3 is not fa2:
            try:
                mean, std = time_kernel(torch, lambda: fa3(Q, K, V, causal=True),
                                        n_iter=args.n_iter)
                fa3_str = f"{mean:7.2f} ± {std:4.2f}"
                fa3_mean = mean
            except Exception as e:
                fa3_str = f"error: {type(e).__name__}"

        speedup = ""
        if v_mean and fa3_mean:
            speedup = f"{v_mean/fa3_mean:5.2f}x faster"
        elif v_mean and fa2_mean:
            speedup = f"{v_mean/fa2_mean:5.2f}x (vs FA-2)"

        print(f" {seq:>10,} {v_str:>16} {fa2_str:>14} {fa3_str:>14} {speedup:>18}")

    print()
    print("─" * 78)
    print(" INTERPRETATION")
    print("─" * 78)
    if args.mode == "prefill":
        print(" Prefill is compute-bound: FA-3's async GEMM + warp specialization")
        print(" pays off most at seq_len >= 4096. Below that, kernel launch overhead")
        print(" dominates and FA-2 and FA-3 are indistinguishable.")
    else:
        print(" Decode has seqlen_q=1: each step is tiny. Kernel launch overhead")
        print(" dominates; FA-2 vs FA-3 gap is small. CUDA graphs matter more here")
        print(" than the kernel choice.")
    print()


if __name__ == "__main__":
    main()
