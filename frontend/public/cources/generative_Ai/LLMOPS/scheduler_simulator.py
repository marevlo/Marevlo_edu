#!/usr/bin/env python3
"""
scheduler_simulator.py

Simulate request arrival and service under four scheduling policies:
  FIFO:     first-in-first-out (vLLM default)
  SJF:      shortest job first (by estimated output length)
  EDF:      earliest deadline first (deadline = arrival + slo)
  priority: tenant-class priority queue (interactive > standard > batch)

Outputs SLO hit rate and per-class TTFT stats under each policy.

Why this exists:
  Scheduler policy is the most overlooked lever in LLM serving. Teams ship
  FIFO because it's the default, then discover at scale that their mixed-SLO
  workload (interactive + batch) has interactive-class TTFT p99 much worse
  than target because batch requests are hogging capacity. Changing
  scheduling policy is usually a 10-line change; the tradeoff is fairness
  (FIFO is perfect) vs SLO compliance (EDF/priority for mixed workloads).

Usage:
  python scheduler_simulator.py --arrival-rate 950 --duration-s 60 \\
      --policy-compare fifo,sjf,edf,priority
"""

import argparse
import heapq
import random
from dataclasses import dataclass


# ─── Workload parameters ──────────────────────────────────────────────────────

PREFILL_THROUGHPUT = 18000  # tok/s per request at prefill phase
DECODE_THROUGHPUT = 14000   # tok/s per request at decode phase
MAX_CONCURRENT = 64         # continuous-batch capacity

# Mix: 70% interactive (short, tight SLO), 20% standard, 10% batch (long, loose SLO)
CLASS_MIX = [
    ("interactive", 0.70, 800, 120, 200),   # prefill, output, slo_ttft_ms
    ("standard",    0.20, 2000, 300, 500),
    ("batch",       0.10, 4000, 800, 3000),
]


@dataclass
class Request:
    arrival_ms: float
    rid: int
    tenant_class: str
    prefill_tokens: int
    output_tokens: int
    slo_ttft_ms: float
    scheduled_ms: float = 0
    first_token_ms: float = 0
    complete_ms: float = 0


def gen_arrivals(arrival_rate_per_sec: float, duration_s: float):
    random.seed(42)
    t = 0.0
    rid = 0
    rate_per_ms = arrival_rate_per_sec / 1000
    out = []
    while t < duration_s * 1000:
        t += random.expovariate(rate_per_ms)
        if t >= duration_s * 1000:
            break
        r = random.random()
        cum = 0.0
        for cls, frac, pf, op, slo in CLASS_MIX:
            cum += frac
            if r < cum:
                prefill = max(100, int(random.gauss(pf, pf * 0.3)))
                output = max(20, int(random.gauss(op, op * 0.3)))
                out.append(Request(arrival_ms=t, rid=rid, tenant_class=cls,
                                   prefill_tokens=prefill, output_tokens=output,
                                   slo_ttft_ms=slo))
                rid += 1
                break
    return out


def total_service_ms(r):
    return (r.prefill_tokens / PREFILL_THROUGHPUT) * 1000 + \
           (r.output_tokens / DECODE_THROUGHPUT) * 1000


def ttft_service_ms(r):
    return (r.prefill_tokens / PREFILL_THROUGHPUT) * 1000


# ─── Event-driven simulator ──────────────────────────────────────────────────

def simulate(arrivals, sort_key):
    """
    Event-driven simulation. At each time step:
      1. Advance to next event (arrival or completion).
      2. Evict completed requests.
      3. Sort backlog by scheduler's key function.
      4. Schedule up to MAX_CONCURRENT from backlog.
    """
    arrivals = sorted(arrivals, key=lambda r: r.arrival_ms)
    idx = 0
    backlog = []
    in_flight = []  # min-heap of completion_ms
    now = 0.0
    served = []

    while idx < len(arrivals) or backlog or in_flight:
        # Determine next event time
        next_times = []
        if idx < len(arrivals):
            next_times.append(arrivals[idx].arrival_ms)
        if in_flight:
            next_times.append(in_flight[0])
        if not next_times and not backlog:
            break
        if next_times:
            now = max(now, min(next_times))

        # Admit all arrivals by now
        while idx < len(arrivals) and arrivals[idx].arrival_ms <= now:
            backlog.append(arrivals[idx])
            idx += 1

        # Evict completions by now
        while in_flight and in_flight[0] <= now:
            heapq.heappop(in_flight)

        # Schedule from backlog
        if backlog and len(in_flight) < MAX_CONCURRENT:
            backlog.sort(key=sort_key)
            while backlog and len(in_flight) < MAX_CONCURRENT:
                r = backlog.pop(0)
                r.scheduled_ms = now
                r.first_token_ms = now + ttft_service_ms(r)
                r.complete_ms = now + total_service_ms(r)
                heapq.heappush(in_flight, r.complete_ms)
                served.append(r)

    return served


# ─── Stats ────────────────────────────────────────────────────────────────────

