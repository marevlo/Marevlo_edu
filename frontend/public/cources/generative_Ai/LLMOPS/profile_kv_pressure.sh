#!/usr/bin/env bash
# profile_kv_pressure.sh
#
# KV pressure profiling pack. Captures the signals that diagnose every
# common KV-related production issue: fragmentation, prefix hit rate drops,
# preemption storms, eviction cascades.
#
# Usage:
#   ./profile_kv_pressure.sh --engine vllm --duration 120 \
#       --endpoint http://localhost:8001/metrics
#
# Outputs go to ./kv_profile_<timestamp>/

set -euo pipefail

ENGINE="vllm"
DURATION=120
ENDPOINT="http://localhost:8001/metrics"
TS=$(date +%Y%m%d_%H%M%S)
OUT="kv_profile_${TS}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --engine)    ENGINE="$2"; shift 2 ;;
        --duration)  DURATION="$2"; shift 2 ;;
        --endpoint)  ENDPOINT="$2"; shift 2 ;;
        -h|--help)
            grep '^#' "$0" | head -20; exit 0 ;;
        *)  echo "Unknown arg: $1"; exit 1 ;;
    esac
done

mkdir -p "$OUT"

echo "═══════════════════════════════════════════════════════════════════"
echo "  KV pressure profiling · $ENGINE · ${DURATION}s · output → $OUT/"
echo "═══════════════════════════════════════════════════════════════════"

# ─── 1. Prerequisites ────────────────────────────────────────────────────────
for tool in dcgmi curl jq; do
    if ! command -v $tool >/dev/null 2>&1; then
        echo "⚠  $tool not found."
        case $tool in
            dcgmi) echo "   apt install datacenter-gpu-manager" ;;
            jq)    echo "   apt install jq" ;;
            curl)  echo "   apt install curl" ;;
        esac
        exit 1
    fi
done

# ─── 2. Baseline ────────────────────────────────────────────────────────────
echo ""; echo "[1/4] Baseline snapshot"
nvidia-smi --query-gpu=index,name,memory.used,memory.total --format=csv > "$OUT/gpu_baseline.csv"
curl -s "$ENDPOINT" > "$OUT/vllm_metrics_t0.txt" || \
    { echo "⚠ Cannot reach $ENDPOINT"; exit 1; }

# ─── 3. Start DCGM + vLLM metrics sampling ──────────────────────────────────
# Signals:
#   1005 DRAM_ACTIVE — HBM bandwidth utilization (should be 70-90% in decode)
#   1007 MEMORY_FREE — free HBM (watch the ceiling)
#   1009 FB_USED    — frame buffer used (should track block-pool occupancy)
echo ""; echo "[2/4] Starting DCGM sampling (200ms resolution, ${DURATION}s)"
dcgmi dmon -e 1005,1007,1009,1010 -d 200 -c $((DURATION * 5)) \
    > "$OUT/dcgm_stream.log" 2>&1 &
DCGM_PID=$!

# ─── 4. Sample vLLM metrics once per second ─────────────────────────────────
echo "[3/4] Sampling vLLM metrics endpoint every 1s"
(
    for i in $(seq 1 $DURATION); do
        ts=$(date +%s)
        curl -s "$ENDPOINT" | awk -v ts=$ts '
            /^vllm:gpu_cache_usage_perc/         {kv=$2}
            /^vllm:prefix_cache_hit_rate/        {hit=$2}
            /^vllm:num_preemptions_total/        {preempt=$2}
            /^vllm:num_requests_running/         {running=$2}
            /^vllm:num_requests_waiting/         {waiting=$2}
            /^vllm:time_to_first_token_seconds_sum/ {ttft=$2}
            END {print ts, kv, hit, preempt, running, waiting, ttft}
        ' >> "$OUT/vllm_timeseries.log"
        sleep 1
    done
) &
VLLM_PID=$!

# Let it run
wait $DCGM_PID 2>/dev/null || true
wait $VLLM_PID 2>/dev/null || true

# ─── 5. Post-process ────────────────────────────────────────────────────────
echo ""; echo "[4/4] Post-processing"

python3 <<PYEOF
import sys, statistics

