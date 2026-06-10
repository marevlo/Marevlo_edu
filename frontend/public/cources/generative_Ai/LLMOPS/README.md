# Module 3 · Attention Engineering — Artifact Pack

Runnable artifacts that accompany Module 3. Each file is designed to be executed, modified, broken, and re-run. This is the "clone, run, break, diagnose, fix" portion of the module.

## Files

| File | Purpose | Needs GPU? |
|---|---|---|
| `kv_sizing_calculator.py` | Compute per-request KV bytes for MHA / GQA / MLA on any Llama-style config. Answers "will this fit?" before deployment. | No |
| `benchmark_attention_kernels.py` | Measure attention kernel time for vanilla / FA-2 / FA-3 across four sequence lengths on a realistic model shape. | Yes · H100/H200 recommended |
| `vllm_gqa_config.yaml` | Production vLLM config with GQA-8 + FP8 KV + prefix caching. Annotated line-by-line. | No (config only) |
| `profile_attention.sh` | `nsys` + DCGM profiling command pack. Captures attention kernel time, HBM BW, and decode-vs-prefill split. | Yes |
| `sample_output_h100.txt` | Expected benchmark output on H100 SXM 80GB. Use as a reference if you don't have GPU access. | No |
| `break_mla_decompression.py` | Failure reproduction: demonstrates the "up-projection on critical path" integration mistake that destroys MLA's speedup. | Yes |
| `operator_checklist.md` | Pre-deploy checklist. 12 items to verify before an attention-related change reaches production. | No |

## Quick start (with GPU)

```bash
# 1. Size your KV cache (no GPU needed)
python kv_sizing_calculator.py --model llama-3-70b --gqa-groups 8 --seq-len 8192 --batch 32

# 2. Benchmark the kernels
python benchmark_attention_kernels.py --model-shape llama-3-8b --seq-lens 1024,4096,16384,65536

# 3. Profile a real workload
./profile_attention.sh vllm --model meta-llama/Meta-Llama-3-8B-Instruct

# 4. See how MLA can be integrated wrong
python break_mla_decompression.py  # prints timing; compare to correct integration
```

## Quick start (without GPU)

Read `sample_output_h100.txt` to see what correct output looks like. Use `kv_sizing_calculator.py` and `operator_checklist.md` — both work without CUDA.

## Dependencies

```
torch >= 2.3
flash-attn >= 2.5  # for FA-2 numbers; FA-3 requires H100 + flash-attn 2.6+
vllm >= 0.6       # for config validation
numpy
pyyaml
```

Install with:
```
pip install torch flash-attn vllm pyyaml
```

## Reading the output

Every script prints a "verdict line" at the end — one-sentence interpretation of what the numbers mean in production terms. Example from the sizing calculator:

```
VERDICT: Per-request KV is 1.94 GB at 8192 context. On an H200 (141 GB HBM, ~80 GB
available after weights), max concurrent requests ≈ 41. For 128K context the same
config hits OOM at batch 3. Consider MLA or reducing max_model_len.
```

The verdict is what you paste into an RFC or design doc. The raw numbers are the evidence behind it.
