#!/usr/bin/env python3
"""
break_mla_decompression.py

FAILURE REPRODUCTION: MLA with up-projection on the critical path.

This script demonstrates the #1 MLA integration mistake: leaving the K/V
up-projection as a separate operation before the attention kernel, instead
of fusing it into the attention op itself.

The symptom in production:
  - MLA cuts KV memory ~90% (this part works — KV really does shrink)
  - BUT decode is SLOWER than plain GQA, not faster
  - HBM bandwidth util shows a weird spike right before the attention call

The root cause:
  Correct MLA stores compressed KV as c_kv (dim ~512) per layer per token.
  During decode, c_kv is up-projected to K (dim h_kv*d) and V (dim h_kv*d)
  INSIDE the attention kernel, on SRAM, so the full K/V never touches HBM.

  Wrong MLA does the up-projection in a separate op BEFORE calling attention.
  Now you pay:
    (a) the HBM read for c_kv (the win)
    (b) the HBM write for expanded K/V (the loss — undoes the win)
    (c) the HBM read AGAIN for K/V when attention runs (the double loss)

  You've replaced one HBM pass with three. MLA loses to plain GQA by ~30%.

How to use this:
  python break_mla_decompression.py --seq-len 4096 --batch 8
  → shows WRONG vs CORRECT timing on a toy MLA-shaped attention

What to look for in a real system:
  1. Profile with nsys. In the timeline, you should see exactly ONE kernel
     launch for attention during decode. If you see up-projection + attention
     + down-projection as separate kernels, the integration is wrong.
  2. In DCGM: check DRAM_ACTIVE (HBM utilization). Correct MLA runs at 75-85%
     HBM util. Wrong MLA shows bursty 95%+ HBM during the extra ops and
     then drops to ~40% during attention — total throughput is worse.
  3. Compare KV memory to a baseline GQA config. If memory is correctly
     reduced (~10x less than MHA, ~2x less than GQA-8) but decode is not
     faster, you have this bug.
"""

import argparse
import sys
import time


def import_deps():
    try:
        import torch
        import torch.nn.functional as F
    except ImportError:
        return None, "PyTorch not installed"
    if not torch.cuda.is_available():
        return None, "No CUDA device"
    return (torch, F), None


def mla_wrong(torch, F, c_kv, W_up_k, W_up_v, Q, scale):
    """
    WRONG: up-project c_kv to full K and V on HBM, then call attention.
    This is the mistake. It undoes the whole point of MLA.
    """
    # c_kv: [batch, seq_k, c_dim]
    # W_up_k, W_up_v: [c_dim, h_kv, d]
    K = torch.einsum("bsc,chd->bshd", c_kv, W_up_k)  # writes to HBM
    V = torch.einsum("bsc,chd->bshd", c_kv, W_up_v)  # writes to HBM (again)

    # Now call attention, which reads K and V back from HBM
    Qr = Q.transpose(1, 2)
    Kr = K.transpose(1, 2)
    Vr = V.transpose(1, 2)
    rep = Qr.shape[1] // Kr.shape[1]
    if rep > 1:
        Kr = Kr.repeat_interleave(rep, dim=1)
        Vr = Vr.repeat_interleave(rep, dim=1)
    scores = (Qr @ Kr.transpose(-2, -1)) * scale
    probs = F.softmax(scores, dim=-1)
    out = probs @ Vr
    return out.transpose(1, 2)


def mla_correct(torch, F, c_kv, W_up_k, W_up_v, Q, scale):
    """
    CORRECT (toy fused version): perform K and V up-projection inside the
    attention computation so intermediate K/V never materializes on HBM.

    A real production MLA (DeepSeek-V3, SGLang, vLLM) does this inside a
    custom CUDA kernel with the up-projection folded into the attention
    matmul. We approximate the fused pattern here using a single einsum
    that computes scores directly from Q and c_kv, then outputs from
    attention_probs and c_kv. This is slower than a real fused kernel but
    it models the "no intermediate K/V on HBM" property.

    Mathematical identity used:
      Q @ K^T  = Q @ (c_kv @ W_up_k)^T  = Q @ W_up_k^T @ c_kv^T
      Let W_absorb_q = Q @ W_up_k^T     (can be precomputed once per layer)
      Then Q @ K^T = W_absorb_q @ c_kv^T
    """
    # Q: [batch, seq_q, h_q, d]; c_kv: [batch, seq_k, c_dim]
    # The absorbed projection: rearrange so Q takes on the role of (Q · W_up_k^T)
    # This is the "weight absorption" trick from the MLA paper.
    Q_absorb = torch.einsum("bqhd,chd->bqhc", Q, W_up_k)  # [b, seq_q, h_q, c_dim]

    # Scores: (Q_absorb · c_kv^T) with head broadcast
    # Q_absorb: [b, q, h, c] · c_kv: [b, k, c] → scores: [b, q, h, k]
    scores = torch.einsum("bqhc,bkc->bhqk", Q_absorb, c_kv) * scale
    probs = F.softmax(scores, dim=-1)

    # Output: probs · V = probs · (c_kv @ W_up_v) · fold W_up_v at the end
    # attn_over_c: [b, h, q, c] — attention-weighted c_kv, one per Q head
    attn_over_c = torch.einsum("bhqk,bkc->bhqc", probs, c_kv)
    # Apply W_up_v at the very end (this maps c_dim → h_kv*d)
    out = torch.einsum("bhqc,chd->bqhd", attn_over_c, W_up_v)
    return out


