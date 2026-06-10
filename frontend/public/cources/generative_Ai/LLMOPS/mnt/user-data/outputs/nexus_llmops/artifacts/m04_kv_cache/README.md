# Module 4 · KV Cache Engineering — Artifact Pack

Runnable artifacts for the operational side of KV cache engineering: sizing,
paging, prefix sharing, chunked prefill, and disaggregated prefill/decode.

## Files

| File | Purpose | Needs GPU? |
|---|---|---|
| `paged_kv_simulator.py` | Simulate PagedAttention block allocation over a realistic request mix. Answer "what block size should I use?" before benchmarking. | No |
| `radix_prefix_analyzer.py` | Analyze a production prompt log, compute achievable prefix-cache hit rate, identify byte-stability violations that would kill it. | No |
| `kv_transport_benchmark.py` | Measure KV transfer latency over NVLink / PCIe / RDMA / TCP for disaggregated P/D planning. Answers "is my network fast enough?" | Yes |
| `chunked_prefill_calculator.py` | Compute the right chunk size for your TTFT budget and expected prefill length distribution. | No |
| `vllm_kv_prod_config.yaml` | Production vLLM config: PagedAttention block=32, prefix caching, chunked prefill, FP8 KV. Line-by-line annotated. | No |
| `profile_kv_pressure.sh` | DCGM + vLLM Prometheus capture pack. Catches fragmentation, prefix hit rate, preemption storms. | Yes |
| `sample_output_h100.txt` | Reference outputs for a representative production workload. | No |
| `break_prefix_cache.py` | Failure repro: prompt template with an embedded timestamp, showing how hit rate collapses from 78% → 4%. | No |
| `operator_checklist.md` | Pre-deploy checklist. 14 items to verify before a KV-related change reaches production. | No |

## Quick start (no GPU required for most)

```bash
# 1. Size your block pool before deploying
python paged_kv_simulator.py --model llama-3-70b --seq-len-dist lognormal \
    --mean-tokens 1200 --num-requests 10000 --block-size 32

# 2. Analyze a real prompt log for prefix-caching health
python radix_prefix_analyzer.py --log prompts.jsonl --sample 1000

# 3. Calculate chunked-prefill size for your TTFT budget
python chunked_prefill_calculator.py --ttft-budget-ms 250 \
    --prefill-length 4096 --tpot-ms 15

# 4. See how a timestamp in the system prompt kills hit rate
python break_prefix_cache.py
```

## Quick start (with GPU)

```bash
# Measure KV transport for disaggregation planning
python kv_transport_benchmark.py --transport nvlink --kv-size-mb 170

# Profile a vLLM instance under load
./profile_kv_pressure.sh --engine vllm --duration 120
```

## Dependencies

```
python >= 3.10
numpy
pyyaml
(GPU artifacts only:) torch >= 2.3, pynvml, pynccl
```

## Reading the output

Every script prints a verdict line. Example from the paged simulator:

```
VERDICT: block_size=32 gives 93.8% effective pool utilization with 6.2%
fragmentation. block_size=64 gives 88.4% util, 11.6% frag — worse for this
workload. block_size=16 gives 94.1% util but 1.8x page-table overhead
makes it slower. Ship block_size=32.
```

That verdict is what goes in the RFC. The raw numbers are the evidence.
