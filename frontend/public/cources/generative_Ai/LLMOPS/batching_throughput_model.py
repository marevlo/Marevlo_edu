#!/usr/bin/env python3
"""
batching_throughput_model.py

Compute expected throughput and per-request TPOT at every batch size under
continuous batching. Find the knee of the throughput curve — the point
where adding more concurrent requests stops gaining throughput and only
costs per-request latency.

Why this exists:
  "Higher batch = higher throughput, right?" Almost, but not quite. Decode
  is memory-bandwidth-bound. Once batch is large enough that HBM bandwidth
  is saturated, adding more requests doesn't help throughput — it just
  queues up behind each other. The knee of the curve is workload-dependent
  and shifts with model size, KV dtype, and hardware. This script tells you
  where it is BEFORE you burn a week benchmarking.

  The goal: find the batch size that delivers 90%+ of peak throughput while
  keeping per-request TPOT below your SLO. Deploying at peak-throughput
  batch size is usually a latency mistake.

Usage:
  # Nexus v5 on H200
  python batching_throughput_model.py --model llama-3-70b-fp8 \\
      --hardware h200 --tpot-ms 12 --mean-output-tokens 180

  # Different model / hardware
  python batching_throughput_model.py --model llama-3-8b \\
      --hardware h100
"""

import argparse
import math
import sys


# ─── Hardware HBM bandwidth (GB/s) ────────────────────────────────────────────
# These are real-world effective bandwidths (70-85% of theoretical peak)
HBM_BW_GB_S = {
    "h100":     3050,   # H100 SXM80 realistic: 3.35 TB/s peak * ~0.91 effective
    "h200":     4400,   # H200 SXM: 4.8 TB/s peak * ~0.92 effective
    "b200":     7000,   # B200: ~8 TB/s peak * ~0.88
    "mi300x":   4800,   # MI300X: 5.3 TB/s * ~0.91
    "a100":     1800,   # A100 80GB: ~2 TB/s * ~0.90
}


# ─── Model KV + weight bytes per decode step ─────────────────────────────────
# Per decode step, the memory-bandwidth bottleneck reads:
#   1) All model weights once (amortized across batch)
#   2) KV for every token in every concurrent request
#   3) Small activation tensors (negligible vs weights/KV)

MODELS = {
    # (weight_bytes_gb, kv_bytes_per_token)
    "llama-3-8b":       ( 16.0,  131072),  # 8B BF16
    "llama-3-8b-fp8":   (  8.0,   65536),
    "llama-3-70b":      (140.0,  327680),  # 70B BF16
    "llama-3-70b-awq":  ( 37.0,  327680),  # AWQ W4 weights, BF16 KV
    "llama-3-70b-fp8":  ( 37.0,  163840),  # AWQ W4 + FP8 KV (Nexus v5)
    "mixtral-8x7b-moe": ( 26.0,  131072),  # 13B active params (FP16)
}


# ─── Launch overhead (ms) ─────────────────────────────────────────────────────
# CUDA kernel launch + scheduler overhead per decode step. Pays per step,
# independent of batch size. CUDA graphs can reduce this 5-10x when enabled.
LAUNCH_OVERHEAD_MS = {
    "eager":     2.5,    # No CUDA graphs — naive mode
    "graphs":    0.35,   # CUDA graphs enabled for common batch sizes
}


# ─── Core model ───────────────────────────────────────────────────────────────

def tpot_at_batch(batch: int, model_key: str, hw_key: str,
                  context_tokens: int, launch_mode: str) -> dict:
    """
    Estimate per-step time (= per-token time per request) at a given batch size.

    Decode step time ≈ max(compute_time, memory_time) + launch_overhead
    Memory time dominates for decode:
      - read weights once (amortized)
      - read KV cache for all batch * context tokens
    """
    weight_gb, kv_per_tok = MODELS[model_key]
    bw = HBM_BW_GB_S[hw_key]
    launch_ms = LAUNCH_OVERHEAD_MS[launch_mode]

    # Total bytes read per step (for decode, compute is negligible):
    #   weights once + KV for (batch * context) tokens
    kv_gb = batch * context_tokens * kv_per_tok / 1024**3
    total_gb = weight_gb + kv_gb
    memory_ms = (total_gb / bw) * 1000

    # Step time
    step_ms = memory_ms + launch_ms

    # Throughput: at steady state every step emits `batch` tokens
    tokens_per_sec = batch / (step_ms / 1000)

    return {
        "batch": batch,
        "step_ms": step_ms,
        "memory_ms": memory_ms,
        "tpot_ms_per_request": step_ms,  # continuous batching: each request gets 1 token per step
        "throughput_tok_s": tokens_per_sec,
        "weight_gb": weight_gb,
        "kv_gb": kv_gb,
    }


