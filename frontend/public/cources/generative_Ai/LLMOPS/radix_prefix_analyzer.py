#!/usr/bin/env python3
"""
radix_prefix_analyzer.py

Analyze a production prompt log and report:
  (a) the achievable prefix-cache hit rate under RadixAttention
  (b) byte-stability violations that would collapse that rate
  (c) the specific prompt-template patterns that are eating your hit rate

Why this exists:
  RadixAttention is worth 20-40% TTFT reduction when healthy. "Healthy"
  means byte-stable prefixes across requests. In production, teams routinely
  hit <30% hit rate because something upstream embeds a timestamp, a user
  ID, or a random request UUID in the system prompt. This script finds
  those leaks BEFORE deployment, using a sample of real prompts.

  You cannot get this number from the engine's own metrics, because the
  engine's hit rate is a lagging indicator. This script tells you what
  your CEILING is given the prompt log you hand it.

Usage:
  # Analyze a JSONL prompt log (one {"prompt": "...", ...} per line)
  python radix_prefix_analyzer.py --log prompts.jsonl

  # Built-in demo (use if you don't have a real log handy)
  python radix_prefix_analyzer.py --demo

  # Identify specific prefix-length buckets where hit rate breaks
  python radix_prefix_analyzer.py --log prompts.jsonl --prefix-lengths 64,256,1024
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from typing import List


# ─── Core analysis ────────────────────────────────────────────────────────────

def analyze_prefixes(prompts: List[str], prefix_lengths: List[int]):
    """
    For each prefix length L, count how many prompts share their first L
    characters with any other prompt. That's the theoretical cache hit
    rate at that prefix length.

    Note: RadixAttention operates on tokens, not chars. Char-level is a
    fine approximation — byte-stability across tokens implies char-stability
    and vice versa for ASCII. For multilingual prompts this may over/underestimate
    by a few percent.
    """
    results = {}
    for L in prefix_lengths:
        prefix_counts = Counter()
        for p in prompts:
            prefix_counts[p[:L]] += 1

        # A prompt "hits" the cache if its prefix appeared earlier in the log
        # (i.e., the prefix has >1 occurrences — first one was a cache miss
        # that populated the trie, subsequent ones hit).
        hit_count = sum(c - 1 for c in prefix_counts.values() if c > 1)
        hit_rate = 100.0 * hit_count / len(prompts) if prompts else 0
        results[L] = {
            "hit_rate_pct": hit_rate,
            "unique_prefixes": len(prefix_counts),
            "top_prefixes": prefix_counts.most_common(5),
        }
    return results


# ─── Byte-stability violation detection ──────────────────────────────────────

TIMESTAMP_PATTERNS = [
    (r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}", "ISO-8601 timestamp"),
    (r"\d{10,13}",                                "Unix timestamp (seconds or ms)"),
    (r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2},? \d{4}",
     "Human-readable date"),
    (r"\b\d{1,2}:\d{2}(?::\d{2})?\b",             "Time of day (HH:MM[:SS])"),
]

UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                          re.IGNORECASE)
LONG_HEX_PATTERN = re.compile(r"\b[0-9a-f]{16,}\b", re.IGNORECASE)
EMAIL_PATTERN = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")


def detect_violations(prompts: List[str], prefix_len: int = 512):
    """
    Scan the FIRST `prefix_len` chars of every prompt (the part that matters
    for prefix caching) for byte-instability patterns.
    """
    violations = defaultdict(int)
    example = {}  # category -> example string

    for p in prompts:
        head = p[:prefix_len]

        for pat_re, label in TIMESTAMP_PATTERNS:
            if re.search(pat_re, head):
                violations[f"timestamp: {label}"] += 1
                example.setdefault(f"timestamp: {label}", re.search(pat_re, head).group(0))

        if UUID_PATTERN.search(head):
            violations["UUID"] += 1
            example.setdefault("UUID", UUID_PATTERN.search(head).group(0))
        if LONG_HEX_PATTERN.search(head):
            violations["long hex string (request ID?)"] += 1
            example.setdefault("long hex string (request ID?)",
                               LONG_HEX_PATTERN.search(head).group(0))
        if EMAIL_PATTERN.search(head):
            violations["email address in prefix"] += 1
            example.setdefault("email address in prefix",
                               EMAIL_PATTERN.search(head).group(0))

    return violations, example


# ─── Demo data ────────────────────────────────────────────────────────────────

def demo_prompts() -> List[str]:
    """
    Synthetic production-ish prompts illustrating the failure modes. The
    'good' portion has a stable prefix; the 'bad' portion has timestamps
    injected.
    """
    import random
    random.seed(42)

    stable_prefix = (
        "You are Nexus, an AI assistant trained to detect fraudulent "
        "transactions. Analyze the following transaction data and return "
        "a risk score from 0.0 to 1.0, with reasoning. Be precise.\n\n"
        "Transaction: "
    )
    timestamped_prefix = (
        "You are Nexus, an AI assistant trained to detect fraudulent "
        "transactions. Current time: {timestamp}. Analyze the following "
        "transaction data and return a risk score from 0.0 to 1.0.\n\n"
        "Transaction: "
    )

    prompts = []
    for i in range(700):
        tx = f"${random.randint(10, 10000)} at merchant_{random.randint(0, 500)}"
        prompts.append(stable_prefix + tx)
    for i in range(300):
        ts = f"2026-04-{random.randint(1, 28):02d}T{random.randint(0,23):02d}:{random.randint(0,59):02d}:00"
        tx = f"${random.randint(10, 10000)} at merchant_{random.randint(0, 500)}"
        prompts.append(timestamped_prefix.replace("{timestamp}", ts) + tx)

    random.shuffle(prompts)
    return prompts


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--log", help="JSONL log file with one {'prompt': '...'} per line")
    p.add_argument("--field", default="prompt",
                   help="JSONL field containing the prompt text")
    p.add_argument("--demo", action="store_true",
                   help="Use synthetic demo prompts")
    p.add_argument("--prefix-lengths", default="64,256,1024,4096",
                   help="Prefix lengths (chars) to compute hit rates for")
    p.add_argument("--sample", type=int,
                   help="Sample only this many prompts from the log")
    args = p.parse_args()

    # Load prompts
    if args.demo:
        prompts = demo_prompts()
        print(f"[demo] using {len(prompts)} synthetic prompts")
    elif args.log:
        prompts = []
        with open(args.log) as f:
            for line in f:
                if line.strip():
                    try:
                        obj = json.loads(line)
                        prompts.append(obj.get(args.field, ""))
                    except json.JSONDecodeError:
                        prompts.append(line.strip())
        if args.sample and len(prompts) > args.sample:
            import random
            random.seed(42)
            prompts = random.sample(prompts, args.sample)
        print(f"loaded {len(prompts):,} prompts from {args.log}")
    else:
        sys.exit("Provide --log FILE or --demo")

    if not prompts:
        sys.exit("No prompts to analyze.")

    prefix_lengths = [int(L) for L in args.prefix_lengths.split(",")]

    print(f"\n{'═'*78}")
    print(f" RADIX PREFIX ANALYSIS")
    print(f"{'═'*78}")
    print(f" Prompts analyzed: {len(prompts):,}")
    print(f" Prompt length — min: {min(len(p) for p in prompts)}  "
          f"mean: {sum(len(p) for p in prompts)/len(prompts):.0f}  "
          f"max: {max(len(p) for p in prompts)}")
    print(f"{'═'*78}\n")

    # Hit rates at each prefix length
    print(f" {'prefix chars':>14} {'hit rate':>12} {'unique prefixes':>18} "
          f"{'top prefix shared by':>24}")
    print(" " + "-" * 78)
    results = analyze_prefixes(prompts, prefix_lengths)
    for L in prefix_lengths:
        r = results[L]
        top_count = r["top_prefixes"][0][1] if r["top_prefixes"] else 0
        print(f" {L:>14} {r['hit_rate_pct']:>11.1f}% {r['unique_prefixes']:>18,} "
              f"{top_count:>14,} prompts")

    # Byte-stability violations
    violations, examples = detect_violations(prompts, prefix_len=max(prefix_lengths))
    print()
    print(f"{'─'*78}")
    print(f" BYTE-STABILITY VIOLATIONS (in first {max(prefix_lengths)} chars)")
    print(f"{'─'*78}")
    if not violations:
        print("  None detected.")
    else:
        for category, count in sorted(violations.items(), key=lambda kv: -kv[1]):
            pct = 100.0 * count / len(prompts)
            ex = examples.get(category, "")
            print(f"  {category:<38} {count:>6,} prompts ({pct:>5.1f}%)  "
                  f"e.g. '{ex[:40]}'")

    # Verdict — what matters is the hit rate at a *production-relevant* prefix
    # length. 64 chars is trivially short; real system prompts are 512-2048
    # chars. If hit rate is high at 64 but drops at 512+, something in the
    # prefix window between those lengths is breaking byte-stability.
    print()
    print(f"{'─'*78}")
    print(f" VERDICT")
    print(f"{'─'*78}")
    prod_L = min(L for L in prefix_lengths if L >= 256) if any(L >= 256 for L in prefix_lengths) \
             else max(prefix_lengths)
    prod_hit = results[prod_L]["hit_rate_pct"]

    shallow_L = min(prefix_lengths)
    shallow_hit = results[shallow_L]["hit_rate_pct"]

    if prod_hit > 75 and not violations:
        print(f" ✓ Healthy. Hit rate at production-relevant prefix L={prod_L}: "
              f"{prod_hit:.1f}%.")
        print(f"   Prefix caching will deliver its promised TTFT reduction.")
    elif prod_hit > 50:
        print(f" ⚠ Degraded. Hit rate at L={prod_L}: {prod_hit:.1f}% "
              f"(short-prefix L={shallow_L} gets {shallow_hit:.1f}%).")
        print(f"   Suspect causes:")
        for cat in list(violations.keys())[:3]:
            print(f"     • {cat} ({violations[cat]} prompts affected)")
        print(f"   Fix: move variable content (timestamps, IDs) to AFTER the")
        print(f"   stable system prompt, not inside it.")
    else:
        print(f" ✗ Broken. Hit rate at L={prod_L}: {prod_hit:.1f}%.")
        if shallow_hit > 75:
            print(f"   The first {shallow_L} chars are stable ({shallow_hit:.1f}% hit) "
                  f"but something between chars {shallow_L} and {prod_L} varies per")
            print(f"   request. That's what's killing your hit rate.")
        print(f"   RadixAttention will give essentially no benefit until fixed.")
        if violations:
            top_v = max(violations.items(), key=lambda kv: kv[1])
            print(f"   Primary cause: {top_v[0]} in {top_v[1]} prompts — fix this first.")
    print()


if __name__ == "__main__":
    main()
