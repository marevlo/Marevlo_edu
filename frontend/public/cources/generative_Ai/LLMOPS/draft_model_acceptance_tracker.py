#!/usr/bin/env python3
"""
draft_model_acceptance_tracker.py

Analyze a production decoding log and report whether the speculation
acceptance rate α has drifted over time. This is the #1 silent cost
regression in speculative decoding — α falls slowly as the production
traffic distribution drifts away from the draft model's training data,
and nobody notices until finance catches cost creep.

Why this exists:
  Nexus production had α=0.85 in January, serving fraud detection. By
  March, cost-per-token had risen 35%; engineering thought it was noise.
  Finance caught it. Root cause: the traffic distribution shifted toward
  travel-category transactions (Q1 vacation season), and the draft model
  was trained on Q4 data where retail dominated. α had silently drifted
  to 0.62. Fix: weekly draft-model retraining.

  This script takes a decoding log (jsonl with per-request acceptance
  rate) and plots α over time, windowed. It identifies drift patterns
  and flags when the slope is cost-significant.

Usage:
  # Analyze a log: jsonl with {timestamp, alpha, tenant_class}
  python draft_model_acceptance_tracker.py --log decode_log.jsonl

  # Demo mode — synthetic drift
  python draft_model_acceptance_tracker.py --demo
"""

import argparse
import json
import random
import sys
from collections import defaultdict
from datetime import datetime, timedelta


def parse_log(path: str):
    """Load a decoding log. Expected format: one JSON per line with
    {timestamp: ISO8601, alpha: float, tenant_class: str (optional)}"""
    rows = []
    with open(path) as f:
        for line in f:
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
                rows.append({
                    "ts": datetime.fromisoformat(obj["timestamp"].replace("Z", "+00:00")),
                    "alpha": float(obj["alpha"]),
                    "tenant_class": obj.get("tenant_class", "default"),
                })
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
    return rows


def demo_log():
    """Synthesize a 60-day log with a gradual drift from α=0.85 to α=0.63."""
    random.seed(42)
    rows = []
    start = datetime(2026, 1, 15)
    for day in range(60):
        # α drifts linearly from 0.85 to 0.63 over the 60 days
        alpha_mean = 0.85 - (day / 60) * (0.85 - 0.63)
        for _ in range(200):  # 200 samples per day
            ts = start + timedelta(days=day, seconds=random.randint(0, 86400))
            # Per-request α has some variance
            alpha = max(0.0, min(1.0, random.gauss(alpha_mean, 0.04)))
            cls = random.choice(["interactive", "standard", "batch"])
            rows.append({"ts": ts, "alpha": alpha, "tenant_class": cls})
    return sorted(rows, key=lambda r: r["ts"])


