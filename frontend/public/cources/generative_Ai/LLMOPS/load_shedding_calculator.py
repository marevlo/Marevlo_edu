#!/usr/bin/env python3
"""
load_shedding_calculator.py

Compute load shedding thresholds for a production LLM endpoint given
its arrival rate, service capacity, and SLO. Output: the utilization
threshold at which shedding starts, the per-class shedding priority,
and the expected SLO outcome under overload with vs without shedding.

Why this exists:
  Load shedding — proactively rejecting requests when overloaded — is
  the single most important production safety valve. Without it, every
  overload becomes a cascading failure: queues build, latency spirals,
  clients retry, capacity vanishes under retry load, users get 5xx from
  systems that are "technically still running."

  The math: given Little's Law (L = λW) and Kingman's formula (expected
  wait under M/G/1 grows as ρ/(1-ρ)), you can compute the utilization
  threshold beyond which wait time will exceed your SLO. That threshold
  is where shedding should start — BEFORE latency goes critical, not
  after.

  This script solves that calculation for you, then recommends a per-class
  shedding order based on tenant priority.

Usage:
  # Nexus v7: 1000 req/s arrival, 1100 req/s capacity, 250ms TTFT SLO
  python load_shedding_calculator.py --arrival-rate 1000 --capacity 1100 \\
      --slo-ttft-ms 250 --mean-service-ms 60

  # Sweep arrival rate to show threshold
  python load_shedding_calculator.py --arrival-rate-sweep \\
      --capacity 1100 --slo-ttft-ms 250 --mean-service-ms 60
"""

import argparse
import math
import sys


def kingman_wait_ms(rho: float, mean_service_ms: float,
                    cv_arrival: float = 1.0, cv_service: float = 0.5) -> float:
    """
    Kingman's approximation for expected waiting time in M/G/1 queue.

    E[W] ≈ (ρ / (1-ρ)) × (CV_a² + CV_s²) / 2 × E[S]

    Where:
      ρ = utilization (arrival rate / service rate)
      CV_a = coefficient of variation of arrival times (1.0 for Poisson)
      CV_s = coefficient of variation of service times (0.5 for moderately
             regular — LLM inference is mostly bandwidth-bound so service
             time is more predictable than M/M/1 would assume)
      E[S] = mean service time

    Returns expected wait in ms (not including service time).
    """
    if rho >= 1.0:
        return float('inf')
    return (rho / (1 - rho)) * ((cv_arrival**2 + cv_service**2) / 2) * mean_service_ms


def expected_ttft_ms(rho: float, mean_service_ms: float) -> float:
    """Expected TTFT = expected wait + service time."""
    return kingman_wait_ms(rho, mean_service_ms) + mean_service_ms


