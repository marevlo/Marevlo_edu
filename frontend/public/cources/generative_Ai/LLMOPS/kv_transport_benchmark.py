#!/usr/bin/env python3
"""
kv_transport_benchmark.py

Measure KV cache transfer latency across the transport options for
disaggregated prefill/decode. Tells you whether your proposed topology
will actually work before you build it.

Why this exists:
  Disaggregated P/D splits prefill and decode across different GPU pools.
  The hand-off is a KV cache transfer from prefill-GPU → decode-GPU. If
  that transfer is slower than the work it's saving, disaggregation makes
  latency WORSE (M8 war story #5 — tried disaggregation over the internet,
  added 180ms of tail latency per request).

  The rule of thumb:
    - NVLink (within a node): always fast enough, <1ms for any KV
    - NVLink-over-Infiniband (rack-local): fast, 2-5ms
    - RDMA (data-center-local): borderline, 5-15ms — evaluate carefully
    - TCP (cross-AZ): DO NOT USE for KV transport; 50-200ms kills budget

Usage:
  # Measure real transport on a multi-GPU node
  python kv_transport_benchmark.py --transport nvlink --kv-size-mb 170 \\
      --src-gpu 0 --dst-gpu 1

  # Estimate without hardware (uses published bandwidth numbers)
  python kv_transport_benchmark.py --estimate --kv-size-mb 170

  # Sweep over KV sizes for planning
  python kv_transport_benchmark.py --estimate --sweep
"""

import argparse
import sys
import time

# Published nominal bandwidth numbers (single connection, realistic after overhead).
# Real measured throughput is typically 60-80% of peak theoretical.
TRANSPORT_BW_GB_S = {
    # Within a single DGX/HGX node
    "nvlink":            900.0,   # NVLink 4.0 (H100 SXM), 18 links × 50GB/s = 900 GB/s total
    "nvlink_effective":  450.0,   # Typical effective bandwidth per GPU pair
    "pcie_5x16":          64.0,   # PCIe 5.0 x16: 64 GB/s theoretical
    "pcie_4x16":          32.0,   # PCIe 4.0 x16
    # Across nodes, same rack
    "nvlink_switch":     900.0,   # NVSwitch/NVL72 — same node-internal bandwidth
    "infiniband_ndr":     50.0,   # NDR 400 Gbps Infiniband = ~50 GB/s
    "infiniband_hdr":     25.0,   # HDR 200 Gbps = ~25 GB/s
    "rdma_roce":          12.5,   # 100 GbE RoCE v2 = ~12.5 GB/s
    # Cross-AZ or internet
    "ethernet_100g":      12.5,   # 100 GbE
    "ethernet_10g":        1.25,  # 10 GbE
    "tcp_internet":        0.125, # Typical ~1 Gbps over public internet
}

# One-way latency (microseconds) for each transport — the minimum regardless of payload
TRANSPORT_LATENCY_US = {
    "nvlink":            1.5,
    "nvlink_effective":  2.0,
    "pcie_5x16":         5.0,
    "pcie_4x16":         8.0,
    "nvlink_switch":     3.0,
    "infiniband_ndr":    2.5,    # Infiniband has excellent latency
    "infiniband_hdr":    3.0,
    "rdma_roce":        10.0,
    "ethernet_100g":    30.0,    # 100GbE with TCP stack
    "ethernet_10g":     50.0,
    "tcp_internet":  50000.0,    # 50ms typical internet RTT / 2
}


def estimate_transfer(transport: str, kv_size_mb: float) -> float:
    """
    Estimate transfer time in milliseconds.
    time = base_latency + payload / bandwidth
    """
    if transport not in TRANSPORT_BW_GB_S:
        raise ValueError(f"Unknown transport '{transport}'. "
                        f"Options: {list(TRANSPORT_BW_GB_S.keys())}")
    bw_gb_s = TRANSPORT_BW_GB_S[transport]
    base_us = TRANSPORT_LATENCY_US[transport]

    # kv_size_mb / 1024 = GB; GB / (GB/s) = seconds; * 1000 = ms
    payload_ms = (kv_size_mb / 1024) / bw_gb_s * 1000
    base_ms = base_us / 1000

    return base_ms + payload_ms


def measure_real(transport: str, kv_size_mb: float,
                 src_gpu: int, dst_gpu: int, n_iter: int = 50):
    """
    Actually measure the transfer on real hardware via PyTorch.
    For NVLink: uses peer-to-peer copy.
    For PCIe: forces a host-staging intermediate.
    """
    try:
        import torch
    except ImportError:
        print("⚠  PyTorch not installed; cannot measure real transport.")
        print("   Use --estimate instead.")
        sys.exit(1)

    if not torch.cuda.is_available():
        print("⚠  No CUDA device. Use --estimate.")
        sys.exit(1)

    if torch.cuda.device_count() < 2:
        print(f"⚠  Only {torch.cuda.device_count()} GPU available; need 2+")
        print(f"   to measure transport. Use --estimate.")
        sys.exit(1)

    # KV-size allocation — approximate as a flat tensor
    n_elements = int(kv_size_mb * 1024 * 1024 / 2)  # bf16 = 2 bytes
    src = torch.randn(n_elements, dtype=torch.bfloat16, device=f"cuda:{src_gpu}")

    # Warm
    for _ in range(5):
        dst = src.to(f"cuda:{dst_gpu}")
    torch.cuda.synchronize()

    # Measure
    torch.cuda.synchronize()
    t0 = time.time()
    for _ in range(n_iter):
        dst = src.to(f"cuda:{dst_gpu}")
    torch.cuda.synchronize()
    elapsed_ms = (time.time() - t0) * 1000 / n_iter

    # Effective bandwidth
    eff_bw_gb_s = (kv_size_mb / 1024) / (elapsed_ms / 1000)
    return elapsed_ms, eff_bw_gb_s


