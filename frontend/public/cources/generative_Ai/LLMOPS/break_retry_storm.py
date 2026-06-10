#!/usr/bin/env python3
"""
break_retry_storm.py

FAILURE REPRODUCTION: a brief upstream blip combined with naive retry
configuration turns a 10-second problem into a 2-minute outage.

This is the single most common production failure pattern in LLM serving.
Not because LLM serving is special — because serving IS networking,
networking has transient failures, and naive retry amplifies every
transient failure until it's no longer transient.

What this script shows:

  The REAL failure mode on the left (naive retry, no budget, no jitter):
    - Brief 10-second upstream failure at t=2s
    - Client retries 3× per failed request = 4× traffic amplification
    - Retries pile onto already-struggling system
    - Healthy pods start dropping under retry load
    - System oscillates between overloaded and recovering
    - 100+ seconds of elevated error rate for a 10s upstream blip

  The FIX on the right (retry budget + jittered backoff):
    - Same 10-second upstream failure
    - Retries capped at 10% of successful traffic
    - Jitter prevents synchronized retry waves
    - System absorbs the blip; recovery time tracks upstream recovery

This is the M8 war story #1 mechanism. Scaled up to production volume,
the naive case caused a 40-minute outage from a 30-second network blip.

Usage:
  python break_retry_storm.py                     # compare mitigations
  python break_retry_storm.py --naive-only        # just show the broken case
  python break_retry_storm.py --fixed-only        # just show the fix

The script wraps retry_storm_simulator.py with a single narrative: this
is what breaks, this is how you fix it, here's the 3-line config diff.
"""

import argparse
import subprocess
import sys


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--naive-only", action="store_true")
    p.add_argument("--fixed-only", action="store_true")
    p.add_argument("--failure-duration-s", type=float, default=10)
    args = p.parse_args()

    print(f"\n{'═'*82}")
    print(f" RETRY STORM · FAILURE REPRODUCTION")
    print(f"{'═'*82}")
    print(f" Scenario: {args.failure_duration_s}s upstream 503 blip at t=2s")
    print(f" System:   1000 req/s arrival, 1100 req/s capacity (10% headroom)")
    print(f"{'═'*82}")
    print()
    print(f"  The question this reproduces: given a {args.failure_duration_s}s upstream")
    print(f"  failure, what's the total duration your users see elevated errors?")
    print()

    # Delegate to the simulator with --compare-mitigations for the full comparison
    cmd = [
        sys.executable,
        __file__.replace("break_retry_storm.py", "retry_storm_simulator.py"),
        "--compare-mitigations",
        "--failure-duration-s", str(args.failure_duration_s),
    ]
    subprocess.run(cmd)

    print()
    print(f"{'═'*82}")
    print(f" THE FIX · 3-line config diff")
    print(f"{'═'*82}")
    print()
    print("  Before (Envoy, naive):")
    print("    retry_policy:")
    print("      retry_on: 5xx")
    print("      num_retries: 3")
    print()
    print("  After (Envoy, production-safe):")
    print("    retry_policy:")
    print("      retry_on: 5xx,reset,connect-failure")
    print("      num_retries: 2                          ← lower")
    print("      retry_budget:                          ← NEW")
    print("        budget_percent: { value: 10.0 }")
    print("        min_retry_concurrency: 3")
    print("      retry_back_off:                        ← NEW")
    print("        base_interval: 50ms")
    print("        max_interval: 500ms")
    print()
    print(f"  See envoy_production_filters.yaml for the full config.")
    print(f"  Same fix exists for Istio (VirtualService.http.retries + backoff policy)")
    print(f"  and for client SDKs (exponential backoff + jitter).")
    print()

    print(f"{'─'*82}")
    print(f" MONITORING · How to catch this BEFORE it causes an outage")
    print(f"{'─'*82}")
    print()
    print("  1. Alert on retry amplification:")
    print("       rate(envoy_cluster_upstream_rq_retry[5m]) /")
    print("       rate(envoy_cluster_upstream_rq_total[5m]) > 0.05")
    print()
    print("  2. Alert on SLO burn rate (fast: 14.4× budget in 1h):")
    print("       See prometheus_production_alerts.yaml SLOBurnFast alert")
    print()
    print("  3. Periodically verify retry budget is configured:")
    print("       envoy admin: /stats?usedonly&filter=retry_budget")
    print("       Should show non-zero retry_budget.remaining metric.")
    print()
    print(f"{'─'*82}")
    print(f" SUMMARY")
    print(f"{'─'*82}")
    print()
    print(f"  Retry storms are CAUSED by naive retry logic, not by infrastructure.")
    print(f"  The fix is free and sits in config. The cost of NOT fixing it is")
    print(f"  measured in outage postmortems.")
    print()
    print(f"  If you're not sure whether YOUR system has retry budget configured,")
    print(f"  run chaos_test_harness.py with --scenario error_burst against a")
    print(f"  staging endpoint. If the error rate persists after the injection")
    print(f"  window ends, you don't have a budget. Fix it before prod.")
    print()


if __name__ == "__main__":
    main()
