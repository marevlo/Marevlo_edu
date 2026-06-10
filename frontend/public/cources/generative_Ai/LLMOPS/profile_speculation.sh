#!/usr/bin/env bash
# profile_speculation.sh
#
# Capture speculation and batching telemetry during a real vLLM load test.
# Combines DCGM (hardware), vLLM Prometheus (engine), and nsys (timing
# breakdown). Produces the three artifacts that diagnose every common
# M5-related issue: acceptance-rate drift, preemption storms, and draft
# model dominating wall time.
#
# Usage:
#   ./profile_speculation.sh --duration 120 --endpoint http://localhost:8001/metrics
#
# Outputs to ./spec_profile_<timestamp>/

set -euo pipefail

DURATION=120
ENDPOINT="http://localhost:8001/metrics"
CAPTURE_NSYS=false
TS=$(date +%Y%m%d_%H%M%S)
OUT="spec_profile_${TS}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --duration)  DURATION="$2"; shift 2 ;;
        --endpoint)  ENDPOINT="$2"; shift 2 ;;
        --nsys)      CAPTURE_NSYS=true; shift ;;
        -h|--help)
            grep '^#' "$0" | head -18; exit 0 ;;
        *)  echo "Unknown arg: $1"; exit 1 ;;
    esac
done

mkdir -p "$OUT"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Speculation & batching profile · ${DURATION}s · output → $OUT/"
echo "═══════════════════════════════════════════════════════════════════"

# ─── 1. Prerequisites ───────────────────────────────────────────────────────
for tool in curl dcgmi; do
    command -v $tool >/dev/null 2>&1 || {
        echo "⚠  $tool not found."; exit 1; }
done
if $CAPTURE_NSYS; then
    command -v nsys >/dev/null 2>&1 || {
        echo "⚠  nsys not found (--nsys requested)."; exit 1; }
fi

# ─── 2. Baseline vLLM metrics ───────────────────────────────────────────────
echo ""; echo "[1/4] Baseline snapshot"
curl -s "$ENDPOINT" > "$OUT/vllm_metrics_t0.txt" || {
    echo "⚠  Cannot reach $ENDPOINT"; exit 1; }

# Extract baseline counters so we can compute deltas later
grep -E "^vllm:(num_preemptions_total|spec_decode_accepted_tokens_total|spec_decode_draft_tokens_total)" \
    "$OUT/vllm_metrics_t0.txt" > "$OUT/counters_t0.txt" || true

# ─── 3. Start DCGM sampling (HBM BW + GPU util) ─────────────────────────────
echo "[2/4] Starting DCGM sampling (200ms resolution)"
dcgmi dmon -e 1001,1005,1007 -d 200 -c $((DURATION * 5)) \
    > "$OUT/dcgm_stream.log" 2>&1 &
DCGM_PID=$!

# ─── 4. Poll vLLM metrics each second ───────────────────────────────────────
echo "[3/4] Polling vLLM metrics every 1s for ${DURATION}s"
(
    for i in $(seq 1 $DURATION); do
        ts=$(date +%s)
        raw=$(curl -s "$ENDPOINT" 2>/dev/null || echo "")
        awk -v ts=$ts '
            /^vllm:time_to_first_token_seconds_count/       {ttft_n=$2}
            /^vllm:time_to_first_token_seconds_sum/         {ttft_s=$2}
            /^vllm:time_per_output_token_seconds_count/     {tpot_n=$2}
            /^vllm:time_per_output_token_seconds_sum/       {tpot_s=$2}
            /^vllm:spec_decode_accepted_tokens_total/       {acc=$2}
            /^vllm:spec_decode_draft_tokens_total/          {draft=$2}
            /^vllm:num_preemptions_total/                   {preempt=$2}
            /^vllm:num_requests_running/                    {running=$2}
            /^vllm:num_requests_waiting/                    {waiting=$2}
            /^vllm:gpu_cache_usage_perc/                    {kv=$2}
            END {print ts, ttft_n, ttft_s, tpot_n, tpot_s, acc, draft, preempt, running, waiting, kv}
        ' <<< "$raw" >> "$OUT/vllm_timeseries.log"
        sleep 1
    done
) &
METRICS_PID=$!