def find_shedding_threshold(capacity_per_sec: float, mean_service_ms: float,
                             slo_ttft_ms: float) -> float:
    """
    Find the utilization ρ* at which expected TTFT crosses the SLO.
    Below ρ*, we're safe. Above ρ*, shedding should kick in.

    Binary search since Kingman's formula is monotonic in ρ.
    """
    lo, hi = 0.01, 0.999
    for _ in range(50):
        mid = (lo + hi) / 2
        ttft = expected_ttft_ms(mid, mean_service_ms)
        if ttft > slo_ttft_ms:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--arrival-rate", type=float, default=1000,
                   help="Current arrival rate (req/s)")
    p.add_argument("--capacity", type=float, default=1100,
                   help="Service capacity (req/s at peak)")
    p.add_argument("--slo-ttft-ms", type=float, default=250,
                   help="TTFT SLO in ms")
    p.add_argument("--mean-service-ms", type=float, default=60,
                   help="Mean service time (prefill + some decode)")
    p.add_argument("--arrival-rate-sweep", action="store_true",
                   help="Sweep arrival rate from 50% to 120% of capacity")
    args = p.parse_args()

    if args.arrival_rate_sweep:
        # Sweep
        print(f"\n{'═'*82}")
        print(f" LOAD SHEDDING THRESHOLD · ARRIVAL-RATE SWEEP")
        print(f"{'═'*82}")
        print(f" Capacity: {args.capacity} req/s   Service: {args.mean_service_ms} ms   "
              f"SLO: {args.slo_ttft_ms} ms")
        print(f"{'═'*82}\n")
        print(f" {'arrival':>10} {'ρ (util)':>10} {'E[wait] ms':>14} "
              f"{'E[TTFT] ms':>14} {'SLO':>8}")
        print(f" {'-'*10} {'-'*10} {'-'*14} {'-'*14} {'-'*8}")
        for mult in [0.5, 0.7, 0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2]:
            arr = args.capacity * mult
            rho = arr / args.capacity
            wait = kingman_wait_ms(rho, args.mean_service_ms)
            ttft = wait + args.mean_service_ms
            slo_mark = "✓" if ttft <= args.slo_ttft_ms else "✗ miss"
            wait_str = f"{wait:8.1f}" if wait < 99999 else "    ∞"
            ttft_str = f"{ttft:8.1f}" if ttft < 99999 else "    ∞"
            print(f" {arr:>8.0f}/s {rho:>10.3f} {wait_str:>12} ms "
                  f"{ttft_str:>12} ms {slo_mark:>8}")

        threshold = find_shedding_threshold(args.capacity, args.mean_service_ms,
                                             args.slo_ttft_ms)
        print()
        print(f"{'─'*82}")
        print(f" VERDICT")
        print(f"{'─'*82}")
        print(f" Shedding threshold: ρ* = {threshold:.3f}")
        print(f" Equivalent arrival rate: {threshold * args.capacity:.0f} req/s")
        print(f" Start shedding ABOVE this arrival rate to keep TTFT ≤ SLO.")
        print()
        return

    # Single calculation
    rho = args.arrival_rate / args.capacity
    wait = kingman_wait_ms(rho, args.mean_service_ms)
    ttft = wait + args.mean_service_ms
    threshold = find_shedding_threshold(args.capacity, args.mean_service_ms,
                                         args.slo_ttft_ms)
    shed_arrival_rate = threshold * args.capacity

    print(f"\n{'═'*82}")
    print(f" LOAD SHEDDING CALCULATOR")
    print(f"{'═'*82}")
    print(f" Arrival:  {args.arrival_rate} req/s")
    print(f" Capacity: {args.capacity} req/s")
    print(f" Utilization ρ = {rho:.3f}")
    print(f"{'═'*82}\n")

    print(f"  Current state:")
    print(f"    E[wait time]:    {wait:.1f} ms")
    print(f"    E[TTFT]:         {ttft:.1f} ms  (SLO: {args.slo_ttft_ms} ms)")
    if ttft <= args.slo_ttft_ms:
        print(f"    SLO:             ✓ holding")
    else:
        overshoot = ttft - args.slo_ttft_ms
        print(f"    SLO:             ✗ overshooting by {overshoot:.1f} ms")
    print()
    print(f"  Shedding threshold:")
    print(f"    Critical utilization ρ*: {threshold:.3f}")
    print(f"    Equivalent arrival rate: {shed_arrival_rate:.0f} req/s")
    print(f"    Safety margin from ρ*:   {(threshold - rho)/threshold*100:+.1f}%")
    print()

    # Recommended shedding order
    print(f"  Recommended shedding order (drop in this order during overload):")
    print(f"    1. Batch-class requests (loose SLO, can retry later)")
    print(f"    2. Standard-class from non-priority tenants")
    print(f"    3. Standard-class from all tenants")
    print(f"    4. Interactive-class from non-priority tenants (last resort)")
    print(f"    — NEVER shed interactive from priority tenants; scale up instead.")
    print()

    # Verdict
    print(f"{'─'*82}")
    print(f" VERDICT")
    print(f"{'─'*82}")
    if rho < threshold * 0.85:
        print(f" ✓ Healthy. Utilization ρ={rho:.3f} is well below the critical "
              f"threshold {threshold:.3f}.")
        print(f"   No shedding needed. Keep autoscaler tuned to scale up around ρ=0.75.")
    elif rho < threshold:
        print(f" ⚠ Approaching shedding zone. ρ={rho:.3f} is "
              f"{(threshold-rho)*100:.1f}pp below threshold {threshold:.3f}.")
        print(f"   Enable shedding at gateway with threshold ρ={threshold:.3f}.")
        print(f"   Start by shedding batch-class (loose SLO).")
    else:
        print(f" ✗ ABOVE SHEDDING THRESHOLD. ρ={rho:.3f} exceeds critical "
              f"threshold {threshold:.3f}.")
        print(f"   SLO compliance is degrading RIGHT NOW. Options:")
        print(f"   • Immediate: shed at gateway (drop batch-class to "
              f"{shed_arrival_rate:.0f} req/s)")
        print(f"   • Short-term: scale up decode pool by "
              f"{((rho - threshold) / threshold * 100):.0f}%")
        print(f"   • Investigate: has arrival rate grown, or has service time regressed?")
    print()


if __name__ == "__main__":
    main()
