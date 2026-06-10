#!/usr/bin/env python3
"""
speculative_decoding_calculator.py

Compute the acceptance-rate math for speculative decoding. Given the draft
acceptance rate α, speculation length K, draft model step time, and target
model step time, compute:

  - Expected tokens accepted per verification pass: E[accepted] = Σ α^i for i=0..K
  - Effective tokens per big-model pass: 1 + E[accepted]
  - Effective TPOT: (K * draft_ms + target_ms) / effective_tokens
  - Cost per token relative to baseline (no speculation)

This is the formula every speculative-decoding config should be designed
around. It tells you whether speculation is worth deploying for YOUR
workload, YOUR α, and YOUR draft model.

Why this exists:
  Speculative decoding is oversold with "3x speedup" claims that assume
  α=0.9. In production, α drifts — your draft model was trained on last
  month's traffic distribution; this month's traffic is different; α
  drops from 0.85 to 0.62; your "3x speedup" quietly becomes 1.6x; nobody
  notices because the infra dashboards all show green.

  The formula below tells you exactly how sensitive speedup is to α, so
  you know what to monitor and what alarm thresholds to set.

Usage:
  # Nexus v5: EAGLE-2 with α=0.85, K=5, draft 1.2ms, target 12ms
  python speculative_decoding_calculator.py --alpha 0.85 --k 5 \\
      --draft-ms 1.2 --target-ms 12

  # Sweep α to see sensitivity
  python speculative_decoding_calculator.py --alpha-sweep --k 5 \\
      --draft-ms 1.2 --target-ms 12

  # Compare different K values at fixed α
  python speculative_decoding_calculator.py --alpha 0.80 --k-sweep \\
      --draft-ms 1.2 --target-ms 12
"""

import argparse
import sys


def effective_tokens(alpha: float, k: int) -> float:
    """
    Expected number of tokens accepted per verification pass.

    The draft proposes K tokens. Each is accepted with probability α
    (approximately, assuming independence — the actual rejection sampling
    formula is more complex but this is within 2% for production regimes).
    Tokens are accepted until the first rejection, then one more token is
    added by the target model (the resampled token at the rejection point).

    E[accepted] = P(first reject at position 1) * 0 + P(at 2) * 1 + ...
                = Σ α^i * (1-α) * i  for i=0..K-1
                + α^K * K             (all accepted case)

    Equivalent closed form (and more numerically stable):
        E[accepted] = (1 - α^(K+1)) / (1 - α) - 1  if α != 1
                    = K                             if α == 1

    Plus 1 token from the target model pass itself (the bonus token at
    rejection, or the continuation after the final accepted draft).
    """
    if alpha >= 1.0:
        return k + 1  # all K draft accepted + 1 target-emitted
    expected_accepted = (1 - alpha**(k+1)) / (1 - alpha) - 1
    return expected_accepted + 1  # +1 for target's own emission


