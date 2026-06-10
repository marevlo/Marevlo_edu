# Module 5 · Batching & Scheduling — Artifact Pack

Runnable artifacts covering the operational math of batching, speculative
decoding, and scheduler policy choice. This is where you size the batch,
tune speculation, and pick a scheduler that holds your SLO under load.

## Files

| File | Purpose | Needs GPU? |
|---|---|---|
| `batching_throughput_model.py` | Compute expected throughput at each batch size under continuous batching. Find the knee of the curve before benchmarking. | No |
| `speculative_decoding_calculator.py` | Acceptance-rate math for speculative decoding. Given α and K, compute effective tokens-per-big-pass and cost economics. | No |
| `scheduler_simulator.py` | Simulate FIFO / SJF / EDF / priority scheduling on a synthetic request mix. Measure SLO hit rate under each policy. | No |
| `draft_model_acceptance_tracker.py` | Analyze a production decoding log. Detect drift in speculation acceptance rate over time. | No |
| `vllm_batching_config.yaml` | Production vLLM config: continuous batching + EAGLE-2 + deadline-aware scheduling. Line-by-line annotated. | No |
| `profile_speculation.sh` | Capture draft/target model timing, acceptance rate, preemption counts during a real load test. | Yes |
| `sample_output_h100.txt` | Reference outputs for all scripts. Use when you don't have GPU or production logs. | No |
| `break_speculation_acceptance.py` | Failure repro: traffic distribution shifts away from draft-model training data, acceptance rate silently drifts 0.85 → 0.62. | No |
| `operator_checklist.md` | 13-item pre-deploy checklist for batching and scheduling changes. | No |

## Quick start

```bash
# 1. What batch size maximizes throughput for your model shape?
python batching_throughput_model.py --model llama-3-70b-fp8 \
    --tpot-ms 12 --mean-output-tokens 180

# 2. Is speculative decoding worth deploying?
python speculative_decoding_calculator.py --alpha 0.80 --k 5 \
    --draft-ms 1.2 --target-ms 12

# 3. Which scheduler meets your SLOs?
python scheduler_simulator.py --policy-compare fifo,edf,priority \
    --arrival-rate 1000 --slo-ttft-ms 250

# 4. See how draft model drift silently destroys speculation
python break_speculation_acceptance.py
```

## Dependencies

```
python >= 3.10
numpy
pyyaml
```

All scripts degrade gracefully without GPU. GPU is only needed for
profile_speculation.sh to capture real engine telemetry.

## Reading the output

Every script prints a verdict line. Example from the batch throughput model:

```
VERDICT: max throughput 42,100 tok/s at batch=128. Knee of the curve is at
batch=48 — 92% of peak. Shipping at batch=48 gives better p99 TPOT (15ms)
than batch=128 (22ms) for a 3% throughput trade.
```

That verdict is the RFC-ready recommendation. Raw numbers are the evidence.
