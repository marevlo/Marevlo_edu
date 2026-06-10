#!/usr/bin/env python3
"""
chunked_prefill_calculator.py

Compute the right chunked-prefill chunk size given:
  - Your TTFT SLO budget
  - Expected prefill length distribution (p50, p99)
  - Decode TPOT on the same hardware

The goal of chunked prefill is to let decode progress between chunks of a
long prefill, so long-prompt requests don't stall short requests' decode.
Too-small chunks = too much kernel launch overhead. Too-large chunks =
long pauses for decode. This script finds the sweet spot.

Usage:
  # Nexus v4 config: TTFT budget 250ms, prefill distribution centered at 2K
  python chunked_prefill_calculator.py --ttft-budget-ms 250 \\
      --prefill-p50 2048 --prefill-p99 8192 --tpot-ms 12 \\
      --prefill-throughput-tok-per-sec 15000
"""

import argparse
import math
import sys


def chunks_needed(prefill_len: int, chunk_size: int) -> int:
    return math.ceil(prefill_len / chunk_size)


def simulate(prefill_len: int, chunk_size: int, prefill_throughput: float,
             kernel_launch_overhead_ms: float, tpot_ms: float,
             concurrent_decode_requests: int) -> dict:
    """
    Estimate:
      - TTFT for this prefill request (time to its first token, after the
        LAST chunk is processed)
      - Max decode stall time for concurrent decode requests (the longest
        any chunk holds the GPU — roughly chunk_size / throughput)
      - Total overhead from kernel launches across all chunks
    """
    n_chunks = chunks_needed(prefill_len, chunk_size)

    # Time per chunk = chunk_size tokens at prefill throughput + launch overhead
    # Prefill throughput is compute-bound once chunks are large enough; small
    # chunks suffer from launch overhead eating into the effective throughput.
    chunk_time_ms = (chunk_size / prefill_throughput) * 1000 + kernel_launch_overhead_ms

    # Each chunk holds the GPU while it runs, delaying concurrent decode by
    # roughly chunk_time_ms. That's the "decode stall" we're trying to bound.
    max_decode_stall_ms = chunk_time_ms

    # TTFT ≈ total prefill time + first-token decode
    ttft_ms = n_chunks * chunk_time_ms + tpot_ms

    # Overhead from launches
    launch_overhead_ms = n_chunks * kernel_launch_overhead_ms

    return {
        "n_chunks": n_chunks,
        "chunk_time_ms": chunk_time_ms,
        "max_decode_stall_ms": max_decode_stall_ms,
        "ttft_ms": ttft_ms,
        "launch_overhead_ms": launch_overhead_ms,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--ttft-budget-ms", type=float, default=250,
                   help="TTFT SLO budget in milliseconds")
    p.add_argument("--prefill-p50", type=int, default=2048,
                   help="Median prefill length (tokens)")
    p.add_argument("--prefill-p99", type=int, default=8192,
                   help="99th-percentile prefill length (tokens)")
    p.add_argument("--tpot-ms", type=float, default=12,
                   help="Tokens-per-output-token time in ms on your hardware")
    p.add_argument("--prefill-throughput-tok-per-sec", type=float, default=15000,
                   help="Steady-state prefill throughput (tokens/sec for a single request)")
    p.add_argument("--kernel-launch-overhead-ms", type=float, default=0.6,
                   help="Per-chunk kernel launch and scheduling overhead in ms")
    p.add_argument("--max-decode-stall-target-ms", type=float, default=40,
                   help="Max acceptable stall for concurrent decode (aim for < p99 TPOT)")
    p.add_argument("--chunk-sizes", default="128,256,512,1024,2048,4096",
                   help="Chunk sizes to evaluate")
    args = p.parse_args()

    chunk_sizes = [int(c) for c in args.chunk_sizes.split(",")]

    print(f"\n{'═'*82}")
    print(f" CHUNKED PREFILL CALCULATOR")
    print(f"{'═'*82}")
    print(f" TTFT SLO budget: {args.ttft_budget_ms} ms   "
          f"TPOT: {args.tpot_ms} ms   "
          f"Prefill throughput: {args.prefill_throughput_tok_per_sec:,.0f} tok/s")
    print(f" Prefill p50: {args.prefill_p50:,}  p99: {args.prefill_p99:,} tokens")
    print(f" Max decode-stall target: {args.max_decode_stall_target_ms} ms")
    print(f"{'═'*82}\n")

    print(f" Evaluating at p99 prefill ({args.prefill_p99:,} tokens)")
    print(f" {'-'*82}")
    print(f" {'chunk_size':>11} {'n_chunks':>10} {'chunk_time':>12} "
          f"{'TTFT':>10} {'stall':>10} {'launch oh':>12} {'verdict':>14}")
    print(f" {'-'*82}")

    results = []
    for cs in chunk_sizes:
        r = simulate(args.prefill_p99, cs, args.prefill_throughput_tok_per_sec,
                     args.kernel_launch_overhead_ms, args.tpot_ms,
                     concurrent_decode_requests=1)
        ttft_ok = r["ttft_ms"] <= args.ttft_budget_ms
        stall_ok = r["max_decode_stall_ms"] <= args.max_decode_stall_target_ms
        if ttft_ok and stall_ok:
            verdict = "✓ ok"
        elif not stall_ok and ttft_ok:
            verdict = "decode stall"
        elif not ttft_ok and stall_ok:
            verdict = "TTFT miss"
        else:
            verdict = "fails both"
        results.append((cs, r, verdict))
        print(f" {cs:>11,} {r['n_chunks']:>10} "
              f"{r['chunk_time_ms']:>10.1f} ms "
              f"{r['ttft_ms']:>8.1f} ms "
              f"{r['max_decode_stall_ms']:>8.1f} ms "
              f"{r['launch_overhead_ms']:>10.1f} ms {verdict:>14}")

    print()
    # Pick the largest chunk size that satisfies BOTH constraints (larger is
    # better once both are met, because it minimizes launch overhead)
    ok = [(cs, r) for cs, r, v in results if v == "✓ ok"]
    print(f"{'─'*82}")
    print(f" VERDICT")
    print(f"{'─'*82}")
    if ok:
        cs, r = max(ok, key=lambda t: t[0])  # largest acceptable chunk
        print(f" Ship chunk_size={cs}.")
        print(f"   TTFT at p99 prefill: {r['ttft_ms']:.0f}ms (budget: "
              f"{args.ttft_budget_ms:.0f}ms).")
        print(f"   Max decode stall: {r['max_decode_stall_ms']:.1f}ms "
              f"(target: {args.max_decode_stall_target_ms:.0f}ms).")
        print(f"   Launch overhead: {r['launch_overhead_ms']:.1f}ms across "
              f"{r['n_chunks']} chunks.")
    else:
        print(f" ✗ No chunk size satisfies both TTFT and decode-stall targets.")
        # Find best compromise
        best_ttft = min(results, key=lambda t: t[1]["ttft_ms"])
        best_stall = min(results, key=lambda t: t[1]["max_decode_stall_ms"])
        print(f"   Best TTFT:  chunk_size={best_ttft[0]} → TTFT "
              f"{best_ttft[1]['ttft_ms']:.0f}ms (over by "
              f"{best_ttft[1]['ttft_ms'] - args.ttft_budget_ms:.0f}ms)")
        print(f"   Best stall: chunk_size={best_stall[0]} → stall "
              f"{best_stall[1]['max_decode_stall_ms']:.1f}ms (over by "
              f"{best_stall[1]['max_decode_stall_ms'] - args.max_decode_stall_target_ms:.1f}ms)")
        print(f"   Options: relax the TTFT budget, shorten p99 prefill (cap")
        print(f"   max_model_len), or move to disaggregated prefill/decode.")
    print()

    # p50 comparison
    print(f" At p50 prefill ({args.prefill_p50:,} tokens):")
    for cs in chunk_sizes:
        r_p50 = simulate(args.prefill_p50, cs, args.prefill_throughput_tok_per_sec,
                         args.kernel_launch_overhead_ms, args.tpot_ms, 1)
        print(f"   chunk_size={cs:>4}: {r_p50['n_chunks']:>2} chunks, "
              f"TTFT {r_p50['ttft_ms']:.0f} ms")
    print()


if __name__ == "__main__":
    main()