def speculation_stats(alpha: float, k: int, draft_ms: float, target_ms: float) -> dict:
    """
    Full speculation timing model.

    Each iteration:
      1. Draft proposes K tokens: cost = K * draft_ms
      2. Target verifies in ONE forward pass: cost = target_ms
      3. Emit E[accepted] tokens (see effective_tokens above)

    Effective TPOT = (K * draft_ms + target_ms) / E[tokens emitted per iteration]
    """
    eff_tokens = effective_tokens(alpha, k)
    iter_time_ms = k * draft_ms + target_ms
    effective_tpot = iter_time_ms / eff_tokens
    baseline_tpot = target_ms  # without speculation
    speedup = baseline_tpot / effective_tpot
    return {
        "alpha": alpha,
        "k": k,
        "expected_tokens_per_iter": eff_tokens,
        "iter_time_ms": iter_time_ms,
        "effective_tpot_ms": effective_tpot,
        "baseline_tpot_ms": baseline_tpot,
        "speedup": speedup,
        "cost_multiplier": 1 / speedup,
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--alpha", type=float, default=0.85,
                   help="Draft-model acceptance rate (typical 0.65-0.9)")
    p.add_argument("--k", type=int, default=5,
                   help="Speculation length (tokens drafted per iteration)")
    p.add_argument("--draft-ms", type=float, default=1.2,
                   help="Draft model step time in ms")
    p.add_argument("--target-ms", type=float, default=12,
                   help="Target model step time in ms")
    p.add_argument("--alpha-sweep", action="store_true",
                   help="Sweep alpha from 0.5 to 0.95")
    p.add_argument("--k-sweep", action="store_true",
                   help="Sweep K from 1 to 10")
    args = p.parse_args()

    print(f"\n{'═'*82}")
    print(f" SPECULATIVE DECODING CALCULATOR")
    print(f"{'═'*82}")
    print(f" Draft step: {args.draft_ms} ms   Target step: {args.target_ms} ms   "
          f"Ratio: {args.target_ms/args.draft_ms:.1f}×")
    print(f"{'═'*82}\n")

    if args.alpha_sweep:
        print(f" Sweeping α at K={args.k}")
        print(f" {'-'*72}")
        print(f" {'α':>6} {'E[tokens/iter]':>16} {'iter ms':>10} {'eff TPOT':>10} "
              f"{'speedup':>10}")
        print(f" {'-'*72}")
        for alpha in [0.50, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]:
            s = speculation_stats(alpha, args.k, args.draft_ms, args.target_ms)
            print(f" {alpha:>6.2f} {s['expected_tokens_per_iter']:>14.2f}   "
                  f"{s['iter_time_ms']:>8.2f}  {s['effective_tpot_ms']:>8.2f}  "
                  f"{s['speedup']:>8.2f}×")
        print()
        print(f"{'─'*82}")
        print(f" VERDICT")
        print(f"{'─'*82}")
        s_low = speculation_stats(0.60, args.k, args.draft_ms, args.target_ms)
        s_tgt = speculation_stats(0.85, args.k, args.draft_ms, args.target_ms)
        delta_pct = 100 * (s_tgt['speedup'] - s_low['speedup']) / s_tgt['speedup']
        print(f" Sensitivity: α drop from 0.85 → 0.60 reduces speedup by {delta_pct:.0f}%.")
        print(f" Monitor α with alarm threshold: alarm if α < 0.70 for 1h sustained.")
        print(f" Acceptance-rate drift is the #1 silent cost regression in speculation.")
        print()
        return

    if args.k_sweep:
        print(f" Sweeping K at α={args.alpha}")
        print(f" {'-'*72}")
        print(f" {'K':>4} {'E[tokens/iter]':>16} {'iter ms':>10} {'eff TPOT':>10} "
              f"{'speedup':>10}")
        print(f" {'-'*72}")
        for k in range(1, 11):
            s = speculation_stats(args.alpha, k, args.draft_ms, args.target_ms)
            print(f" {k:>4} {s['expected_tokens_per_iter']:>14.2f}   "
                  f"{s['iter_time_ms']:>8.2f}  {s['effective_tpot_ms']:>8.2f}  "
                  f"{s['speedup']:>8.2f}×")
        print()
        # Find peak
        best_k = max(range(1, 11),
                     key=lambda k: speculation_stats(args.alpha, k, args.draft_ms, args.target_ms)['speedup'])
        best = speculation_stats(args.alpha, best_k, args.draft_ms, args.target_ms)
        print(f"{'─'*82}")
        print(f" VERDICT")
        print(f"{'─'*82}")
        print(f" Optimal K at α={args.alpha}: K={best_k} "
              f"(speedup {best['speedup']:.2f}×, effective TPOT {best['effective_tpot_ms']:.2f} ms).")
        print(f" Going higher increases wasted draft work; going lower underuses speculation.")
        print()
        return

    # Single calculation
    s = speculation_stats(args.alpha, args.k, args.draft_ms, args.target_ms)
    print(f"  Configuration:")
    print(f"    α (acceptance rate):  {args.alpha}")
    print(f"    K (speculation len):  {args.k}")
    print(f"    Draft model step:     {args.draft_ms} ms")
    print(f"    Target model step:    {args.target_ms} ms")
    print()
    print(f"  Derived:")
    print(f"    E[tokens per big pass]:    {s['expected_tokens_per_iter']:.2f}")
    print(f"    Iteration time:            {s['iter_time_ms']:.2f} ms")
    print(f"    Effective TPOT:            {s['effective_tpot_ms']:.2f} ms")
    print(f"    Baseline (no speculation): {s['baseline_tpot_ms']:.2f} ms")
    print(f"    Speedup:                   {s['speedup']:.2f}×")
    print(f"    Cost multiplier (vs baseline): {s['cost_multiplier']:.2f}×")
    print()

    print(f"{'─'*82}")
    print(f" VERDICT")
    print(f"{'─'*82}")
    if s['speedup'] > 1.5:
        print(f" ✓ Deploy speculation. At α={args.alpha}, K={args.k}, the configuration")
        print(f"   delivers {s['speedup']:.2f}× effective throughput per big-model pass.")
        print(f"   On a per-token cost basis: {100*(1-s['cost_multiplier']):.0f}% cheaper.")
        print()
        print(f" MONITOR THESE PRODUCTION METRICS:")
        print(f"   1. Acceptance rate α — should sit around {args.alpha:.2f}.")
        print(f"      Alarm if drops below {max(0.5, args.alpha-0.15):.2f} for 1h.")
        print(f"   2. Draft-to-target time ratio — should be ~{args.draft_ms/args.target_ms:.2f}.")
        print(f"      If target model changes but draft doesn't, ratio worsens.")
        print(f"   3. Effective tokens per big pass (derived) — current {s['expected_tokens_per_iter']:.2f}.")
        print(f"      Drift below 2.5 means speculation is barely paying.")
    elif s['speedup'] > 1.1:
        print(f" ⚠ Marginal. At {s['speedup']:.2f}× speedup, speculation is barely paying.")
        print(f"   Options: retrain draft model for higher α, reduce K, or disable.")
        print(f"   The operational overhead of maintaining a second model may exceed")
        print(f"   the gain. Benchmark a month of production traffic before committing.")
    else:
        print(f" ✗ Don't deploy. Speedup {s['speedup']:.2f}× is within benchmark noise.")
        print(f"   At α={args.alpha}, speculation doesn't pay off. Either:")
        print(f"   • The draft model doesn't match the target (retrain)")
        print(f"   • K is too high (try K=3)")
        print(f"   • Draft step is too expensive vs target (use a smaller draft)")

    print()


if __name__ == "__main__":
    main()
