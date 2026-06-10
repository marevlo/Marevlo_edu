#!/usr/bin/env python3
"""
retry_storm_simulator.py

Simulate how a brief upstream failure, combined with naive client-side
retries, amplifies into a sustained outage. Shows why retry budgets and
jittered backoff are production non-negotiables.

Why this exists:
  The classic distributed-systems failure: one pod misbehaves for 10
  seconds; clients retry; each retry adds more load to already-struggling
  servers; healthy pods start timing out; more retries; system collapses.
  This is called a "retry storm" and it has taken down every major cloud
  at least once.

  The mechanism is simple arithmetic: at retries=3, every failed request
  generates 4 total requests (original + 3 retries). If 10% of requests
  are failing due to an upstream blip, naive retry turns 10% error rate
  into 40% additional load, which pushes the remaining healthy capacity
  over the edge.

  This script shows both the naive and the mitigated behavior side by
  side. The mitigations — retry budget (cap retries as % of total traffic)
  and jittered backoff — are cheap and effective.

Usage:
  # Default: 10-second failure, 3 retries, no budget
  python retry_storm_simulator.py

  # Compare scenarios
  python retry_storm_simulator.py --compare-mitigations

  # Specific config
  python retry_storm_simulator.py --failure-duration-s 10 --max-retries 3 \\
      --retry-budget 0.10 --arrival-rate 1000
"""

import argparse
import random
from dataclasses import dataclass


# ─── Simulation parameters ────────────────────────────────────────────────────

@dataclass
class Config:
    arrival_rate_per_sec: float = 1000
    capacity_per_sec: float = 1100          # theoretical service capacity
    failure_duration_s: float = 10          # how long upstream blip lasts
    failure_severity: float = 0.5           # fraction of requests failing during blip
    total_duration_s: float = 120           # total simulation time
    max_retries: int = 3
    retry_budget_fraction: float = 0.0      # 0 = no budget; 0.1 = cap retries at 10%
    retry_jittered: bool = False            # jitter to spread retries over time
    dt_s: float = 0.5                       # simulation tick


# ─── Core simulation ──────────────────────────────────────────────────────────

def simulate(cfg: Config):
    """
    Tick-based simulation. Each tick:
      1. New ORIGINAL arrivals show up (base rate).
      2. Retry attempts scheduled from prior ticks arrive.
      3. Apply failure rate based on upstream health + capacity pressure.
      4. Failed ORIGINAL requests schedule retries (within budget and max_retries cap).
      5. Retries that fail are NOT retried again (hard cap on retry depth).
      6. Served requests count toward throughput.

    Key insight: a failed retry doesn't trigger another retry. The max_retries
    cap is total retries per original, not per tick. This matches real client
    behavior — exponential backoff with a bounded retry count.
    """
    random.seed(42)
    n_ticks = int(cfg.total_duration_s / cfg.dt_s)
    base_arrivals_per_tick = cfg.arrival_rate_per_sec * cfg.dt_s
    capacity_per_tick = cfg.capacity_per_sec * cfg.dt_s

    # Scheduled retries indexed by (future_tick, retry_number)
    # retries_queued[t] = retry requests arriving at tick t (not retriable again here)
    retries_queued = [0.0] * (n_ticks + 10)

    # Retry budget tracking
    recent_window_ticks = max(1, int(10 / cfg.dt_s))
    success_history = [0.0] * recent_window_ticks
    retry_history = [0.0] * recent_window_ticks

    trace = []

    for t in range(n_ticks):
        now_s = t * cfg.dt_s

        # 1. Incoming this tick
        arrivals = base_arrivals_per_tick
        retry_arrivals = retries_queued[t]
        total_load = arrivals + retry_arrivals

        # 2. Failure rate
        in_failure = (2.0 <= now_s < 2.0 + cfg.failure_duration_s)
        if in_failure:
            fail_rate = cfg.failure_severity
        else:
            # Overload: excess beyond capacity fails
            fail_rate = max(0.0, 1 - capacity_per_tick / total_load) if total_load > capacity_per_tick else 0.0

        served = min(total_load * (1 - fail_rate), capacity_per_tick)
        failed = total_load - served
        # Split failed into (originals that can retry) vs (retries that cannot)
        if total_load > 0:
            frac_originals = arrivals / total_load
            failed_originals = failed * frac_originals
        else:
            failed_originals = 0

        # 3. Schedule retries (only for failed ORIGINALS, within budget)
        retry_attempts_scheduled = 0
        if cfg.max_retries > 0 and failed_originals > 0:
            # Check retry budget
            recent_success = sum(success_history)
            recent_retries = sum(retry_history)
            budget_ok = True
            if cfg.retry_budget_fraction > 0 and recent_success > 0:
                if recent_retries / recent_success > cfg.retry_budget_fraction:
                    budget_ok = False

            if budget_ok:
                retry_attempts_scheduled = failed_originals * cfg.max_retries

                if cfg.retry_jittered:
                    # Spread max_retries attempts over next few ticks with jitter
                    for i in range(cfg.max_retries):
                        delay_ticks = max(1, (2 ** i) + random.randint(0, 2))
                        if t + delay_ticks < len(retries_queued):
                            retries_queued[t + delay_ticks] += failed_originals
                else:
                    # Naive: all max_retries attempts hit on next tick
                    if t + 1 < len(retries_queued):
                        retries_queued[t + 1] += retry_attempts_scheduled

        # Rolling window update
        success_history[t % recent_window_ticks] = served
        retry_history[t % recent_window_ticks] = retry_arrivals

        amplification = total_load / arrivals if arrivals > 0 else 1.0
        error_rate = failed / total_load if total_load > 0 else 0.0
        trace.append({
            "t": now_s,
            "arrivals": arrivals,
            "retry_arrivals": retry_arrivals,
            "total_load": total_load,
            "served": served,
            "failed": failed,
            "error_rate": error_rate,
            "amplification": amplification,
            "in_failure": in_failure,
        })

    return trace


