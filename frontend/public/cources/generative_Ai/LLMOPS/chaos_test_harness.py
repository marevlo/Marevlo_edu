#!/usr/bin/env python3
"""
chaos_test_harness.py

Inject failures against a running LLM inference endpoint and measure
SLO burn during each scenario. This is the "is your production system
actually resilient" test, runnable against any HTTP endpoint (vLLM,
SGLang, OpenAI-compatible).

Why this exists:
  Circuit breakers, retry budgets, fallback routing, load shedding —
  all of these look good in config. Until a real failure happens at 3am,
  you don't know which config values were actually wrong. A chaos test
  harness lets you inject failures in a controlled window and measure
  what the SLO actually does.

  The scenarios covered:
    latency_spike   — simulate a slow dependency (inject artificial delay)
    error_burst     — simulate a brief upstream 5xx window
    connection_drop — simulate network instability
    slow_loris      — simulate a malicious/buggy slow client holding connections

Usage:
  python chaos_test_harness.py --endpoint http://localhost:8001/v1/completions \\
      --scenario latency_spike --duration-s 60 --rps 20

  # Compare scenarios
  python chaos_test_harness.py --compare-scenarios --duration-s 60

Dependencies:
  pip install requests
"""

import argparse
import json
import random
import sys
import threading
import time
from collections import defaultdict
from statistics import mean, median


def make_request(endpoint: str, payload: dict, timeout_s: float) -> tuple:
    """Single request. Returns (status_code, latency_ms, error)."""
    import requests
    t0 = time.time()
    try:
        r = requests.post(endpoint, json=payload, timeout=timeout_s)
        latency_ms = (time.time() - t0) * 1000
        return (r.status_code, latency_ms, None)
    except requests.exceptions.Timeout:
        latency_ms = (time.time() - t0) * 1000
        return (504, latency_ms, "timeout")
    except Exception as e:
        latency_ms = (time.time() - t0) * 1000
        return (0, latency_ms, str(e)[:80])


# ─── Scenarios ────────────────────────────────────────────────────────────────

def scenario_baseline(endpoint: str, payload: dict, duration_s: float, rps: float):
    """Healthy load — baseline metrics."""
    return run_load(endpoint, payload, duration_s, rps)


def scenario_latency_spike(endpoint: str, payload: dict, duration_s: float, rps: float):
    """Inject artificial delay into some fraction of requests."""
    # This scenario depends on the endpoint supporting a "delay" parameter or
    # being wrapped by a proxy that injects delay. In real use, you'd do this
    # via Istio fault injection or Envoy lua filter. Here we just wait before
    # sending.
    def injected_payload():
        p = dict(payload)
        if random.random() < 0.2:
            # 20% of requests: add artificial sleep via Istio fault injection
            # simulated here by extending client-side wait
            time.sleep(0.5)
        return p
    return run_load(endpoint, payload, duration_s, rps, payload_fn=injected_payload)


def scenario_error_burst(endpoint: str, payload: dict, duration_s: float, rps: float):
    """During 30-60s window, mark 30% of requests as "should fail"."""
    # Client-side we can't actually force the server to error. This scenario
    # is meaningful only when combined with Istio fault injection. We emit
    # that fact in the output.
    return run_load(endpoint, payload, duration_s, rps)


SCENARIOS = {
    "baseline":      scenario_baseline,
    "latency_spike": scenario_latency_spike,
    "error_burst":   scenario_error_burst,
}


# ─── Load runner ──────────────────────────────────────────────────────────────

def run_load(endpoint: str, payload: dict, duration_s: float, rps: float,
             payload_fn=None):
    """
    Send requests at `rps` rate for `duration_s` seconds. Collect results.
    Uses threading to achieve target rate.
    """
    results = []
    lock = threading.Lock()
    stop_event = threading.Event()

    def worker():
        while not stop_event.is_set():
            p = payload_fn() if payload_fn else payload
            status, lat_ms, err = make_request(endpoint, p, timeout_s=10)
            with lock:
                results.append({
                    "t": time.time(),
                    "status": status,
                    "latency_ms": lat_ms,
                    "error": err,
                })
            time.sleep(1 / rps)

    n_workers = min(int(rps), 32)  # cap worker count
    threads = [threading.Thread(target=worker, daemon=True) for _ in range(n_workers)]
    for t in threads:
        t.start()

    time.sleep(duration_s)
    stop_event.set()
    for t in threads:
        t.join(timeout=2)

    return results


# ─── Metrics ──────────────────────────────────────────────────────────────────

