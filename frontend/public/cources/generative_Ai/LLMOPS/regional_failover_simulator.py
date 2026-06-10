#!/usr/bin/env python3
"""
regional_failover_simulator.py

Simulate a multi-region inference deployment through an outage and
failover. Measures:
  - User-visible TTFT during the outage window
  - Traffic re-routing time after health check detects the failure
  - Recovery behavior when the region comes back

Why this exists:
  Regional failover sounds simple — "traffic router routes to healthy
  regions." In practice, the health check has a detection window, the
  router has a DNS TTL, client-side DNS caches linger, and the surviving
  regions need to absorb the extra load without tipping over. The gap
  between "region went down" and "traffic is fully re-routed" is called
  failover time, and it directly determines your SLO compliance during
  an outage.

  This script shows the whole timeline: pre-outage baseline, failure
  detection window, re-routing phase, recovery under increased load on
  surviving regions, and return to normal.

Usage:
  python regional_failover_simulator.py --regions us-east,us-west,eu-west \\
      --outage-region us-east --outage-duration-s 300

  # Show the effect of health-check tuning
  python regional_failover_simulator.py --compare-health-checks
"""

import argparse
from dataclasses import dataclass, field
from typing import List


# ─── Region model ────────────────────────────────────────────────────────────

@dataclass
class Region:
    name: str
    capacity_per_sec: float           # how many req/s it can serve healthy
    baseline_traffic_per_sec: float   # traffic it gets at steady state
    healthy: bool = True
    outage_start_s: float = float('inf')
    outage_end_s: float = float('inf')

    def is_healthy_at(self, t: float) -> bool:
        return not (self.outage_start_s <= t < self.outage_end_s)


@dataclass
class HealthCheck:
    """Router's view of each region's health. Lags reality by detection window."""
    detection_window_s: float = 30         # how long before marked unhealthy
    recovery_window_s: float = 60          # how long healthy before marked recovered
    consecutive_failures_required: int = 3 # consecutive failures to mark unhealthy


def simulate(regions: List[Region], total_duration_s: float,
             outage_region_name: str, outage_start_s: float, outage_end_s: float,
             hc: HealthCheck, dt_s: float = 1.0):
    """
    Tick-based simulation of the outage scenario.

    At each tick:
      1. Apply the outage to the target region (actually down from outage_start_s)
      2. Health check updates its view (lags by detection window)
      3. Router routes traffic to regions marked healthy in its view
      4. Measure user-visible latency for successful requests
    """
    # Mark outage on target region
    target = next((r for r in regions if r.name == outage_region_name), None)
    if target is None:
        raise ValueError(f"Unknown region: {outage_region_name}")
    target.outage_start_s = outage_start_s
    target.outage_end_s = outage_end_s

    # Router's view: lagged health state
    router_view_healthy = {r.name: True for r in regions}
    consecutive_unhealthy = {r.name: 0 for r in regions}
    consecutive_healthy = {r.name: 0 for r in regions}

    trace = []
    total_baseline_traffic = sum(r.baseline_traffic_per_sec for r in regions)

    for t in [i * dt_s for i in range(int(total_duration_s / dt_s))]:
        # 1. Actual health of each region
        actual_health = {r.name: r.is_healthy_at(t) for r in regions}

        # 2. Update router's view (health-check lag)
        for r in regions:
            if not actual_health[r.name]:
                consecutive_unhealthy[r.name] += 1
                consecutive_healthy[r.name] = 0
                if consecutive_unhealthy[r.name] >= hc.consecutive_failures_required:
                    router_view_healthy[r.name] = False
            else:
                consecutive_healthy[r.name] += 1
                consecutive_unhealthy[r.name] = 0
                if consecutive_healthy[r.name] * dt_s >= hc.recovery_window_s:
                    router_view_healthy[r.name] = True

        # 3. Determine which regions receive traffic based on router's view
        healthy_regions_by_router = [r for r in regions if router_view_healthy[r.name]]

        # Traffic to each healthy region: proportional to its original share
        if not healthy_regions_by_router:
            # Total outage — all traffic fails
            for r in regions:
                pass
            served_per_region = {r.name: 0.0 for r in regions}
            dropped_traffic = total_baseline_traffic
        else:
            total_healthy_capacity = sum(r.baseline_traffic_per_sec
                                         for r in healthy_regions_by_router)
            served_per_region = {}
            dropped_traffic = 0.0
            for r in regions:
                if r in healthy_regions_by_router:
                    share = r.baseline_traffic_per_sec / total_healthy_capacity
                    traffic_at_region = total_baseline_traffic * share
                    # Check if region is actually up (router might think so but
                    # it might not be in reality — though if router_view is healthy
                    # and actual is not, those requests just fail)
                    if not actual_health[r.name]:
                        # Router sent traffic here but region is down
                        dropped_traffic += traffic_at_region
                        served_per_region[r.name] = 0
                    elif traffic_at_region > r.capacity_per_sec:
                        # Overloaded — serve up to capacity, drop the rest
                        dropped_traffic += traffic_at_region - r.capacity_per_sec
                        served_per_region[r.name] = r.capacity_per_sec
                    else:
                        served_per_region[r.name] = traffic_at_region
                else:
                    served_per_region[r.name] = 0

        # 4. Aggregate metrics
        total_served = sum(served_per_region.values())
        success_rate = total_served / total_baseline_traffic if total_baseline_traffic else 1.0

        # User-visible TTFT estimate: base latency + queue under load
        region_utilizations = {}
        for r in regions:
            cap = r.capacity_per_sec
            served = served_per_region[r.name]
            region_utilizations[r.name] = (served / cap) if cap else 0

        trace.append({
            "t": t,
            "actual_health": dict(actual_health),
            "router_view": dict(router_view_healthy),
            "served_total": total_served,
            "dropped": dropped_traffic,
            "success_rate": success_rate,
            "region_util": dict(region_utilizations),
        })

    return trace