def summarize(trace, cfg: Config):
    """Extract KPIs from a simulation trace."""
    # Find elevated-error window: all ticks where error_rate > 1% after failure ends
    failure_end_s = 2.0 + cfg.failure_duration_s
    elevated = [t for t in trace if t["error_rate"] > 0.01]
    if elevated:
        recovery_s = elevated[-1]["t"] - failure_end_s
    else:
        recovery_s = 0

    peak_amp = max(t["amplification"] for t in trace)

    # SLO burn: fraction of ticks with error rate > 1%
    slo_burn = len([t for t in trace if t["error_rate"] > 0.01]) / len(trace)

    return {
        "peak_amplification": peak_amp,
        "recovery_s_after_failure_ends": recovery_s,
        "total_elevated_duration_s": len(elevated) * cfg.dt_s,
        "slo_burn_pct": 100 * slo_burn,
    }


def print_trace(trace, cfg: Config, label: str):
    """Print a summarized trace."""
    print(f"\n  ── {label} ──")
    print(f" {'t (s)':>6} {'arrivals':>10} {'retries':>10} {'load':>10} "
          f"{'served':>10} {'err %':>8} {'ampl':>8}")
    # Sample every ~4 ticks (2s) to keep output readable
    sample_every = max(1, len(trace) // 30)
    for i, row in enumerate(trace):
        if i % sample_every == 0 or row["in_failure"] or row["error_rate"] > 0.05:
            mark = "⚠" if row["in_failure"] else (" " if row["error_rate"] < 0.01 else "·")
            print(f" {mark}{row['t']:>5.1f} {row['arrivals']:>10.0f} "
                  f"{row['retry_arrivals']:>10.0f} {row['total_load']:>10.0f} "
                  f"{row['served']:>10.0f} {100*row['error_rate']:>7.1f}% "
                  f"{row['amplification']:>7.2f}×")


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--arrival-rate", type=float, default=1000)
    p.add_argument("--capacity", type=float, default=1100)
    p.add_argument("--failure-duration-s", type=float, default=10)
    p.add_argument("--failure-severity", type=float, default=0.5)
    p.add_argument("--max-retries", type=int, default=3)
    p.add_argument("--retry-budget", type=float, default=0.0,
                   help="Retry budget as fraction of successful requests (0 = unlimited)")
    p.add_argument("--jittered", action="store_true", help="Use jittered backoff")
    p.add_argument("--total-duration-s", type=float, default=120)
    p.add_argument("--compare-mitigations", action="store_true",
                   help="Run 4 scenarios side-by-side")
    args = p.parse_args()

    print(f"\n{'═'*82}")
    print(f" RETRY STORM SIMULATION")
    print(f"{'═'*82}")
    print(f" Arrival rate:     {args.arrival_rate} req/s")
    print(f" Capacity:         {args.capacity} req/s  (headroom: "
          f"{100*(args.capacity-args.arrival_rate)/args.arrival_rate:.0f}%)")
    print(f" Upstream failure: {args.failure_duration_s}s @ "
          f"{100*args.failure_severity:.0f}% failure rate, starting at t=2s")
    print(f"{'═'*82}")

    if args.compare_mitigations:
        scenarios = [
            ("Naive retry (3 retries, no budget)",
             Config(arrival_rate_per_sec=args.arrival_rate,
                   capacity_per_sec=args.capacity,
                   failure_duration_s=args.failure_duration_s,
                   failure_severity=args.failure_severity,
                   max_retries=3, retry_budget_fraction=0.0, retry_jittered=False,
                   total_duration_s=args.total_duration_s)),
            ("With retry budget (10%)",
             Config(arrival_rate_per_sec=args.arrival_rate,
                   capacity_per_sec=args.capacity,
                   failure_duration_s=args.failure_duration_s,
                   failure_severity=args.failure_severity,
                   max_retries=3, retry_budget_fraction=0.10, retry_jittered=False,
                   total_duration_s=args.total_duration_s)),
            ("With jittered backoff",
             Config(arrival_rate_per_sec=args.arrival_rate,
                   capacity_per_sec=args.capacity,
                   failure_duration_s=args.failure_duration_s,
                   failure_severity=args.failure_severity,
                   max_retries=3, retry_budget_fraction=0.0, retry_jittered=True,
                   total_duration_s=args.total_duration_s)),
            ("Budget + jitter (production baseline)",
             Config(arrival_rate_per_sec=args.arrival_rate,
                   capacity_per_sec=args.capacity,
                   failure_duration_s=args.failure_duration_s,
                   failure_severity=args.failure_severity,
                   max_retries=3, retry_budget_fraction=0.10, retry_jittered=True,
                   total_duration_s=args.total_duration_s)),
        ]

        print()
        print(f" {'scenario':<42} {'peak ampl':>12} {'recovery':>12} {'SLO burn':>10}")
        print(f" {'-'*42} {'-'*12} {'-'*12} {'-'*10}")
        for name, cfg in scenarios:
            trace = simulate(cfg)
            s = summarize(trace, cfg)
            print(f" {name:<42} {s['peak_amplification']:>10.2f}× "
                  f"{s['recovery_s_after_failure_ends']:>9.1f}s   "
                  f"{s['slo_burn_pct']:>7.1f}%")

        print()
        print(f"{'─'*82}")
        print(f" VERDICT")
        print(f"{'─'*82}")
        print(f" Naive retry amplifies traffic 2-3× during the blip and never")
        print(f" lets the system recover because retry load keeps overflowing capacity.")
        print(f" Jitter alone doesn't fix this — it spreads retries over time but")
        print(f" doesn't reduce total retry volume. The load-limiting mechanism is")
        print(f" the retry BUDGET, which caps retries as a % of successful traffic.")
        print(f" With budget=10%, the system recovers within the failure window itself.")
        print()
        print(f" SHIP: retry_budget=10%, jittered exponential backoff, max_retries=3.")
        print(f" Budget limits load amplification; jitter smooths per-tick bursts so")
        print(f" healthy pods aren't synchronized by retry waves. Both are free config.")
        print(f" (See envoy_production_filters.yaml for the exact retry policy.)")
    else:
        cfg = Config(arrival_rate_per_sec=args.arrival_rate,
                    capacity_per_sec=args.capacity,
                    failure_duration_s=args.failure_duration_s,
                    failure_severity=args.failure_severity,
                    max_retries=args.max_retries,
                    retry_budget_fraction=args.retry_budget,
                    retry_jittered=args.jittered,
                    total_duration_s=args.total_duration_s)
        trace = simulate(cfg)
        s = summarize(trace, cfg)
        print_trace(trace, cfg,
                   f"Scenario: max_retries={args.max_retries}, "
                   f"budget={args.retry_budget}, jittered={args.jittered}")
        print()
        print(f"{'─'*82}")
        print(f" KPIs")
        print(f"{'─'*82}")
        print(f"  Peak amplification:           {s['peak_amplification']:.2f}×")
        print(f"  Recovery after failure ends:  {s['recovery_s_after_failure_ends']:.1f}s")
        print(f"  Total elevated-error window:  {s['total_elevated_duration_s']:.1f}s")
        print(f"  SLO burn (ticks with >1% err): {s['slo_burn_pct']:.1f}%")
        print()

    print()


if __name__ == "__main__":
    main()