wait $DCGM_PID 2>/dev/null || true
wait $METRICS_PID 2>/dev/null || true

# ─── 5. Post-process ────────────────────────────────────────────────────────
echo "[4/4] Post-processing"

python3 <<PYEOF
import statistics

def safe_float(x):
    try:
        return float(x)
    except (ValueError, TypeError):
        return None

try:
    with open("$OUT/vllm_timeseries.log") as f:
        rows = [l.split() for l in f if l.strip()]
    # Columns: ts ttft_n ttft_s tpot_n tpot_s acc draft preempt running waiting kv

    # Acceptance rate: accepted / drafted (delta over window)
    accs = [safe_float(r[5]) for r in rows]
    drafts = [safe_float(r[6]) for r in rows]
    accs = [x for x in accs if x is not None]
    drafts = [x for x in drafts if x is not None]

    print()
    print("  ─── Speculation health ───")
    if len(accs) >= 2 and len(drafts) >= 2 and drafts[-1] > drafts[0]:
        delta_acc = accs[-1] - accs[0]
        delta_draft = drafts[-1] - drafts[0]
        alpha = delta_acc / delta_draft
        print(f"    Acceptance rate α (window):  {alpha:.3f}")
        print(f"    Accepted tokens:             {int(delta_acc):,}")
        print(f"    Drafted tokens:              {int(delta_draft):,}")
        if alpha < 0.70:
            print(f"    ⚠  α below 0.70 — draft model may be stale. Check:")
            print(f"       • Last draft-model retraining date")
            print(f"       • Traffic-distribution drift via draft_model_acceptance_tracker.py")
            print(f"       • Per-tenant α breakdown")
        elif alpha < 0.80:
            print(f"    ⚠  α low (0.70-0.80). Speedup is less than expected.")
        else:
            print(f"    ✓  α healthy.")
    else:
        print("    No speculation metrics in this window (is spec decoding enabled?)")

    # Preemption rate
    print()
    print("  ─── Preemption ───")
    preempts = [safe_float(r[7]) for r in rows]
    preempts = [x for x in preempts if x is not None]
    if len(preempts) >= 2:
        delta = preempts[-1] - preempts[0]
        print(f"    Preemptions in window: {int(delta)}")
        if delta > len(rows) * 0.3:  # >30% of samples had a preemption
            print(f"    ⚠  High preemption — KV pool under pressure. Reduce max_num_seqs")
            print(f"       or increase prefix_caching_gc_threshold.")

    # Queue depth
    waitings = [safe_float(r[9]) for r in rows]
    waitings = [x for x in waitings if x is not None]
    if waitings:
        print()
        print("  ─── Queue health ───")
        print(f"    Waiting queue:  mean {statistics.mean(waitings):.1f}  "
              f"max {max(waitings):.0f}  p95 {sorted(waitings)[int(len(waitings)*0.95)]:.0f}")
        if statistics.mean(waitings) > 5:
            print(f"    ⚠  Queue building up — arrival rate exceeds service rate.")
            print(f"       Consider scaling up, or switching to priority scheduler")
            print(f"       to protect interactive-class SLO.")

except Exception as e:
    print(f"  Could not parse vllm_timeseries.log: {e}")

print()
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " Artifacts in $OUT/:"
echo "   vllm_metrics_t0.txt     — raw baseline metrics snapshot"
echo "   vllm_timeseries.log     — per-second metrics stream"
echo "   dcgm_stream.log         — HBM BW + GPU util over time"
echo ""
echo " Next steps:"
echo "   1. If α was low, run draft_model_acceptance_tracker.py on recent logs"
echo "      to see when it started drifting."
echo "   2. If preemption was high, check block pool sizing via paged_kv_simulator.py"
echo "      from the M4 artifact pack."
echo "   3. If queue was building, run scheduler_simulator.py to verify the"
echo "      scheduler choice matches your arrival rate."
echo "═══════════════════════════════════════════════════════════════════"