def find_knee(results):
    """
    Find the batch size at 90% of peak throughput (the knee).
    Returns (knee_batch, knee_result).
    """
    peak = max(r["throughput_tok_s"] for r in results)
    threshold = 0.90 * peak
    # Smallest batch that achieves 90% of peak
    for r in sorted(results, key=lambda x: x["batch"]):
        if r["throughput_tok_s"] >= threshold:
            return r
    return results[-1]


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default="llama-3-70b-fp8",
                   help=f"Model config. Options: {list(MODELS.keys())}")
    p.add_argument("--hardware", default="h200",
                   help=f"GPU. Options: {list(HBM_BW_GB_S.keys())}")
    p.add_argument("--mean-context-tokens", type=int, default=2000,
                   help="Mean context length being decoded against (prompt + so-far output)")
    p.add_argument("--mean-output-tokens", type=int, default=180,
                   help="Mean output tokens per request (for request-time calc)")
    p.add_argument("--tpot-ms", type=float, default=15,
                   help="TPOT SLO target in ms")
    p.add_argument("--launch-mode", default="graphs", choices=["eager", "graphs"],
                   help="CUDA graph mode (graphs=enabled, eager=disabled)")
    p.add_argument("--batch-sizes", default="1,2,4,8,16,32,64,96,128,192,256",
                   help="Comma-separated batch sizes to evaluate")
    args = p.parse_args()

    if args.model not in MODELS:
        sys.exit(f"Unknown model. Options: {list(MODELS.keys())}")
    if args.hardware not in HBM_BW_GB_S:
        sys.exit(f"Unknown hardware. Options: {list(HBM_BW_GB_S.keys())}")

    batch_sizes = [int(b) for b in args.batch_sizes.split(",")]

    print(f"\n{'═'*82}")
    print(f" BATCHING THROUGHPUT MODEL")
    print(f"{'═'*82}")
    print(f" Model:  {args.model}  "
          f"(weights {MODELS[args.model][0]} GB, "
          f"KV {MODELS[args.model][1]/1024:.0f} KB/token)")
    print(f" HW:     {args.hardware}  ({HBM_BW_GB_S[args.hardware]} GB/s effective HBM BW)")
    print(f" Context: {args.mean_context_tokens:,} tokens mean  "
          f"Launch: {args.launch_mode}  TPOT SLO: {args.tpot_ms} ms")
    print(f"{'═'*82}\n")

    header = f" {'batch':>6} {'step_ms':>10} {'TPOT/req':>10} "\
             f"{'throughput':>14} {'kv_gb':>10} {'SLO':>8}"
    print(header)
    print(" " + "-" * (len(header) - 1))

    results = []
    for b in batch_sizes:
        r = tpot_at_batch(b, args.model, args.hardware,
                          args.mean_context_tokens, args.launch_mode)
        results.append(r)
        slo = "✓" if r["tpot_ms_per_request"] <= args.tpot_ms else "✗ MISS"
        print(f" {b:>6} {r['step_ms']:>9.2f} ms {r['tpot_ms_per_request']:>8.2f} ms "
              f"{r['throughput_tok_s']:>10,.0f} tok/s {r['kv_gb']:>8.1f} GB {slo:>8}")

    print()

    # Peak throughput, knee, and SLO-compliant batch
    peak_r = max(results, key=lambda r: r["throughput_tok_s"])
    knee_r = find_knee(results)
    slo_compliant = [r for r in results if r["tpot_ms_per_request"] <= args.tpot_ms]
    slo_peak = max(slo_compliant, key=lambda r: r["throughput_tok_s"]) if slo_compliant else None

    print(f"{'─'*82}")
    print(f" VERDICT")
    print(f"{'─'*82}")
    print(f" Peak throughput:       {peak_r['throughput_tok_s']:,.0f} tok/s "
          f"at batch={peak_r['batch']} "
          f"(TPOT {peak_r['tpot_ms_per_request']:.1f} ms)")
    print(f" Knee (90% of peak):    {knee_r['throughput_tok_s']:,.0f} tok/s "
          f"at batch={knee_r['batch']} "
          f"(TPOT {knee_r['tpot_ms_per_request']:.1f} ms)")
    if slo_peak:
        print(f" SLO-compliant best:    {slo_peak['throughput_tok_s']:,.0f} tok/s "
              f"at batch={slo_peak['batch']} "
              f"(TPOT {slo_peak['tpot_ms_per_request']:.1f} ms, SLO {args.tpot_ms} ms)")
        print()
        if slo_peak['batch'] < knee_r['batch']:
            print(f" Ship batch={slo_peak['batch']}. At this batch you hit the TPOT SLO.")
            print(f" Going higher (to knee at batch={knee_r['batch']}) gains "
                  f"{100*(knee_r['throughput_tok_s']/slo_peak['throughput_tok_s']-1):.0f}% throughput")
            print(f" but blows the {args.tpot_ms} ms SLO.")
        else:
            print(f" Ship batch={knee_r['batch']}. Past the knee adds "
                  f"{100*(peak_r['throughput_tok_s']/knee_r['throughput_tok_s']-1):.0f}% throughput")
            print(f" at the cost of {peak_r['tpot_ms_per_request']-knee_r['tpot_ms_per_request']:.1f} ms")
            print(f" per request — rarely worth it.")
    else:
        print(f" ✗ No batch size meets TPOT SLO of {args.tpot_ms} ms.")
        print(f"   Even batch=1 is {results[0]['tpot_ms_per_request']:.1f} ms.")
        print(f"   Options: smaller model, better GPU, or relax SLO.")

    print()
    print(f" This model is DECODE-BOUND by memory bandwidth. HBM is the")
    print(f" scarce resource. Improvements that help:")
    print(f"   • Smaller KV (FP8, MLA, GQA with fewer groups)")
    print(f"   • Smaller weights (quantization — {MODELS[args.model][0]:.0f} GB → less)")
    print(f"   • Faster HBM (H200 is 1.4× H100, B200 is 2.3×)")
    print(f"   • Speculative decoding (emit multiple tokens per HBM read pass)")
    print()


if __name__ == "__main__":
    main()
