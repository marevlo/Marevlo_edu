# Attention Engineering · Pre-Deploy Operator Checklist

This checklist is designed to be copied into a team runbook. Run through it
before any attention-related change reaches production — FlashAttention
version bumps, GQA reconfiguration, MLA enablement, KV dtype changes.

If any item fails or is unclear, do not deploy.

---

## □ 1. Kernel dispatch verification

Run one real request through the model with `nsys profile` and verify the
attention kernel name matches the expected FA version:

- `flash_fwd_kernel` → FA-1 (should not be in production)
- `_ZN5flash8flash_fwd` → FA-2
- `_ZN13flash_hopper` → FA-3 (H100/H200)
- `mla_attn_decode` / `mla_decode_kernel` → MLA fused kernel

**Failure mode caught:** silent fallback to a slower kernel because of a
version mismatch between the serving engine and the installed flash-attn.

---

## □ 2. Numerical parity vs reference

Run 100 inputs through the new config and diff the logits against a known-good
reference (previous version, or eager-mode attention). Any token whose top-1
logit differs by more than 5% of logit range is flagged.

Expected: <0.1% of tokens flagged. >1% means there's a numerical bug.

**Failure mode caught:** FA-3 hopper build with a known softmax numerical
issue; kernel selection picking an FP8-path for FP16 inputs.

---

## □ 3. KV cache dtype taking effect

After starting the engine, inspect GPU memory usage via `nvidia-smi` at
steady-state batch. KV cache memory should be approximately:

```
expected_kv_bytes = 2 * num_layers * num_kv_heads * head_dim * max_seq_len
                     * max_num_seqs * bytes_per_elem
```

If KV dtype is set to `fp8_e4m3` but memory matches FP16 size, the dtype
setting is not being applied (most often due to a calibration file missing).

**Failure mode caught:** FP8 KV cache silently falling back to FP16 because
calibration scales file is missing or wrong path.

---

## □ 4. GQA group count sanity

Confirm the model's GQA structure matches what the engine thinks it is:
- Model config's `num_key_value_heads`
- Engine's reported KV-head-count in startup log
- Actual attention kernel receiving KV tensors with that head count

All three should match. A mismatch means the engine is doing the wrong
kind of attention (e.g., repeating KV heads on every decode step).

---

## □ 5. Prefix cache warm-up

Send 1,000 requests with an identical system prompt (at least 256 tokens).
Monitor the vLLM `prefix_cache_hit_rate` metric. It should rise to >80%
within the first 100 requests and stabilize.

If hit rate stays below 20%:
- Check system prompt is byte-identical across requests (no timestamps,
  request IDs, or user-specific tokens in the prefix)
- Check tokenizer version is stable
- Check `enable_prefix_caching: true` in the config

**Failure mode caught:** upstream prompt template change introducing a
timestamp (M7 war story #1).

---

## □ 6. Context length ramp test

Test the engine at your max_model_len with one request, then at 2x expected
typical request size. Verify:
- No CUDA OOM
- Latency scales roughly linearly (not quadratically — that signals
  attention kernel not taking effect)
- `gpu_cache_usage_perc` metric reports the expected occupancy

**Failure mode caught:** max_model_len set higher than what weights+KV+activations
can actually support on the chosen hardware.

---

## □ 7. Batch-size stability

Send batched requests at every CUDA graph capture size you configured:
`[1, 4, 8, 16, 32, 64, 128]`. Each should produce similar per-token latency
(within 20%). Large jumps between sizes indicate a missing graph.

A missed graph forces eager execution, which adds ~800 μs per step — a
10-20% TPOT regression at production batch sizes.

**Failure mode caught:** CUDA graph capture sizes not covering a real batch
size that emerges under load.

---

## □ 8. Prefill-decode separation (if chunked prefill enabled)

With `enable_chunked_prefill: true`, send a mix of long-prompt requests
(4k+ tokens) and short-prompt requests simultaneously. Monitor TPOT p99.9
vs p99:
- If p99.9 / p99 < 3x → prefill is not interfering with decode ✓
- If p99.9 / p99 > 5x → prefill intrusions are stalling decode; reduce
  `max_num_batched_tokens_prefill_chunk` or fully disaggregate

**Failure mode caught:** large prefill chunks causing visible decode stalls.

---

## □ 9. Attention mask correctness at batch boundaries

Particularly important when batching mixed-length requests. Send a batch
containing a 128-token request alongside a 4,096-token request. Verify the
shorter request's output is bit-identical to running it alone (same seed,
same sampling).

**Failure mode caught:** padding or segment-ID bugs that let tokens attend
across request boundaries in a batch.

---

## □ 10. FA version pinning

The `flash-attn` Python package MUST be pinned to an exact version in your
requirements.txt, not a range. A point-release of flash-attn in June 2024
changed the default dtype handling for FP8 KV; engines that had `flash-attn>=2.5`
instead of `flash-attn==2.5.8` silently picked up the new behavior.

```
flash-attn==2.6.3  # pin, do not use >= or ~=
```

**Failure mode caught:** silent behavior change from a pip install in a
rebuild pipeline.

---

## □ 11. Rollback rehearsal

Verify you can roll back to the previous attention configuration in one
command. For KServe this is a `kubectl patch inferenceservice` with the
prior config; for Ray Serve it's a deployment redeploy. Time the rollback
once; it should complete in <90 seconds.

If rollback requires a rebuild or manual steps, it is not a rollback — it
is a re-deploy, and it will take 2+ hours during an incident when you can
least afford it.

---

## □ 12. Monitor two signals for 24 hours post-deploy

After rolling out, the two metrics that leading-indicate an attention
problem — watch these specifically for 24 hours:

1. **`flash_attn_kernel_time_ms` (p99)** — regressions show up here first.
   Alert threshold: >25% above prior 7-day baseline.

2. **`prefix_cache_hit_rate`** — if byte-stability assumptions broke, this
   collapses before any latency metric moves.
   Alert threshold: <80% of prior 7-day rolling mean.

Both metrics should be on the on-call dashboard's top row for the deploy
window. After 24 hours of stable values they can move back to the second-row
section of the dashboard.

---

## After deploy

- [ ] Update the engineering memo with actual benchmark numbers
- [ ] Archive the previous config's Grafana dashboard snapshot
- [ ] Schedule a re-evaluation in 90 days (or when flash-attn/vLLM/SGLang
      ship major updates)

---

*Last reviewed: 2026-04. Next review due: 2026-07.*
