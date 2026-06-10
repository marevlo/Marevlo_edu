# Batching & Scheduling · Pre-Deploy Operator Checklist

Drop into a team runbook. Verify every item before a batching, speculation,
or scheduler change reaches production.

If any item fails or is ambiguous, do not deploy.

---

## □ 1. Batch size validated for your SLO

Run `batching_throughput_model.py` with your model shape, hardware, mean
context length, and TPOT SLO. The SLO-compliant recommendation should
match `max_num_seqs` in your config. Going higher gains throughput but
misses the TPOT SLO.

**Failure caught:** shipping at peak-throughput batch size that blows TPOT
under real load.

---

## □ 2. CUDA graph capture covers all batch sizes

`cuda_graph_capture_sizes` must include every batch size the scheduler
will actually land on. A missed graph forces eager execution adding ~800μs
per step — a 10%+ TPOT regression.

Include 1, 4, 8, 16, 32, and whatever `max_num_seqs` is. For Nexus v5 with
`max_num_seqs: 64`, that's `[1, 4, 8, 16, 32, 48, 64]`.

---

## □ 3. Speculation economics validated

Run `speculative_decoding_calculator.py` with:
  - Your expected α (from a prototype run, or the α observed on the prior
    version of the draft model)
  - Your K (default 5, tune with --k-sweep if unsure)
  - Measured draft and target step times

Expected speedup should be ≥ 2.0×. Below 1.5× it's not worth deploying.

---

## □ 4. Draft model retraining pipeline wired up

If speculation is enabled, a weekly retraining pipeline MUST be running
before go-live. Without it, α drifts silently and nobody notices until
finance catches the cost creep (M8 war story #6).

The retraining pipeline should:
  - Ingest the last 7-14 days of production prompts + completions
  - Fine-tune the draft model (typically 500M-1B) on that window
  - Validate new draft via canary (10% of traffic for 24h)
  - Auto-promote if α observed on canary is within 0.03 of target

---

## □ 5. Acceptance-rate alarm configured

Wire a Prometheus alert:
```
alert: SpeculationAcceptanceLow
expr:  rate(vllm:spec_decode_accepted_tokens_total[1h]) /
       rate(vllm:spec_decode_draft_tokens_total[1h]) < 0.70
for:   1h
```

This catches drift before it costs a full retraining window.

---

## □ 6. Scheduler policy matches workload shape

If your workload is homogeneous (all-chat, all-batch), FIFO is fine.

If it's mixed (interactive + standard + batch classes), FIFO will fail
at >70% of capacity. Run `scheduler_simulator.py` at your expected arrival
rate and class mix. Verify the recommended policy matches `scheduling_policy`
in your config.

**Failure caught:** priority/EDF scheduler would have kept interactive
SLO; FIFO let batch requests starve interactive ones.

---

## □ 7. Tenant priority tiers defined at gateway

If using priority scheduling, the gateway must tag every request with
its class BEFORE it reaches vLLM. Verify:
  - Each tenant or endpoint has an explicit class assigned
  - The class flows through as a request header
  - vLLM's scheduler respects the header (check startup log)

---

## □ 8. Admission control configured

`request_timeout_seconds` must be set. Without it, a long-queued request
just waits forever and eventually times out at the client — while
occupying KV budget during that wait. Explicit timeout lets the engine
drop overage requests cleanly.

60 seconds is a reasonable default for most workloads. Adjust per
tenant if needed via gateway-level admission control.

---

## □ 9. Preemption behaviour understood

`preemption_mode: swap` saves preempted KV to CPU (lower cost to resume
but CPU overhead during swap).
`preemption_mode: recompute` drops KV (zero CPU cost but higher latency
cost on resume).

For interactive-heavy workloads, recompute is often better (low KV,
fast re-prefill). For long-output workloads, swap avoids discarding
hours of accumulated decode state. Verify the setting matches your
workload shape.

---

## □ 10. Speculation correctness validated

After enabling speculation, run a numerical parity test: 1,000 prompts,
compare top-1 tokens between speculation-on and speculation-off. The
two must produce ≤0.1% token-level divergence (speculative decoding is
mathematically lossless — any divergence is a bug).

If divergence >0.1%, check:
  - Draft and target use the same tokenizer
  - Temperature and sampling params match between draft and target
  - Rejection sampling uses the correct formula (see speculative_step.py)

---

## □ 11. Load test at expected peak + 25%

Run a load test at 125% of your expected peak arrival rate. Measure:
  - Interactive-class TTFT p99 stays below SLO
  - Overall throughput doesn't collapse
  - Preemption rate stays below 5%
  - Acceptance rate α stays within 0.03 of training-time value

Any failure here is a capacity issue, not a scheduler issue. Scale up
or reduce max_num_seqs before rolling out.

---

## □ 12. Monitor 5 metrics post-deploy for 48h

After rollout:
  - `vllm:time_per_output_token_seconds` p99 → TPOT regression
  - `vllm:spec_decode_accepted_tokens_total` / `_draft_tokens_total` → α health
  - `vllm:num_preemptions_total` → capacity signal
  - `vllm:num_requests_waiting` → scheduler health
  - `cost_per_million_tokens` (derived, from gateway billing) → economics check

These five on the top row of the on-call dashboard catch every M5-related
incident in its first hour.

---

## □ 13. Rollback rehearsed

One-command rollback verified to complete in <90 seconds. For vLLM+KServe
this is a `kubectl patch inferenceservice` with the prior config revision.

Critically: if speculation is disabled in the rollback config, the draft
model must still be loadable — don't delete the prior draft artifact until
you've been stable for 30+ days.

---

## After deploy

- [ ] Update engineering memo with actual measured α, throughput, TTFT p99
- [ ] Add this config's Grafana snapshot to archive
- [ ] Schedule re-evaluation in 90 days (or when vLLM ships major updates)

---

*Last reviewed: 2026-04. Next review due: 2026-07.*
