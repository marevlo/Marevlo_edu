#!/usr/bin/env python3
"""
break_speculation_acceptance.py

FAILURE REPRODUCTION: draft model trained on one traffic distribution,
production traffic silently shifts, acceptance rate collapses.

This is the M8 war story #6 mechanism. The draft model is a small LLM
trained (or distilled) on a snapshot of production prompts. Over time,
the production traffic distribution drifts — different tenants ramp up,
seasonal patterns change, new use cases emerge. The draft model's
predictions diverge from the target model's. α falls. Speculation gives
less speedup. Cost creeps up.

What this script does:
  Simulates two token streams:
    - "train distribution" tokens: the draft model matches the target well (α ≈ 0.85)
    - "drift distribution" tokens: the draft's predictions miss more often (α ≈ 0.62)
  Shows how the aggregate α falls as the drift-traffic fraction grows,
  and converts that α drop into cost-per-token impact.

How to use:
  python break_speculation_acceptance.py --drift-fraction-sweep

  # Single scenario
  python break_speculation_acceptance.py --drift-fraction 0.5

What to look for in YOUR system:
  1. Monitor α weekly. A 7-day moving average should be stable within ±0.03.
     Wider variance suggests drift is starting.
  2. Breakdown α by tenant/class. If one segment has much lower α than
     others, that segment is the one the draft doesn't match.
  3. Compare α today to α at last retraining. If the delta is >0.10,
     retraining is overdue.
"""

import argparse
import random


def draft_target_match(is_training_dist: bool) -> bool:
    """
    Simulates one token speculation: does the draft match the target?
    Training-distribution tokens match with α=0.85; drift-distribution
    tokens match with α=0.62.
    """
    if is_training_dist:
        return random.random() < 0.85
    else:
        return random.random() < 0.62


def simulate_mix(n_tokens: int, drift_fraction: float, seed: int = 42):
    """Run n_tokens through the draft+target simulation; return aggregate stats."""
    random.seed(seed)
    matches = 0
    in_drift = 0
    in_drift_matches = 0
    for _ in range(n_tokens):
        is_drift = random.random() < drift_fraction
        if is_drift:
            in_drift += 1
            if draft_target_match(False):
                matches += 1
                in_drift_matches += 1
        else:
            if draft_target_match(True):
                matches += 1
    aggregate_alpha = matches / n_tokens
    return {
        "drift_fraction": drift_fraction,
        "aggregate_alpha": aggregate_alpha,
        "training_alpha": 0.85,
        "drift_alpha": 0.62,
        "n_tokens": n_tokens,
        "n_drift": in_drift,
    }


def speedup_from_alpha(alpha: float, k: int = 5, draft_ms: float = 1.2,
                       target_ms: float = 12) -> float:
    """Convert acceptance rate to effective speedup."""
    if alpha >= 1.0:
        e = k + 1
    else:
        e = (1 - alpha**(k + 1)) / (1 - alpha) - 1 + 1
    iter_time = k * draft_ms + target_ms
    eff_tpot = iter_time / e
    return target_ms / eff_tpot


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--drift-fraction", type=float, default=0.5,
                   help="Fraction of tokens from drifted distribution (0.0-1.0)")
    p.add_argument("--drift-fraction-sweep", action="store_true",
                   help="Sweep drift fraction 0.0 → 1.0")
    p.add_argument("--n-tokens", type=int, default=100000)
    args = p.parse_args()

    print(f"\n{'═'*82}")
    print(f" SPECULATION ACCEPTANCE RATE · DRIFT FAILURE REPRODUCTION")
    print(f"{'═'*82}")
    print(f" Training-distribution acceptance rate: α = 0.85")
    print(f" Drift-distribution acceptance rate:    α = 0.62")
    print(f" As more production traffic shifts to 'drift distribution',")
    print(f" the aggregate α falls proportionally.")
    print(f"{'═'*82}\n")

    if args.drift_fraction_sweep:
        baseline = simulate_mix(args.n_tokens, 0.0)
        baseline_speedup = speedup_from_alpha(baseline["aggregate_alpha"])

        print(f" {'drift %':>10} {'agg α':>10} {'speedup':>10} "
              f"{'cost/tok':>12} {'cost vs day 1':>18}")
        print(f" {'-'*10} {'-'*10} {'-'*10} {'-'*12} {'-'*18}")
        for df in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
            s = simulate_mix(args.n_tokens, df)
            sp = speedup_from_alpha(s["aggregate_alpha"])
            cost_mult = baseline_speedup / sp
            print(f" {100*df:>9.0f}% {s['aggregate_alpha']:>10.3f} "
                  f"{sp:>8.2f}× {1/sp:>10.3f} "
                  f"{(cost_mult - 1)*100:>+14.0f}%")

        print()
        print(f"{'─'*82}")
        print(f" INTERPRETATION")
        print(f"{'─'*82}")
        print(f" At day 1 (drift=0%), speedup is {baseline_speedup:.2f}× and that's your baseline cost.")
        print(f" By the time drift reaches 50%, aggregate α drops ~{0.85*0.5 + 0.62*0.5:.2f},")
        print(f" speedup drops to {speedup_from_alpha(0.85*0.5 + 0.62*0.5):.2f}×,")
        print(f" and per-token cost is visibly higher than baseline.")
        print(f" The drift is SLOW. It won't fire an alarm. It just makes your bill creep up.")

    else:
        s = simulate_mix(args.n_tokens, args.drift_fraction)
        baseline_speedup = speedup_from_alpha(0.85)
        current_speedup = speedup_from_alpha(s["aggregate_alpha"])
        cost_mult = baseline_speedup / current_speedup

        print(f"  At drift fraction = {args.drift_fraction:.1%}:")
        print(f"    Aggregate α:        {s['aggregate_alpha']:.3f} "
              f"(down from 0.85 at drift=0)")
        print(f"    Effective speedup:  {current_speedup:.2f}× "
              f"(down from {baseline_speedup:.2f}× baseline)")
        print(f"    Cost-per-token:     {(cost_mult - 1)*100:+.1f}% vs baseline")

    print()
    print(f"{'─'*82}")
    print(f" THE FIX (and why it works)")
    print(f"{'─'*82}")
    print(f" Re-train the draft model weekly on a rolling 7-14 day window of")
    print(f" production traffic. The draft model is small (typically 500M-1B)")
    print(f" and fine-tuning is cheap (4-8 hours on a few H100s).")
    print()
    print(f" Monitor these signals:")
    print(f"   • vllm:speculation_accept_rate — alarm if 7-day mean < 0.70")
    print(f"   • vllm:speculation_accept_rate_by_tenant — catches per-segment drift")
    print(f"   • cost_per_token_usd — alarm if rising faster than request_volume")
    print()
    print(f" Catch this BEFORE finance does. The M8 war story #6 happened because")
    print(f" nobody had the α alarm wired. Don't repeat it.")
    print()


if __name__ == "__main__":
    main()