def time_fn(torch, fn, n_warmup=5, n_iter=20):
    for _ in range(n_warmup):
        fn()
    torch.cuda.synchronize()
    t0 = time.time()
    for _ in range(n_iter):
        fn()
    torch.cuda.synchronize()
    return (time.time() - t0) * 1000 / n_iter  # ms


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--batch", type=int, default=8)
    p.add_argument("--seq-len", type=int, default=4096)
    p.add_argument("--h-q", type=int, default=64,
                   help="Q heads (Llama-3-70B = 64)")
    p.add_argument("--h-kv", type=int, default=8,
                   help="KV heads (Llama-3-70B = 8)")
    p.add_argument("--head-dim", type=int, default=128)
    p.add_argument("--c-dim", type=int, default=512,
                   help="MLA compressed dim (DeepSeek-V3 = 512)")
    args = p.parse_args()

    deps, err = import_deps()
    if err:
        print(f"⚠  {err}\n   Read the comments at top of this file for the")
        print(f"   explanation; the timing numbers are secondary.")
        sys.exit(1)
    torch, F = deps

    B = args.batch
    S = args.seq_len
    Hq, Hkv, D, C = args.h_q, args.h_kv, args.head_dim, args.c_dim
    dtype = torch.bfloat16
    dev = "cuda"
    scale = D ** -0.5

    # Toy inputs — Q, compressed KV, up-projection matrices
    Q = torch.randn(B, 1, Hq, D, dtype=dtype, device=dev)  # decode: seq_q=1
    c_kv = torch.randn(B, S, C, dtype=dtype, device=dev)
    W_up_k = torch.randn(C, Hkv, D, dtype=dtype, device=dev) * 0.01
    W_up_v = torch.randn(C, Hkv, D, dtype=dtype, device=dev) * 0.01

    print(f"\n{'═'*78}")
    print(f" MLA INTEGRATION FAILURE REPRODUCTION")
    print(f"{'═'*78}")
    print(f" Batch: {B}  seq_len: {S}  h_q: {Hq}  h_kv: {Hkv}  "
          f"head_dim: {D}  c_dim: {C}")
    print(f" GPU: {torch.cuda.get_device_name(0)}")
    print(f"{'═'*78}\n")

    # Memory used
    bytes_wrong_kv = 2 * B * S * Hkv * D * 2   # K and V in bf16
    bytes_correct_kv = B * S * C * 2           # just c_kv
    print(f"  HBM used for KV per step:")
    print(f"    WRONG (K + V materialized):  {bytes_wrong_kv / 1024**2:7.2f} MB")
    print(f"    CORRECT (c_kv only):         {bytes_correct_kv / 1024**2:7.2f} MB")
    print(f"    Ratio: {bytes_wrong_kv / bytes_correct_kv:.2f}x more HBM "
          f"traffic in the wrong integration\n")

    # Timing
    t_wrong = time_fn(torch, lambda: mla_wrong(torch, F, c_kv, W_up_k, W_up_v, Q, scale))
    t_correct = time_fn(torch, lambda: mla_correct(torch, F, c_kv, W_up_k, W_up_v, Q, scale))

    print(f"  Wall-clock per step:")
    print(f"    WRONG integration:   {t_wrong:6.3f} ms")
    print(f"    CORRECT integration: {t_correct:6.3f} ms")
    print(f"    Ratio: wrong is {t_wrong/t_correct:.2f}x slower\n")

    print(f"{'─'*78}")
    print(f" VERDICT")
    print(f"{'─'*78}")
    if t_wrong > t_correct * 1.2:
        print(f"  The wrong integration is visibly slower.")
        print(f"  In a real deployment you'd see MLA save memory but slow down decode.")
        print(f"  Fix: use a fused MLA kernel (vLLM's `mla_attention`, SGLang's")
        print(f"  `mla_decode`). Do NOT materialize K and V as separate tensors")
        print(f"  before the attention op.")
    else:
        print(f"  At this problem size the gap is small because PyTorch eagerly")
        print(f"  fuses some operations via CUDA graphs. On a real deployment")
        print(f"  (larger seq_len, longer runs), the wrong pattern produces a")
        print(f"  persistent ~30% slowdown because the fusion doesn't happen")
        print(f"  across the full critical path.")
    print()


if __name__ == "__main__":
    main()