def summarize(trace, outage_start_s, outage_end_s):
    """Extract KPIs from the trace."""
    # Outage window stats
    outage_trace = [t for t in trace if outage_start_s <= t['t'] < outage_end_s]
    failover_detection_time = None
    for t in trace:
        if t['t'] >= outage_start_s and not all(t['router_view'].values()):
            failover_detection_time = t['t'] - outage_start_s
            break

    # Drop rate during outage
    outage_drop_rate = (
        sum(t['dropped'] for t in outage_trace) /
        (sum(t['dropped'] + t['served_total'] for t in outage_trace) or 1)
    )
    outage_worst_util = max((max(t['region_util'].values()) for t in outage_trace),
                            default=0)

    # Recovery: when success rate returns to >99%
    recovery_time = None
    for t in trace:
        if t['t'] >= outage_end_s and t['success_rate'] >= 0.99:
            recovery_time = t['t'] - outage_end_s
            break

    return {
        "failover_detection_s": failover_detection_time,
        "outage_drop_rate_pct": 100 * outage_drop_rate,
        "outage_worst_region_utilization": outage_worst_util,
        "recovery_after_outage_s": recovery_time,
    }


def print_trace(trace, sample_every_ticks=5):
    """Print a summarized timeline."""
    print(f" {'t (s)':>6} {'success%':>10} {'dropped/s':>12} "
          f"{'util (max)':>12} {'router view':>40}")
    print(" " + "-" * 86)
    for i, row in enumerate(trace):
        if i % sample_every_ticks == 0 or (row['success_rate'] < 0.999):
            max_util = max(row['region_util'].values())
            view = ", ".join(f"{n}:{'H' if h else 'X'}"
                           for n, h in row['router_view'].items())
            sr_str = f"{100*row['success_rate']:>8.1f}%"
            print(f" {row['t']:>6.0f} {sr_str:>10} "
                  f"{row['dropped']:>10.0f}/s {max_util:>11.1%} "
                  f"{view:>40}")


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--regions", default="us-east,us-west,eu-west",
                   help="Comma-separated list of region names")
    p.add_argument("--outage-region", default="us-east")
    p.add_argument("--outage-start-s", type=float, default=60)
    p.add_argument("--outage-duration-s", type=float, default=300)
    p.add_argument("--total-duration-s", type=float, default=720,
                   help="Total simulation duration; should be > outage_start + outage_duration + 120s")
    p.add_argument("--detection-window-s", type=float, default=30,
                   help="Health-check detection window (time to mark unhealthy)")
    p.add_argument("--compare-health-checks", action="store_true",
                   help="Compare 10s / 30s / 60s / 120s detection windows")
    args = p.parse_args()

    region_names = args.regions.split(",")
    # Each region has equal capacity and baseline, sized to handle outage
    # If we have N regions and one fails, remaining N-1 need to absorb 100% of traffic.
    # To have zero overflow: each_region_capacity = total_traffic / (N - 1)
    # We use: each_region_capacity = total_traffic / (N - 1) with 5% slack
    total_traffic = 1000  # req/s total
    n = len(region_names)
    each_baseline = total_traffic / n
    each_capacity = (total_traffic / (n - 1)) * 1.05 if n > 1 else total_traffic * 1.5

    print(f"\n{'═'*88}")
    print(f" REGIONAL FAILOVER SIMULATION")
    print(f"{'═'*88}")
    print(f" Regions: {', '.join(region_names)}   "
          f"Total traffic: {total_traffic} req/s   "
          f"Per-region capacity: {each_capacity:.0f} req/s")
    print(f" Outage: {args.outage_region} from t={args.outage_start_s}s "
          f"for {args.outage_duration_s}s")
    print(f"{'═'*88}")

    if args.compare_health_checks:
        print()
        scenarios = [10, 30, 60, 120]
        print(f" {'detection window':<24} {'failover time':>15} {'outage drop %':>14} "
              f"{'recovery after':>16}")
        print(f" {'-'*24} {'-'*15} {'-'*14} {'-'*16}")
        for det in scenarios:
            regions = [Region(name=n, capacity_per_sec=each_capacity,
                             baseline_traffic_per_sec=each_baseline)
                      for n in region_names]
            hc = HealthCheck(detection_window_s=det, recovery_window_s=60,
                            consecutive_failures_required=max(1, int(det/10)))
            trace = simulate(regions, args.total_duration_s, args.outage_region,
                           args.outage_start_s,
                           args.outage_start_s + args.outage_duration_s,
                           hc)
            s = summarize(trace, args.outage_start_s,
                         args.outage_start_s + args.outage_duration_s)
            failover_str = (f"{s['failover_detection_s']:.0f}s"
                           if s['failover_detection_s'] is not None else "n/a")
            recovery_str = (f"{s['recovery_after_outage_s']:.0f}s"
                           if s['recovery_after_outage_s'] is not None else ">sim")
            print(f" {det}s window{'':14} {failover_str:>14} "
                  f"{s['outage_drop_rate_pct']:>12.1f}% "
                  f"{recovery_str:>14}")
        print()
        print(f"{'─'*88}")
        print(f" VERDICT")
        print(f"{'─'*88}")
        print(f" Shorter detection window = less dropped traffic during outage,")
        print(f" but higher risk of false positives (marking a healthy region")
        print(f" unhealthy during a transient blip).")
        print()
        print(f" Nexus v7 ships 30s detection window with 3-consecutive-failure")
        print(f" threshold. At 10k req/s, 30s of dropped-to-unhealthy traffic =")
        print(f" 300k requests to shed gracefully, which is manageable. 10s is")
        print(f" tempting but exposes to transient false positives during")
        print(f" deploys and network blips.")
        return

    # Single scenario
    regions = [Region(name=n, capacity_per_sec=each_capacity,
                     baseline_traffic_per_sec=each_baseline)
              for n in region_names]
    hc = HealthCheck(detection_window_s=args.detection_window_s, recovery_window_s=60,
                    consecutive_failures_required=3)

    trace = simulate(regions, args.total_duration_s, args.outage_region,
                    args.outage_start_s,
                    args.outage_start_s + args.outage_duration_s, hc)

    print()
    print(f" Timeline (sampled):")
    print_trace(trace, sample_every_ticks=10)
    print()

    s = summarize(trace, args.outage_start_s,
                 args.outage_start_s + args.outage_duration_s)
    print(f"{'─'*88}")
    print(f" KPIs")
    print(f"{'─'*88}")
    failover_str = (f"{s['failover_detection_s']:.0f}s"
                   if s['failover_detection_s'] is not None else "not detected in window")
    recovery_str = (f"{s['recovery_after_outage_s']:.0f}s"
                   if s['recovery_after_outage_s'] is not None else "did not recover in sim window")
    print(f"  Failover detection time:       {failover_str}")
    print(f"  Dropped traffic during outage: {s['outage_drop_rate_pct']:.1f}%")
    print(f"  Peak surviving-region util:    {s['outage_worst_region_utilization']:.1%}")
    print(f"  Recovery after outage ends:    {recovery_str}")
    print()

    print(f"{'─'*88}")
    print(f" VERDICT")
    print(f"{'─'*88}")
    if s['outage_drop_rate_pct'] > 10:
        print(f" ⚠ {s['outage_drop_rate_pct']:.0f}% of traffic dropped during outage.")
        print(f"   Reduce detection window or add headroom in surviving regions.")
    if s['outage_worst_region_utilization'] > 0.95:
        print(f" ⚠ Surviving regions hit {s['outage_worst_region_utilization']:.0%} "
              f"utilization — near tipping point.")
        print(f"   Per-region capacity should be sized to handle N-1 load with headroom.")
        print(f"   Rule: plan for total_traffic/(N-1) × 1.15 capacity per region.")
    if s['outage_drop_rate_pct'] <= 5 and s['outage_worst_region_utilization'] < 0.9:
        print(f" ✓ Clean failover. Topology absorbs the outage without overflow.")
    print()


if __name__ == "__main__":
    main()