def stats(served):
    ttfts = sorted([r.first_token_ms - r.arrival_ms for r in served])
    n = max(1, len(ttfts))
    slo_hits = sum(1 for r in served
                   if (r.first_token_ms - r.arrival_ms) <= r.slo_ttft_ms)
    by_class = {}
    for cls, _, _, _, _ in CLASS_MIX:
        cls_reqs = [r for r in served if r.tenant_class == cls]
        cls_hits = [r for r in cls_reqs
                    if (r.first_token_ms - r.arrival_ms) <= r.slo_ttft_ms]
        by_class[cls] = 100 * len(cls_hits) / max(1, len(cls_reqs))
    return {
        "count": len(served),
        "ttft_p50": ttfts[n // 2],
        "ttft_p99": ttfts[int(n * 0.99)] if n > 1 else ttfts[0],
        "ttft_p999": ttfts[int(n * 0.999)] if n > 1 else ttfts[0],
        "slo_hit_rate": 100 * slo_hits / n,
        "by_class": by_class,
    }


SCHEDULERS = {
    "fifo":     lambda r: r.arrival_ms,
    "sjf":      lambda r: r.output_tokens,
    "edf":      lambda r: r.arrival_ms + r.slo_ttft_ms,
    "priority": lambda r: ({"interactive": 0, "standard": 1, "batch": 2}[r.tenant_class],
                           r.arrival_ms),
}


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--arrival-rate", type=float, default=950)
    p.add_argument("--duration-s", type=float, default=60)
    p.add_argument("--policy", default="fifo", choices=list(SCHEDULERS.keys()))
    p.add_argument("--policy-compare", default=None,
                   help="e.g. fifo,sjf,edf,priority")
    args = p.parse_args()

    arrivals = gen_arrivals(args.arrival_rate, args.duration_s)

    print(f"\n{'═'*90}")
    print(f" SCHEDULER SIMULATION")
    print(f"{'═'*90}")
    print(f" Arrival: {args.arrival_rate} req/s · Duration: {args.duration_s}s · "
          f"Total: {len(arrivals):,} reqs")
    print(f" Mix: 70% interactive (200ms SLO) · 20% standard (500ms) · "
          f"10% batch (3000ms)")
    print(f" Concurrent capacity: {MAX_CONCURRENT} · Prefill: {PREFILL_THROUGHPUT} tok/s · "
          f"Decode: {DECODE_THROUGHPUT} tok/s")
    print(f"{'═'*90}\n")

    policies = (args.policy_compare.split(",")
                if args.policy_compare else [args.policy])
    results = {}
    for pol in policies:
        reqs = [Request(arrival_ms=r.arrival_ms, rid=r.rid,
                       tenant_class=r.tenant_class,
                       prefill_tokens=r.prefill_tokens,
                       output_tokens=r.output_tokens,
                       slo_ttft_ms=r.slo_ttft_ms) for r in arrivals]
        served = simulate(reqs, SCHEDULERS[pol])
        results[pol] = stats(served)

    print(f" {'policy':<10} {'TTFT p50':>10} {'TTFT p99':>12} {'TTFT p99.9':>12} "
          f"{'overall':>10} {'interact':>10} {'standard':>10} {'batch':>10}")
    print(f" {'-'*10} {'-'*10} {'-'*12} {'-'*12} {'-'*10} {'-'*10} {'-'*10} {'-'*10}")
    for pol in policies:
        r = results[pol]
        print(f" {pol:<10} {r['ttft_p50']:>8.0f}ms {r['ttft_p99']:>10.0f}ms "
              f"{r['ttft_p999']:>10.0f}ms {r['slo_hit_rate']:>8.1f}% "
              f"{r['by_class']['interactive']:>8.1f}% "
              f"{r['by_class']['standard']:>8.1f}% "
              f"{r['by_class']['batch']:>8.1f}%")

    print()
    print(f"{'─'*90}")
    print(f" VERDICT")
    print(f"{'─'*90}")

    if len(policies) > 1:
        fifo = results.get("fifo")
        best = max(policies, key=lambda p: (results[p]['by_class']['interactive'],
                                             results[p]['slo_hit_rate']))
        r = results[best]
        print(f" Ship {best}.")
        print(f"   Interactive SLO compliance: {r['by_class']['interactive']:.1f}%")
        print(f"   Overall SLO compliance:     {r['slo_hit_rate']:.1f}%")
        if fifo and best != "fifo":
            delta_int = r['by_class']['interactive'] - fifo['by_class']['interactive']
            delta_batch = r['by_class']['batch'] - fifo['by_class']['batch']
            print(f"   vs FIFO: interactive {delta_int:+.1f} pp, batch {delta_batch:+.1f} pp.")
            if delta_batch < -30:
                print()
                print(f" Note: batch SLO compliance drops {-delta_batch:.0f} pp under {best}.")
                print(f" This is the core scheduling tradeoff — you cannot simultaneously")
                print(f" maximize interactive-class latency AND batch-class fairness. If")
                print(f" batch has a hard SLO too, use admission control or a dedicated pool.")
    else:
        r = results[policies[0]]
        print(f" {policies[0]}: overall {r['slo_hit_rate']:.1f}% "
              f"(interactive {r['by_class']['interactive']:.1f}%, "
              f"standard {r['by_class']['standard']:.1f}%, "
              f"batch {r['by_class']['batch']:.1f}%)")
    print()


if __name__ == "__main__":
    main()
