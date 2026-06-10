#!/usr/bin/env bash
# profile_attention.sh
#
# Attention-kernel profiling command pack. Captures three signals during a
# real vLLM run: (1) kernel time breakdown via Nsight Systems, (2) HBM
# bandwidth utilization via DCGM, (3) per-request TTFT/TPOT via the vLLM
# Prometheus endpoint. The output of these three together tells you whether
# your attention kernel choice is actually paying off on your workload.
#
# Usage:
#   ./profile_attention.sh vllm --model meta-llama/Meta-Llama-3-8B-Instruct
#   ./profile_attention.sh sglang --model-path /path/to/model
#
# Outputs go to ./profile_output_<timestamp>/

set -euo pipefail

ENGINE="${1:-vllm}"; shift || true
MODEL_ARGS="$@"
TS=$(date +%Y%m%d_%H%M%S)
OUT="profile_output_${TS}"
mkdir -p "$OUT"

echo "═══════════════════════════════════════════════════════════════════"
echo "  Attention profiling · $ENGINE · output → $OUT/"
echo "═══════════════════════════════════════════════════════════════════"

# ─── 1. Check prerequisites ──────────────────────────────────────────────────
for tool in nsys dcgmi nvidia-smi; do
    if ! command -v $tool >/dev/null 2>&1; then
        echo "⚠  $tool not found. Install:"
        case $tool in
            nsys)   echo "   apt install nsight-systems-cli  (or DeepOps NVIDIA repo)" ;;
            dcgmi)  echo "   apt install datacenter-gpu-manager" ;;
            nvidia-smi) echo "   NVIDIA drivers are not installed" ;;
        esac
        exit 1
    fi
done

# ─── 2. Record GPU state ──────────────────────────────────────────────────────
echo ""; echo "[1/4] GPU baseline state"
nvidia-smi > "$OUT/gpu_baseline.txt"
nvidia-smi --query-gpu=name,driver_version,memory.total,compute_cap \
    --format=csv >> "$OUT/gpu_baseline.txt"

# ─── 3. Start DCGM sampling at 100ms resolution ─────────────────────────────
# Signals captured:
#   1001 GRACT_ACTIVE       — % of time SM is active (≠ "GPU util")
#   1002 SM_ACTIVE          — % of cycles where at least one warp is active
#   1005 DRAM_ACTIVE        — % of cycles HBM is active (this is the BW signal)
#   1008 PCIE_TX_BYTES      — PCIe egress
#   1009 PCIE_RX_BYTES      — PCIe ingress
#   1010 NVLINK_TX_BYTES    — NVLink egress (matters for TP>1)
#   1011 NVLINK_RX_BYTES    — NVLink ingress
#
# DRAM_ACTIVE is the single most important number. For memory-bound decode,
# this should sit above 85% during steady state. Below 70% means you're not
# pushing HBM and the kernel choice is probably wrong.

echo ""; echo "[2/4] Starting DCGM field-group capture (100ms resolution)"
DCGM_GROUP_ID=$(dcgmi group -c attention_profile -a 0 2>&1 | \
    grep -oE 'group id = [0-9]+' | awk '{print $NF}' || echo "0")
dcgmi dmon -e 1001,1002,1005,1008,1009,1010,1011 -d 100 \
    > "$OUT/dcgm_stream.log" &
DCGM_PID=$!
echo "   DCGM PID: $DCGM_PID"

# ─── 4. Run workload under nsys ─────────────────────────────────────────────
echo ""; echo "[3/4] Launching $ENGINE under nsys · press Ctrl-C to stop"
echo "   (run a benchmark against the server while this is live)"

case $ENGINE in
    vllm)
        # --cudabacktrace on so we can see which Python call launched each kernel.
        # --capture-range=cudaProfilerApi lets us scope the capture to prefill/decode
        # if we add torch.cuda.profiler.start()/stop() markers in the engine.
        nsys profile \
            --output="$OUT/vllm_trace" \
            --trace=cuda,nvtx,osrt,cudnn,cublas \
            --sample=cpu \
            --cudabacktrace=all \
            --stats=true \
            vllm serve $MODEL_ARGS
        ;;
    sglang)
        nsys profile \
            --output="$OUT/sglang_trace" \
            --trace=cuda,nvtx,osrt,cudnn,cublas \
            --sample=cpu \
            python -m sglang.launch_server $MODEL_ARGS
        ;;
    *)
        echo "Unknown engine: $ENGINE"
        kill $DCGM_PID
        exit 1
        ;;
esac

# ─── 5. Cleanup ───────────────────────────────────────────────────────────────
kill $DCGM_PID 2>/dev/null || true
echo ""; echo "[4/4] Post-processing"

# Summarize the nsys trace — get top 20 CUDA kernels by time. This is the
# single most useful artifact; it tells you at a glance whether attention
# dominates, which kernel the FA dispatch landed on, and whether softmax
# or GEMM is the bottleneck.
nsys stats --report cuda_kern_exec_trace_sum \
    "$OUT/${ENGINE}_trace.nsys-rep" \
    --format csv --output "$OUT/top_kernels.csv" 2>/dev/null || true

# Summarize DCGM: mean DRAM_ACTIVE during steady-state
python3 <<'PYEOF'
import statistics, sys
try:
    with open("$OUT/dcgm_stream.log") as f:
        rows = [l.split() for l in f if l.strip() and not l.startswith("#")]
    # Column 6 is DRAM_ACTIVE (% HBM bandwidth), when using -e 1001,1002,1005,...
    dram = [float(r[5]) for r in rows if len(r) > 5 and r[5].replace(".","").isdigit()]
    if dram:
        print(f"   Mean HBM BW util: {statistics.mean(dram):.1f}%  "
              f"max: {max(dram):.1f}%  p95: {sorted(dram)[int(len(dram)*0.95)]:.1f}%")
        if statistics.mean(dram) < 0.7:
            print("   ⚠  HBM BW below 70% — decode is not memory-bound. Check kernel dispatch.")
except Exception as e:
    print(f"   (could not parse dcgm_stream.log: {e})")
PYEOF

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " Artifacts in $OUT/:"
echo "   gpu_baseline.txt       — driver version, GPU model, compute cap"
echo "   ${ENGINE}_trace.nsys-rep — open in Nsight Systems GUI for timeline"
echo "   top_kernels.csv        — kernel time breakdown (paste into the RFC)"
echo "   dcgm_stream.log        — HBM BW utilization over time"
echo ""
echo " Next steps:"
echo "   1. Open ${ENGINE}_trace.nsys-rep in Nsight Systems"
echo "   2. Filter by 'flash_attn' to see attention kernel time"
echo "   3. Verify the kernel name matches your expected FA version"
echo "      (FA-3 kernels have _hopper_ in the name)"
echo "═══════════════════════════════════════════════════════════════════"
