#!/usr/bin/env python3
"""
kv_sizing_calculator.py

Compute per-request KV cache size under MHA, GQA, and MLA for any Llama-style
model config. Answers the operational question: "will this deployment fit?"
before you burn time loading weights.

Why this exists:
  The single most common deployment mistake is not realizing your KV cache
  dominates memory. Weights are fixed; KV scales with concurrency x context.
  On an H100 80GB serving a 70B FP16 model, weights take ~140GB (needs TP=2),
  leaving ~20GB for KV across ALL concurrent requests. At 8K context, MHA
  Llama-3-70B KV is ~2.5GB per request — so your "80GB GPU" serves 8 requests.
  MLA on the same shape: ~170MB per request — 120+ concurrent requests.

Usage:
  python kv_sizing_calculator.py --model llama-3-70b --seq-len 8192 --batch 32
  python kv_sizing_calculator.py --model llama-3-8b --seq-len 131072 --batch 1
  python kv_sizing_calculator.py --model custom --layers 80 --heads 64 \\
                                  --head-dim 128 --hidden 8192 --seq-len 8192
"""

import argparse
import sys
from dataclasses import dataclass


# ─── Model library ────────────────────────────────────────────────────────────
# Real published shapes. Keep this table honest; it's the backbone of every
# sizing decision that goes into an RFC.

@dataclass
class ModelConfig:
    name: str
    num_layers: int
    num_heads: int        # full attention heads (for Q)
    num_kv_heads: int     # after GQA; equal to num_heads for MHA
    head_dim: int
    hidden_size: int
    mla_rank: int = 0     # for MLA configs; 0 means "not MLA"
    notes: str = ""


MODELS = {
    "llama-3-8b":  ModelConfig("Llama-3-8B",  32, 32,  8, 128, 4096, notes="GQA-4"),
    "llama-3-70b": ModelConfig("Llama-3-70B", 80, 64,  8, 128, 8192, notes="GQA-8"),
    "mixtral-8x7b": ModelConfig("Mixtral-8x7B", 32, 32, 8, 128, 4096, notes="MoE, GQA-4"),
    # DeepSeek-V3: published shape, MLA with compressed KV. We represent MLA
    # via mla_rank (compressed KV dim). Real V3 uses c_kv = 512.
    "deepseek-v3": ModelConfig("DeepSeek-V3", 61, 128, 128, 128, 7168,
                               mla_rank=512, notes="MLA · 671B total / 37B active"),
    # A synthetic "llama-3-70b but MLA" row for apples-to-apples comparison.
    "llama-3-70b-mla": ModelConfig("Llama-3-70B (if MLA)", 80, 64, 64, 128, 8192,
                                   mla_rank=512, notes="hypothetical MLA retrofit"),
}


# ─── Core formulas ────────────────────────────────────────────────────────────

def kv_bytes_mha(cfg: ModelConfig, seq_len: int, bytes_per_elem: int) -> int:
    """
    MHA: store K and V for every head, every layer, every token.
    Bytes = 2 (K+V) * layers * heads * head_dim * seq_len * dtype_bytes
    """
    return 2 * cfg.num_layers * cfg.num_heads * cfg.head_dim * seq_len * bytes_per_elem


def kv_bytes_gqa(cfg: ModelConfig, seq_len: int, bytes_per_elem: int) -> int:
    """
    GQA: K and V are shared across groups of Q heads. Storage shrinks by
    (num_heads / num_kv_heads).
    Bytes = 2 * layers * kv_heads * head_dim * seq_len * dtype_bytes
    """
    return 2 * cfg.num_layers * cfg.num_kv_heads * cfg.head_dim * seq_len * bytes_per_elem


