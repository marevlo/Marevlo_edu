#!/usr/bin/env python3
"""
break_prefix_cache.py

FAILURE REPRODUCTION: prompt template with an embedded timestamp.

This script demonstrates the #1 cause of collapsed prefix-cache hit rates
in production LLM serving. It doesn't require a GPU — it shows the failure
at the prompt level, which is exactly where the bug lives.

The symptom in production (verbatim from real postmortems):
  - Prefix hit rate was 78% on Tuesday
  - Upstream team shipped a "small helpful change" at 2pm Wednesday
  - Hit rate dropped to 4% within 20 minutes
  - TTFT p99 tripled
  - Infra dashboards all showed green
  - Took 90 minutes to find because nobody expected a prompt change

The root cause:
  The "small helpful change" was: prepend the current date to the system
  prompt so the model knows "today." Reasonable idea. Catastrophic effect.
  A timestamp that changes every second means NO two consecutive requests
  have the same prefix. The radix trie can never store a prefix that's
  actually reused.

How to read this script:
  1. Run it — watch hit rate go from 100% → 0%
  2. Read the TWO system prompts shown
  3. Understand exactly which characters broke the cache
  4. The fix is mechanical: move variable content AFTER stable content

What to look for in YOUR system:
  - Any timestamp, date, time, or "current" reference in the system prompt
  - UUIDs or request IDs ANYWHERE in the prefix window
  - User email/name embedded before the task instruction
  - A/B test flags rendered into the prompt text

The rule: if it can change between two otherwise-identical requests, it
belongs AFTER the stable prefix, in the user-content section, not in the
system prompt.
"""

import argparse
import random
from collections import Counter
from datetime import datetime, timedelta


# ─── The two prompt templates ────────────────────────────────────────────────

STABLE_TEMPLATE = """You are Nexus, a fraud-detection AI. Analyze the following \
transaction and return a risk score from 0.0 to 1.0 with reasoning.

Guidelines:
  - Flag transactions with mismatched geography
  - Flag unusual purchase patterns for the account
  - Be specific in your reasoning

Transaction data: {tx}"""

BROKEN_TEMPLATE = """You are Nexus, a fraud-detection AI. The current time is \
{timestamp}. Analyze the following transaction and return a risk score from \
0.0 to 1.0 with reasoning.

Guidelines:
  - Flag transactions with mismatched geography
  - Flag unusual purchase patterns for the account
  - Be specific in your reasoning

Transaction data: {tx}"""


# ─── The radix trie simulation (simplified) ──────────────────────────────────

def simulate_radix_trie(prompts, prefix_chars=512):
    """
    Simulate the prefix-caching logic: for each prompt in order, check if
    its first `prefix_chars` characters match any previously-seen prompt.
    If yes, it's a HIT (cached KV reused). If no, it's a MISS (cached KV
    written for this new prefix).

    Returns (hit_count, miss_count, unique_prefixes, breakdown_over_time).
    """
    seen_prefixes = {}
    breakdown = []  # (request_idx, hit, running_hit_rate)

    hits = 0
    for i, p in enumerate(prompts):
        prefix = p[:prefix_chars]
        is_hit = prefix in seen_prefixes
        if is_hit:
            hits += 1
            seen_prefixes[prefix] += 1
        else:
            seen_prefixes[prefix] = 1
        rate = 100.0 * hits / (i + 1)
        breakdown.append((i + 1, is_hit, rate))

    return hits, len(prompts) - hits, len(seen_prefixes), breakdown


# ─── Run the reproduction ────────────────────────────────────────────────────