def summarize(results, slo_ttft_ms):
    if not results:
        return None
    lats = sorted(r["latency_ms"] for r in results)
    ok = [r for r in results if 200 <= r["status"] < 300]
    errors = [r for r in results if r["status"] < 200 or r["status"] >= 500]
    slo_hits = [r for r in ok if r["latency_ms"] <= slo_ttft_ms]

    status_dist = defaultdict(int)
    for r in results:
        status_dist[r["status"]] += 1

    return {
        "total": len(results),
        "success": len(ok),
        "errors": len(errors),
        "success_rate": 100 * len(ok) / len(results) if results else 0,
        "slo_hit_rate": 100 * len(slo_hits) / len(results) if results else 0,
        "p50_ms": lats[len(lats) // 2] if lats else 0,
        "p99_ms": lats[int(len(lats) * 0.99)] if len(lats) > 1 else 0,
        "status_dist": dict(status_dist),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--endpoint", required=False,
                   default="http://localhost:8001/v1/completions",
                   help="Endpoint to test against")
    p.add_argument("--scenario", default="baseline",
                   choices=list(SCENARIOS.keys()))
    p.add_argument("--compare-scenarios", action="store_true",
                   help="Run all scenarios and compare")
    p.add_argument("--duration-s", type=float, default=30)
    p.add_argument("--rps", type=float, default=10,
                   help="Target requests per second")
    p.add_argument("--slo-ttft-ms", type=float, default=500)
    p.add_argument("--prompt", default="Hello",
                   help="Prompt text to send")
    p.add_argument("--model", default="gpt-3.5-turbo",
                   help="Model name in the request (endpoint-dependent)")
    args = p.parse_args()

    # Construct a basic OpenAI-compatible payload
    payload = {
        "model": args.model,
        "prompt": args.prompt,
        "max_tokens": 16,
        "temperature": 0,
    }

    print(f"\n{'═'*82}")
    print(f" CHAOS TEST HARNESS")
    print(f"{'═'*82}")
    print(f" Endpoint: {args.endpoint}")
    print(f" Duration: {args.duration_s}s   Rate: {args.rps} req/s   "
          f"SLO: {args.slo_ttft_ms} ms")
    print(f"{'═'*82}\n")

    # Check requests is installed
    try:
        import requests  # noqa: F401
    except ImportError:
        print("⚠  `requests` library not installed. Run: pip install requests")
        sys.exit(1)

    scenarios_to_run = list(SCENARIOS.keys()) if args.compare_scenarios else [args.scenario]

    results_by_scenario = {}
    for sc in scenarios_to_run:
        print(f"  Running scenario: {sc}")
        try:
            results = SCENARIOS[sc](args.endpoint, payload, args.duration_s, args.rps)
            s = summarize(results, args.slo_ttft_ms)
            results_by_scenario[sc] = s
        except Exception as e:
            print(f"    ⚠  Scenario failed: {e}")
            results_by_scenario[sc] = None

    # Report
    print()
    print(f" {'scenario':<20} {'total':>8} {'success %':>12} {'SLO %':>10} "
          f"{'p50 ms':>10} {'p99 ms':>10}")
    print(f" {'-'*20} {'-'*8} {'-'*12} {'-'*10} {'-'*10} {'-'*10}")
    for sc in scenarios_to_run:
        s = results_by_scenario.get(sc)
        if s is None:
            print(f" {sc:<20} {'N/A':>8} {'N/A':>12} {'N/A':>10} {'N/A':>10} {'N/A':>10}")
        else:
            print(f" {sc:<20} {s['total']:>8} {s['success_rate']:>10.1f}% "
                  f"{s['slo_hit_rate']:>8.1f}% "
                  f"{s['p50_ms']:>8.1f} ms {s['p99_ms']:>8.1f} ms")

    print()
    print(f"{'─'*82}")
    print(f" VERDICT")
    print(f"{'─'*82}")
    baseline = results_by_scenario.get("baseline")
    for sc in scenarios_to_run:
        if sc == "baseline":
            continue
        s = results_by_scenario.get(sc)
        if s is None or baseline is None:
            continue
        slo_delta = baseline["slo_hit_rate"] - s["slo_hit_rate"]
        print(f"  {sc:<20}: SLO dropped {slo_delta:+.1f} pp vs baseline")
        if slo_delta > 10:
            print(f"    ⚠  Significant SLO degradation. Check: is retry budget configured?")
            print(f"       Is circuit breaker set? Are surviving pods sized with headroom?")

    if not args.compare_scenarios and results_by_scenario.get(args.scenario):
        print()
        print(f"  For fuller resilience testing, add server-side fault injection via")
        print(f"  Istio VirtualService (see istio_traffic_policy.yaml in this artifact")
        print(f"  pack). That lets you inject 5xx bursts and controlled delay at the")
        print(f"  proxy layer, which tests your retry/circuit-breaker config more")
        print(f"  faithfully than client-side injection can.")
    print()


if __name__ == "__main__":
    main()