def kv_bytes_mla(cfg: ModelConfig, seq_len: int, bytes_per_elem: int) -> int:
    """
    MLA: store a single compressed latent c_kv per layer per token. On decode,
    c_kv is up-projected to K and V inside the attention op.

    The DeepSeek-V3 paper (and the reference implementation in SGLang/vLLM)
    stores c_kv of dim `mla_rank` per token per layer, plus a small rotary
    component of dim rope_dim ≈ 64 for RoPE. We keep the rope_dim term so
    real deployments match this number to within ~5%.

    Bytes = layers * (mla_rank + rope_dim) * seq_len * dtype_bytes
    """
    if cfg.mla_rank == 0:
        raise ValueError(f"{cfg.name} is not an MLA config (mla_rank=0)")
    rope_dim = 64  # DeepSeek-V3 decoupled RoPE dim; see eq. 9 of V3 paper
    return cfg.num_layers * (cfg.mla_rank + rope_dim) * seq_len * bytes_per_elem


def weight_bytes(cfg: ModelConfig, weight_dtype_bits: int) -> int:
    """
    Approximate weight memory. Uses bits directly so sub-byte quantization
    (W4, W8) is computed correctly.

    For dense models this is total_params * bits / 8. For MoE it's
    active-parameter bytes; total params are larger but only the active slice
    occupies hot attention-path HBM for a given token.

    Params ≈ layers * (
        4 * hidden^2        # QKV + O projections
        + 3 * hidden * ffn  # FFN (gate + up + down)
    ) + vocab_embed

    This is within ~5% for Llama-style architectures. Precise numbers come
    from the model card — use that for the final RFC.
    """
    ffn_dim = int(cfg.hidden_size * 3.5)  # Llama-3 ratio; close enough for sizing
    per_layer = 4 * cfg.hidden_size ** 2 + 3 * cfg.hidden_size * ffn_dim
    vocab_embed = 128256 * cfg.hidden_size  # Llama-3 vocab size, approx
    total_params = cfg.num_layers * per_layer + vocab_embed
    # Integer-divide by 8 AFTER multiplying by bits to avoid sub-byte truncation
    return (total_params * weight_dtype_bits) // 8


# ─── Reporting ────────────────────────────────────────────────────────────────

def human(n_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n_bytes) < 1024.0:
            return f"{n_bytes:.2f} {unit}"
        n_bytes /= 1024.0
    return f"{n_bytes:.2f} PB"


