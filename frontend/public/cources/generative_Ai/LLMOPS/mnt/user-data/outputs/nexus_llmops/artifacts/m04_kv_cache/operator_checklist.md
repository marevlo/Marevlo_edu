# KV Cache Engineering · Pre-Deploy Operator Checklist

Drop this into a team runbook. Verify every item before a KV-related change
reaches production — block size, prefix caching, chunked prefill, disaggregation,
or KV dtype changes.

If any item fails or is ambiguous, do not deploy.

---

## □ 1. Block size validated on YOUR workload

Run `paged_kv_simulator.py` on a representative sample of your request-length
distribution. The recommended block size should match what you're planning
to deploy. If it doesn't, either:
  - Change the block size to match the recommendation
  - Document WHY you're deviating (e.g., single-tenant long-context workload)

**Failure mode caught:** block size copied from a blog post that doesn't match
your workload shape, costing 5-15% throughput.

---

## □ 2. Prefix-caching hit rate verified >80% at L=512

Run `radix_prefix_analyzer.py` on a sample of 1,000+ real production prompts.
Hit rate at prefix-length=512 chars must be >80%, with no detected byte-stability
violations.

If hit rate is <80%, fix the prompt template BEFORE enabling prefix caching.
Shipping with a broken prompt template makes the infrastructure look broken
when the issue is upstream.

**Failure mode caught:** timestamp or UUID in the prefix killing hit rate
(M7 war story #1).

---

## □ 3. Chunked prefill chunk size tuned

Run `chunked_prefill_calculator.py` with YOUR TTFT budget, prefill p99, TPOT,
and prefill throughput. The recommended chunk size should be what you're
planning to ship.

If the calculator reports "no chunk size satisfies both targets," you cannot
fix this with chunked prefill. Options:
  - Relax TTFT budget (negotiate with product)
  - Cap max_model_len to reduce p99 prefill length
  - Move to disaggregated P/D (verify transport first)

---

## □ 4. KV dtype taking effect

After starting the engine, verify steady-state KV memory matches the dtype
you set. The formula:

```
expected_kv_bytes = 2 × num_layers × num_kv_heads × head_dim
                    × max_seq_len × max_num_seqs × bytes_per_elem
```

With `kv_cache_dtype: fp8_e4m3`, measured KV should be ~half of FP16.
If it matches FP16 size, the dtype setting is not being applied.

**Failure mode caught:** FP8 KV calibration file missing; engine silently
falling back to FP16.

---

## □ 5. KV calibration file is YOUR traffic

If using FP8 KV, the calibration file must be calibrated on YOUR production
traffic distribution, not the default.

Nexus saw a 0.7 F1 regression using default scales on fraud-detection
traffic; re-calibration recovered it. This is easy to miss because offline
eval on WikiText looks fine.

---

## □ 6. KV transport benchmarked if disaggregating

If `disagg_prefill.enabled: true`, run `kv_transport_benchmark.py` on the
actual transport between pools. Transfer time for your typical KV size must
be <5ms. Marginal (5-15ms) requires end-to-end benchmark before commit.
>15ms means disaggregation WILL hurt latency.

**Failure mode caught:** disaggregation over slow network adding 180ms
to p99 (M8 war story #5).

---

## □ 7. Preemption rate below 5%

Under realistic load (at or above expected peak), measured preemption rate
from `vllm:num_preemptions_total` must be <5% of total requests.

If higher, tune one of:
  - Reduce `max_num_seqs` to limit concurrent KV demand
  - Raise `prefix_caching_gc_threshold` to free KV earlier
  - Reduce max_model_len (less reserved KV per request)
  - Switch `preemption_mode` from "swap" to "recompute" for short requests

High preemption rate causes tail latency spikes that look like scheduler
bugs but are actually capacity bugs.

---

## □ 8. Per-tenant trie keying for regulated tenants

If serving tenants with compliance requirements (PCI, HIPAA, SOC 2),
verify `prefix_caching_tenant_keyed: true` for those tenants. Check by
inspecting trie state via the admin API (if exposed) or through synthetic
test requests — cross-tenant prefix hits must not occur.

**Failure mode caught:** cross-tenant prefix collision that audit would flag.

---

## □ 9. KV pressure alert thresholds set

The following Prometheus alerts must be configured BEFORE rollout:

```
vllm:gpu_cache_usage_perc > 0.92 for 5m    → OOM imminent
vllm:prefix_cache_hit_rate < 0.8 × baseline → byte-stability violation
vllm:num_preemptions_total increasing > 5% → capacity issue
```

These three, on the on-call dashboard's top row, catch 80% of KV-related
incidents before they escalate.

---

## □ 10. CUDA graph capture sizes cover expected batch

CUDA graphs remove ~800μs per decode step, a 10%+ throughput win at
production batch sizes. But a missed graph forces eager execution (much
slower).

Verify `cuda_graph_capture_sizes` covers every batch size you expect to
see under load, including rare sizes like batch=3 (emerging under scale-down).
Default `[1, 4, 8, 16, 32, 64, 128, 256]` is good; extend if your
scheduler might land on batch=3 or batch=12.

---

## □ 11. Chunked prefill compatible with all enabled optimizations

Chunked prefill interacts with speculative decoding (M5), tensor
parallelism, and prefix caching. Verify:
  - Prefix cache hit still works with chunked prefill on (it does in
    vLLM ≥ 0.6, but test)
  - Speculative decoding (if enabled from M5) doesn't apply during prefill
    chunks — speculation only applies during decode
  - TP>1 splits chunks across GPUs without issue

Run a small end-to-end test with all enabled optimizations together before
full rollout.

---

## □ 12. Block-pool sizing verified

At startup, the engine reports the block pool size. Cross-check:
```
num_blocks × block_size × kv_bytes_per_token ≈ reported KV pool size
```

If the numbers don't match within 5%, something is wrong — the engine is
computing KV size differently than expected.

---

## □ 13. Rollback rehearsed

Verify one-command rollback to the previous KV config works and completes
in <90 seconds. For KServe, this is a `kubectl patch inferenceservice`.

If rollback requires a rebuild or manual step, it is not a rollback — it
is a redeploy, and will take 2+ hours during an incident.

---

## □ 14. Monitor for 24 hours post-deploy

After rollout, watch these 4 metrics specifically for 24 hours:

1. **`vllm:prefix_cache_hit_rate`** — leading indicator of byte-stability
   violations. Alert if drops >20% below 7-day baseline.
2. **`vllm:gpu_cache_usage_perc`** — capacity signal. Alert if max
   sustained >92%.
3. **`vllm:time_to_first_token_seconds p99`** — SLO signal. Alert if
   regresses >15% vs prior config.
4. **`vllm:num_preemptions_total`** — stability signal. Alert if rate
   doubles vs prior config.

After 24 hours stable, these can move back to the dashboard's second row.

---

## After deploy

- [ ] Update engineering memo with actual measured numbers
- [ ] Archive the previous config's Grafana dashboard snapshot
- [ ] Schedule re-evaluation in 90 days (or when vLLM/SGLang ship major updates)

---

*Last reviewed: 2026-04. Next review due: 2026-07.*