try:
    # vLLM timeseries: timestamp, kv_pct, hit_rate, preempt_total, running, waiting, ttft_sum
    with open("$OUT/vllm_timeseries.log") as f:
        rows = [l.split() for l in f if l.strip()]

    kv = [float(r[1]) for r in rows if len(r) > 1 and r[1].replace(".","").isdigit()]
    hit = [float(r[2]) for r in rows if len(r) > 2 and r[2].replace(".","").isdigit()]

    # Preempt: total increases over time; delta = preemption events in this window
    preempt = [float(r[3]) for r in rows if len(r) > 3 and r[3].replace(".","").isdigit()]
    preempt_delta = (preempt[-1] - preempt[0]) if len(preempt) >= 2 else 0

    waiting = [float(r[5]) for r in rows if len(r) > 5 and r[5].replace(".","").isdigit()]

    print("\n  ─── vLLM metrics summary ───")
    if kv:
        print(f"    KV cache usage: mean {statistics.mean(kv)*100:.1f}%  "
              f"max {max(kv)*100:.1f}%  p95 {sorted(kv)[int(len(kv)*0.95)]*100:.1f}%")
        if max(kv) > 0.92:
            print("    ⚠  KV usage hit >92% — OOM risk, preemption imminent.")
    if hit:
        print(f"    Prefix cache hit rate: mean {statistics.mean(hit)*100:.1f}%  "
              f"min {min(hit)*100:.1f}%")
        if statistics.mean(hit) < 0.70:
            print("    ⚠  Prefix hit rate below 70% — run radix_prefix_analyzer.py")
            print("       on the prompt stream to identify byte-stability violations.")
    print(f"    Preemption events in window: {int(preempt_delta)}")
    if preempt_delta > len(rows) * 0.05:
        print("    ⚠  >5% of requests preempted. Options:")
        print("       - reduce max_num_seqs")
        print("       - raise prefix_caching_gc_threshold")
        print("       - migrate to disaggregated P/D (if transport permits)")
    if waiting:
        print(f"    Waiting queue depth: mean {statistics.mean(waiting):.1f}  "
              f"max {max(waiting):.0f}")

except Exception as e:
    print(f"  Could not parse vllm_timeseries.log: {e}")

try:
    with open("$OUT/dcgm_stream.log") as f:
        rows = [l.split() for l in f if l.strip() and not l.startswith("#") and
                not l.startswith("GPU-Id")]
    # DCGM dmon output: ID DRAM_ACTIVE MEMORY_FREE FB_USED NVLINK_TX
    dram = [float(r[1]) for r in rows if len(r) >= 5 and r[1].replace(".","").isdigit()]
    fb = [float(r[3]) for r in rows if len(r) >= 5 and r[3].replace(".","").isdigit()]
    print("\n  ─── DCGM HBM summary ───")
    if dram:
        print(f"    DRAM_ACTIVE (HBM BW util): mean {statistics.mean(dram)*100:.1f}%  "
              f"max {max(dram)*100:.1f}%")
        if statistics.mean(dram) < 0.60:
            print("    ⚠  HBM BW below 60% — GPU is idle part of the time. Likely")
            print("       causes: insufficient concurrency, scheduler starvation, or")
            print("       bad CUDA graph capture. Check max_num_seqs and graph sizes.")
    if fb:
        print(f"    FB_USED (frame buffer): mean {statistics.mean(fb)/1024:.1f} GB")
except Exception as e:
    print(f"  Could not parse dcgm_stream.log: {e}")

print()
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " Artifacts in $OUT/:"
echo "   gpu_baseline.csv       — GPU state before load"
echo "   vllm_metrics_t0.txt    — raw vLLM metrics at start"
echo "   vllm_timeseries.log    — per-second kv/hit/preempt metrics"
echo "   dcgm_stream.log        — HBM BW over time"
echo ""
echo " Next steps:"
echo "   1. If kv usage was high, consider block_size down-tune or max_num_seqs cap."
echo "   2. If hit rate was low, run radix_prefix_analyzer.py on the prompt log."
echo "   3. If preemption rate was high, review the preemption_mode setting."
echo "═══════════════════════════════════════════════════════════════════"