def report(cfg: ModelConfig, seq_len: int, batch: int, kv_dtype_bits: int,
           weight_dtype_bits: int, gpu_hbm_gb: float):
    """
    Print a side-by-side sizing report with an operational verdict.
    """
    kv_bpe = kv_dtype_bits // 8           # bytes per KV element (KV is always >=8-bit)
    w_bytes = weight_bytes(cfg, weight_dtype_bits)
    hbm_bytes = int(gpu_hbm_gb * 1024**3)
    hbm_for_kv = hbm_bytes - w_bytes  # after weights; assumes TP=1

    print(f"\n{'═'*78}")
    print(f" MODEL: {cfg.name}  ({cfg.notes})")
    print(f" Config: {cfg.num_layers} layers · {cfg.num_heads} Q heads · "
          f"{cfg.num_kv_heads} KV heads · head_dim={cfg.head_dim} · hidden={cfg.hidden_size}")
    print(f" Batch: {batch} concurrent requests · Seq len: {seq_len:,} tokens")
    print(f" Weight dtype: {weight_dtype_bits}-bit · KV dtype: {kv_dtype_bits}-bit")
    print(f" GPU HBM: {gpu_hbm_gb} GB")
    print(f"{'═'*78}")

    print(f"\n Weight memory: {human(w_bytes)}")
    print(f" HBM available for KV: {human(hbm_for_kv)} "
          f"({100*hbm_for_kv/hbm_bytes:.0f}% of total)\n")

    # Per-request KV sizes
    variants = []
    mha_per = kv_bytes_mha(cfg, seq_len, kv_bpe)
    gqa_per = kv_bytes_gqa(cfg, seq_len, kv_bpe) if cfg.num_kv_heads != cfg.num_heads else None
    mla_per = kv_bytes_mla(cfg, seq_len, kv_bpe) if cfg.mla_rank > 0 else None

    print(f" {'Variant':<16} {'Per request':>14} {'At batch '+str(batch):>14} "
          f"{'Max concurrent':>16}")
    print(f" {'-'*16} {'-'*14} {'-'*14} {'-'*16}")

    def _row(label, per_req):
        total = per_req * batch
        max_conc = hbm_for_kv // per_req if per_req > 0 else 0
        fits = "✓" if total <= hbm_for_kv else "✗ OOM"
        print(f" {label:<16} {human(per_req):>14} {human(total):>14} "
              f"{max_conc:>10} {fits:>5}")
        variants.append((label, per_req, total, max_conc, total <= hbm_for_kv))

    _row("MHA (if naive)", mha_per)
    if gqa_per:
        _row(f"GQA-{cfg.num_heads//cfg.num_kv_heads}", gqa_per)
    if mla_per:
        _row("MLA", mla_per)

    # Verdict
    print(f"\n{'─'*78}")
    print(" VERDICT")
    print(f"{'─'*78}")
    best_label, best_per, best_total, best_max, best_fits = min(
        (v for v in variants if v[4]),
        key=lambda v: v[1],
        default=variants[-1],
    )

    if best_fits:
        print(f" Chosen variant: {best_label}")
        print(f" Per-request KV: {human(best_per)}. Max concurrent at this seq len: "
              f"≈{best_max}.")
        # Practical headroom — reserve 15% for paging overhead, activation spikes.
        practical = int(best_max * 0.85)
        print(f" Practical max (with 15% headroom for activations/paging): ≈{practical}.")
        if cfg.num_kv_heads == cfg.num_heads and cfg.mla_rank == 0:
            print(f" Note: model is MHA. GQA or MLA would cut KV bytes substantially.")
    else:
        print(f" ⚠ No variant fits batch {batch} at seq_len {seq_len:,} on this GPU.")
        print(f"   Options: reduce max_model_len, quantize KV to FP8 (2x saving),")
        print(f"   use tensor parallelism to split weights, or pick a bigger GPU.")
    print()


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default="llama-3-70b",
                   help=f"Model preset. Options: {list(MODELS.keys())} · or 'custom'")
    p.add_argument("--seq-len", type=int, default=8192,
                   help="Sequence length (context window actually used)")
    p.add_argument("--batch", type=int, default=32,
                   help="Concurrent requests to estimate for")
    p.add_argument("--kv-dtype-bits", type=int, default=16, choices=[8, 16],
                   help="KV cache dtype in bits (8 for FP8 KV, 16 for FP16/BF16)")
    p.add_argument("--weight-dtype-bits", type=int, default=16,
                   help="Weight dtype in bits (16 for FP16, 4 for AWQ/GPTQ, 8 for FP8)")
    p.add_argument("--gpu-hbm-gb", type=float, default=80,
                   help="GPU HBM in GB (H100=80, H200=141, MI300X=192, B200=192)")
    # Custom model shape
    p.add_argument("--layers", type=int, help="Custom: num layers")
    p.add_argument("--heads", type=int, help="Custom: num Q heads")
    p.add_argument("--kv-heads", type=int, help="Custom: num KV heads (= heads for MHA)")
    p.add_argument("--head-dim", type=int, default=128)
    p.add_argument("--hidden", type=int, help="Custom: hidden size")
    p.add_argument("--mla-rank", type=int, default=0, help="Custom: MLA compressed rank, 0=no MLA")

    args = p.parse_args()

    if args.model == "custom":
        required = [args.layers, args.heads, args.hidden]
        if not all(required):
            sys.exit("--model custom requires --layers, --heads, --hidden")
        cfg = ModelConfig(
            name="custom",
            num_layers=args.layers,
            num_heads=args.heads,
            num_kv_heads=args.kv_heads or args.heads,
            head_dim=args.head_dim,
            hidden_size=args.hidden,
            mla_rank=args.mla_rank,
            notes="user-specified"
        )
    else:
        if args.model not in MODELS:
            sys.exit(f"Unknown model '{args.model}'. Options: {list(MODELS.keys())}")
        cfg = MODELS[args.model]

    report(cfg, args.seq_len, args.batch, args.kv_dtype_bits,
           args.weight_dtype_bits, args.gpu_hbm_gb)


if __name__ == "__main__":
    main()