def generate_requests(template, n_requests, inject_timestamp=False):
    """Generate n_requests transaction prompts using the given template."""
    random.seed(42)
    base_time = datetime(2026, 4, 17, 12, 0, 0)
    prompts = []
    for i in range(n_requests):
        tx = f"${random.randint(10, 10000)} at merchant_{random.randint(0, 500)} in zip_{random.randint(1, 99999)}"
        if inject_timestamp:
            # Every request has a DIFFERENT timestamp — timestamps tick forward
            t = base_time + timedelta(seconds=i * 2)
            prompt = template.format(tx=tx, timestamp=t.isoformat())
        else:
            prompt = template.format(tx=tx)
        prompts.append(prompt)
    return prompts


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--n-requests", type=int, default=1000,
                   help="Number of requests to simulate")
    p.add_argument("--prefix-chars", type=int, default=260,
                   help="Prefix window size in characters (approximates token window). "
                        "Default 260 captures the stable system prompt but not "
                        "the per-request transaction variable.")
    args = p.parse_args()

    print(f"\n{'═'*78}")
    print(f" PREFIX CACHE FAILURE REPRODUCTION")
    print(f"{'═'*78}")
    print(f" Simulating {args.n_requests} requests with prefix-window={args.prefix_chars} chars")
    print(f"{'═'*78}\n")

    # ─── Scenario A: stable template ─────────────────────────────────────────
    print(" ─── SCENARIO A · Stable system prompt (healthy) ─── ")
    stable_prompts = generate_requests(STABLE_TEMPLATE, args.n_requests)
    print(f" Example prompt (first 300 chars):")
    print(f"   {stable_prompts[0][:300]!r}")
    print()

    hits_a, misses_a, uniq_a, _ = simulate_radix_trie(stable_prompts, args.prefix_chars)
    print(f" Results:")
    print(f"   Cache hits:        {hits_a:>4,} / {args.n_requests} = "
          f"{100*hits_a/args.n_requests:5.1f}%")
    print(f"   Cache misses:      {misses_a:>4,}")
    print(f"   Unique prefixes:   {uniq_a:>4,}")
    print()

    # ─── Scenario B: timestamp-injected template ─────────────────────────────
    print(" ─── SCENARIO B · Timestamp embedded in system prompt (broken) ─── ")
    broken_prompts = generate_requests(BROKEN_TEMPLATE, args.n_requests,
                                       inject_timestamp=True)
    print(f" Example prompts (first two requests):")
    print(f"   [0] {broken_prompts[0][:200]!r}")
    print(f"   [1] {broken_prompts[1][:200]!r}")
    print(f"       ^^^ the timestamps differ on character ~50, BEFORE the prefix")
    print(f"           window ends at char {args.prefix_chars}")
    print()

    hits_b, misses_b, uniq_b, _ = simulate_radix_trie(broken_prompts, args.prefix_chars)
    print(f" Results:")
    print(f"   Cache hits:        {hits_b:>4,} / {args.n_requests} = "
          f"{100*hits_b/args.n_requests:5.1f}%")
    print(f"   Cache misses:      {misses_b:>4,}")
    print(f"   Unique prefixes:   {uniq_b:>4,}")
    print()

    # ─── The difference ──────────────────────────────────────────────────────
    print(f"{'─'*78}")
    print(f" THE COST")
    print(f"{'─'*78}")
    rate_drop_pp = 100*hits_a/args.n_requests - 100*hits_b/args.n_requests
    print(f" Hit rate dropped {rate_drop_pp:.1f} percentage points.")
    print()
    print(f" In production terms, assuming RadixAttention saves 40% of TTFT on")
    print(f" every cache hit:")
    print(f"   Scenario A avg TTFT reduction: "
          f"{hits_a/args.n_requests:.3f} hit-rate × 40% = "
          f"{40*hits_a/args.n_requests:.1f}% average TTFT saved")
    print(f"   Scenario B avg TTFT reduction: "
          f"{hits_b/args.n_requests:.3f} hit-rate × 40% = "
          f"{40*hits_b/args.n_requests:.1f}% average TTFT saved")
    print(f"   Net: a feature that was saving {40*hits_a/args.n_requests:.0f}% of "
          f"average TTFT is now saving {40*hits_b/args.n_requests:.0f}%.")
    print()

    print(f"{'─'*78}")
    print(f" THE FIX")
    print(f"{'─'*78}")
    print(f" Move the timestamp AFTER the stable content:")
    print()
    print(f"   BROKEN:  \"You are Nexus... The current time is {{timestamp}}.\"")
    print(f"            \"...Transaction data: {{tx}}\"")
    print()
    print(f"   FIXED:   \"You are Nexus... [stable system prompt]...\"")
    print(f"            \"Transaction data: {{tx}}\"")
    print(f"            \"Current time: {{timestamp}}\"           ← appended AFTER")
    print()
    print(f" If the model really needs the timestamp, it can still see it —")
    print(f" just not in the prefix window that prefix caching operates on.")
    print(f" The first {args.prefix_chars} characters must be byte-identical")
    print(f" across requests for the cache to work.")
    print()

    # ─── Diagnostic hint ─────────────────────────────────────────────────────
    print(f"{'─'*78}")
    print(f" HOW TO CATCH THIS IN YOUR SYSTEM")
    print(f"{'─'*78}")
    print(f" 1. Sample 1000 production prompts.")
    print(f" 2. Run radix_prefix_analyzer.py on them.")
    print(f" 3. Look for byte-stability violations in the first 512 chars.")
    print(f" 4. If hit rate is high at L=64 but drops at L=256, the broken")
    print(f"    content is between positions 64 and 256 — that's your fix target.")
    print()


if __name__ == "__main__":
    main()
