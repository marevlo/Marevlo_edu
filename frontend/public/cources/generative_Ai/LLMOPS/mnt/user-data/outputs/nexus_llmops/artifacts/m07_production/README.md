# Module 7 · Production System Design — Artifact Pack

Runnable artifacts for the production side of LLM serving: load shedding,
fallback routing, regional failover, retry storms, backpressure, cost
guardrails, and the observability stack that catches incidents before
users do.

## Files

| File | Purpose | Needs GPU / cluster? |
|---|---|---|
| `retry_storm_simulator.py` | Simulate how naive client retries amplify a brief 5xx blip into a full outage. Shows why retry budgets exist. | No |
| `load_shedding_calculator.py` | Given arrival rate, capacity, and SLO, compute the utilization threshold to start shedding — and which request classes to drop first. | No |
| `regional_failover_simulator.py` | Multi-region topology simulation: steady state → region-A outage → failover → recovery. Measures user-visible latency and re-routing time. | No |
| `chaos_test_harness.py` | Inject failures (latency, 5xx, connection drops) against a running inference endpoint; measure SLO burn during each scenario. | Running endpoint (no GPU) |
| `envoy_production_filters.yaml` | Production Envoy config: rate limiting, circuit breakers, outlier detection, retry budgets, timeouts. Every filter annotated. | No (config only) |
| `kserve_inferenceservice.yaml` | KServe InferenceService: canary split, queue-depth autoscaler, pod disruption budget, readiness gates. Drop-in for vLLM. | No (config only) |
| `istio_traffic_policy.yaml` | VirtualService + DestinationRule: locality routing, fault injection, retry budget, sticky routing for A/B. | No (config only) |
| `prometheus_production_alerts.yaml` | Full alert rulebook: SLO burn rate, queue depth, quality drift, cost drift, preemption storms, region health. 27 alerts. | No (config only) |
| `break_retry_storm.py` | Failure repro: naive retry config + brief 503 blip → 4× request amplification → outage. Reproducible in 30 seconds. | No |
| `operator_checklist.md` | 16-item pre-deploy checklist for production LLM systems. | No |

## Quick start (all runnable without a GPU)

```bash
# 1. See how a 10-second outage turns into a 4-minute outage under bad retry config
python retry_storm_simulator.py --failure-duration-s 10 --max-retries 3

# 2. Compute the shedding threshold for your capacity and SLO
python load_shedding_calculator.py --arrival-rate 1000 --capacity 1100 \
    --slo-ttft-ms 250 --mean-service-ms 60

# 3. Simulate a region outage on a three-region topology
python regional_failover_simulator.py --regions us-east,us-west,eu-west \
    --outage-region us-east --outage-duration-s 300

# 4. Run chaos tests against a real endpoint
python chaos_test_harness.py --endpoint http://localhost:8001 \
    --scenario latency_spike --duration-s 60
```

## Dependencies

```
python >= 3.10
numpy
pyyaml
requests  # for chaos_test_harness only
```

## Reading the output

Every runnable script prints a verdict. Example from the retry storm simulator:

```
VERDICT: With max_retries=3 and no retry budget, a 10s upstream blip
produces 47s of elevated error rate and 4.1× traffic amplification.
With retry budget of 10% + jittered backoff, the same blip recovers
in 12s with 1.3× amplification. Enable retry budget.
```

That's what goes in the RFC. Numbers back it up.