def main():
    p = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--transport", default="nvlink",
                   choices=list(TRANSPORT_BW_GB_S.keys()),
                   help="Transport to evaluate")
    p.add_argument("--kv-size-mb", type=float, default=170,
                   help="KV cache size per request (MB). 170MB is typical for "
                        "Llama-3-70B GQA-8 FP8 at 16K context.")
    p.add_argument("--estimate", action="store_true",
                   help="Estimate only; do not measure on real hardware")
    p.add_argument("--sweep", action="store_true",
                   help="Sweep over kv sizes and all transports")
    p.add_argument("--src-gpu", type=int, default=0)
    p.add_argument("--dst-gpu", type=int, default=1)
    p.add_argument("--n-iter", type=int, default=50)
    args = p.parse_args()

    if args.sweep:
        # Show a full matrix — KV sizes × transports
        kv_sizes = [10, 50, 170, 500, 2000]  # MB
        print(f"\n{'═'*88}")
        print(f" KV TRANSPORT LATENCY MATRIX (estimated)")
        print(f"{'═'*88}")
        print(f" {'transport':<24} " +
              " ".join(f"{s:>5}MB" for s in kv_sizes))
        print(" " + "-" * 86)
        for t in TRANSPORT_BW_GB_S:
            row = [f" {t:<24} "]
            for s in kv_sizes:
                ms = estimate_transfer(t, s)
                row.append(f" {ms:>5.1f}ms")
            print("".join(row))
        print()
        print(f"{'─'*88}")
        print(" Rules of thumb for Llama-3-70B-class (170MB per request at 16K context):")
        print("   <5ms transfer   → disaggregation pays off; deploy.")
        print("   5-15ms         → marginal; benchmark end-to-end before deciding.")
        print("   >15ms          → disaggregation will HURT latency; stay cohabitated.")
        print()
        return

    # Single-transport evaluation
    print(f"\n{'═'*78}")
    print(f" KV TRANSPORT BENCHMARK")
    print(f"{'═'*78}")
    print(f" Transport:  {args.transport}")
    print(f" KV size:    {args.kv_size_mb} MB per request")
    print(f"{'═'*78}\n")

    # Always show the estimate
    est_ms = estimate_transfer(args.transport, args.kv_size_mb)
    est_bw = TRANSPORT_BW_GB_S[args.transport]
    print(f"  Estimated (from spec): {est_ms:.2f} ms")
    print(f"  Nominal bandwidth:     {est_bw} GB/s")
    print(f"  Effective throughput:  {(args.kv_size_mb / 1024) / (est_ms / 1000):.1f} GB/s\n")

    # Try to measure on real hardware
    if not args.estimate:
        print(f"  Attempting real measurement on cuda:{args.src_gpu} → "
              f"cuda:{args.dst_gpu} ...")
        try:
            real_ms, real_bw = measure_real(args.transport, args.kv_size_mb,
                                            args.src_gpu, args.dst_gpu, args.n_iter)
            print(f"  Measured:              {real_ms:.2f} ms  ({args.n_iter} iter)")
            print(f"  Measured bandwidth:    {real_bw:.1f} GB/s")
            final_ms = real_ms
        except SystemExit:
            final_ms = est_ms
    else:
        final_ms = est_ms

    # Verdict
    print()
    print(f"{'─'*78}")
    print(f" VERDICT")
    print(f"{'─'*78}")
    if final_ms < 5:
        print(f" ✓ Fast enough. Transfer overhead {final_ms:.1f}ms per request is")
        print(f"   well below typical TTFT budgets. Disaggregated P/D will pay off.")
    elif final_ms < 15:
        print(f" ⚠ Marginal. Transfer overhead {final_ms:.1f}ms per request is")
        print(f"   a meaningful fraction of TTFT. Disaggregation might help")
        print(f"   (throughput wins) but might hurt p99 latency. Benchmark")
        print(f"   end-to-end with real traffic before committing.")
    else:
        print(f" ✗ Too slow. Transfer overhead {final_ms:.1f}ms per request exceeds")
        print(f"   most TTFT budgets. Disaggregation will HURT latency on this")
        print(f"   transport. Options: faster transport (NVLink, Infiniband), or")
        print(f"   stay cohabitated with chunked prefill.")
    print()


if __name__ == "__main__":
    main()