def window_stats(rows, window_days=7):
    """Bucket rows by (window_days)-day windows, compute mean α per window."""
    if not rows:
        return []
    start = rows[0]["ts"]
    end = rows[-1]["ts"]
    windows = []
    t = start
    while t < end:
        t_end = t + timedelta(days=window_days)
        in_window = [r for r in rows if t <= r["ts"] < t_end]
        if in_window:
            alphas = [r["alpha"] for r in in_window]
            windows.append({
                "start": t,
                "end": t_end,
                "count": len(alphas),
                "mean_alpha": sum(alphas) / len(alphas),
                "p10_alpha": sorted(alphas)[len(alphas) // 10],
                "p90_alpha": sorted(alphas)[int(len(alphas) * 0.9)],
            })
        t = t_end
    return windows


def detect_drift(windows):
    """Linear-regression-ish trend detection. Returns slope (α per day)."""
    if len(windows) < 2:
        return 0.0
    # Days since first window vs mean_alpha
    x0 = windows[0]["start"]
    xs = [(w["start"] - x0).total_seconds() / 86400 for w in windows]
    ys = [w["mean_alpha"] for w in windows]
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    if den == 0:
        return 0.0
    return num / den


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--log", help="Decoding log (jsonl)")
    p.add_argument("--demo", action="store_true", help="Use synthetic demo log")
    p.add_argument("--window-days", type=int, default=7,
                   help="Window size for trend analysis")
    p.add_argument("--alarm-threshold", type=float, default=0.70,
                   help="Alarm if windowed mean α drops below this")
    args = p.parse_args()

    if args.demo:
        rows = demo_log()
        print(f"[demo] synthesized {len(rows):,} samples over "
              f"{(rows[-1]['ts'] - rows[0]['ts']).days} days")
    elif args.log:
        rows = parse_log(args.log)
        print(f"loaded {len(rows):,} samples from {args.log}")
    else:
        sys.exit("Provide --log PATH or --demo")

    if not rows:
        sys.exit("No parseable rows in log.")

    windows = window_stats(rows, args.window_days)
    slope = detect_drift(windows)

    print(f"\n{'═'*82}")
    print(f" SPECULATION ACCEPTANCE-RATE TRACKING")
    print(f"{'═'*82}")
    print(f" Samples: {len(rows):,}   "
          f"Span: {rows[0]['ts'].date()} → {rows[-1]['ts'].date()} "
          f"({(rows[-1]['ts'] - rows[0]['ts']).days} days)")
    print(f" Window size: {args.window_days} days   Alarm α threshold: {args.alarm_threshold}")
    print(f"{'═'*82}\n")

    print(f" {'window start':<20} {'count':>8} {'mean α':>10} {'p10 α':>10} "
          f"{'p90 α':>10} {'flag':>8}")
    print(f" {'-'*20} {'-'*8} {'-'*10} {'-'*10} {'-'*10} {'-'*8}")
    for w in windows:
        flag = "⚠ LOW" if w["mean_alpha"] < args.alarm_threshold else "✓"
        print(f" {str(w['start'].date()):<20} {w['count']:>8,} "
              f"{w['mean_alpha']:>10.3f} {w['p10_alpha']:>10.3f} "
              f"{w['p90_alpha']:>10.3f} {flag:>8}")

    print()
    print(f"{'─'*82}")
    print(f" DRIFT ANALYSIS")
    print(f"{'─'*82}")
    # Slope in α per 30 days
    slope_per_month = slope * 30
    first = windows[0]["mean_alpha"]
    last = windows[-1]["mean_alpha"]
    total_drift = last - first
    print(f" Starting mean α:      {first:.3f}")
    print(f" Ending mean α:        {last:.3f}")
    print(f" Total drift:          {total_drift:+.3f}")
    print(f" Drift rate:           {slope_per_month:+.4f} per 30 days")
    print()

    # Verdict
    print(f"{'─'*82}")
    print(f" VERDICT")
    print(f"{'─'*82}")
    below = [w for w in windows if w["mean_alpha"] < args.alarm_threshold]
    if total_drift < -0.05:
        days_to_threshold = (last - args.alarm_threshold) / max(abs(slope), 1e-6) \
                            if slope < 0 else float('inf')
        print(f" ✗ DRIFT DETECTED. α has dropped {-total_drift:.3f} over the log period.")
        print(f"   This is almost certainly draft-model staleness — the production")
        print(f"   traffic distribution has shifted away from the draft's training data.")
        print(f"   Estimated cost impact:")
        # Rough cost: speedup degrades from ~3x at α=0.85 to ~2x at α=0.65
        # Assuming K=5, draft=1.2ms, target=12ms
        def sp(a, k=5, dms=1.2, tms=12):
            if a >= 1:
                e = k + 1
            else:
                e = (1 - a**(k+1)) / (1 - a) - 1 + 1
            return tms / ((k * dms + tms) / e)
        sp_first = sp(first)
        sp_last = sp(last)
        cost_impact = 100 * (sp_first / sp_last - 1)
        print(f"   Speedup dropped from {sp_first:.2f}× → {sp_last:.2f}×")
        print(f"   Cost-per-token is {cost_impact:+.0f}% higher than when α was {first:.2f}.")
        print()
        print(f"   FIX: Retrain the draft model on recent traffic (rolling 7-14 day window).")
        print(f"   Set up weekly automated retraining + canary validation before rollout.")
    elif below:
        print(f" ⚠ Alarm threshold hit. Some windows have mean α below {args.alarm_threshold}.")
        print(f"   Not a clear drift trend ({slope_per_month:+.4f}/30d), but acceptance")
        print(f"   is already in a range that hurts speculation economics.")
    else:
        print(f" ✓ Stable. No significant drift; α remains above alarm threshold.")
        print(f"   Continue weekly monitoring; no action required.")

    print()


if __name__ == "__main__":
    main()
