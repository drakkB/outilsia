#!/usr/bin/env node
import "../src/benchmark-proof-engine.js";

const engine = globalThis.__OUTILSIA_BENCHMARK_PROOF_ENGINE__;

function fail(message) {
  throw new Error(message);
}

function equal(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

function ok(value, label) {
  if (!value) fail(label);
}

function benchmark(overrides = {}) {
  return {
    model: "qwen3:14b",
    prompt: engine.STANDARD_PROMPT,
    prompt_sha256: "a".repeat(64),
    runtime: "native",
    execution_mode: "auto",
    measurement_source: "ollama_api",
    success: true,
    estimated_tokens_per_second: 71.4,
    prompt_tokens_per_second: 402.8,
    elapsed_ms: 2800,
    total_duration_ms: 2700,
    load_duration_ms: 320,
    eval_duration_ms: 2100,
    runtime_processor: "gpu",
    runtime_gpu_offload_percent: 100,
    runtime_evidence_source: "ollama_api_ps",
    created_at_ms: 1785200000000,
    ...overrides
  };
}

function protocol(value = benchmark(), overrides = {}) {
  return engine.buildBenchmarkProtocol({
    benchmark: value,
    prompt_sha256: value.prompt_sha256,
    runtime: value.runtime,
    ollama_version: "0.31.1",
    release: {
      app_version: "0.1.2",
      build_id: "20260728140751",
      source_commit: "b9179a95766d1167063e27b920d14e1e36815bfd"
    },
    ...overrides
  });
}

if (!engine) fail("Benchmark proof engine was not installed");

const exact = protocol();
equal(exact.schema, "outilsia.benchmark_protocol.v2", "Protocol schema");
equal(exact.binding.prompt_kind, "outilsia_vram_standard_v1", "Standard prompt");
equal(exact.binding.settings.num_ctx, 2048, "Deterministic context");
equal(exact.binding.settings.num_predict, 96, "Deterministic output budget");
equal(exact.binding.settings.seed, 42, "Deterministic seed");
equal(exact.eligibility.local_measured_proof, true, "Exact local proof");
equal(exact.eligibility.standard_comparison, true, "Standard comparison");

const same = engine.compareBenchmarkProtocols(exact, protocol(benchmark({ estimated_tokens_per_second: 65 })));
equal(same.comparable, true, "Same protocol is comparable");
const changedRuntime = protocol(benchmark({ runtime: "wsl" }));
const mismatch = engine.compareBenchmarkProtocols(exact, changedRuntime);
equal(mismatch.comparable, false, "Different runtime is blocked");
ok(mismatch.blockers.includes("runtime différent"), "Runtime blocker missing");
const changedVersion = protocol(benchmark(), { ollama_version: "0.31.2" });
ok(engine.compareBenchmarkProtocols(exact, changedVersion).blockers.includes("version Ollama différente"), "Ollama version blocker missing");
const bounded = protocol(benchmark({
  tuning: {
    num_ctx: 90_000,
    num_batch: 4,
    num_thread: 128
  }
}));
equal(bounded.binding.settings.num_ctx, 32_768, "Context matches Rust upper bound");
equal(bounded.binding.settings.num_batch, 32, "Batch matches Rust lower bound");
equal(bounded.binding.settings.num_thread, 64, "Thread count matches Rust upper bound");

const fullGpu = engine.explainBottleneck({
  benchmark: benchmark(),
  scan: { vram_gb: 16, raw_scan: { memory_probe: { module_count: 2 } } },
  doctor: { gpu: { temperature_c: 62 } }
});
equal(fullGpu.primary.key, "no_observed_hardware_bottleneck", "Full GPU diagnosis");
equal(fullGpu.purchase.key, "no_buy", "Full GPU purchase decision");
ok(fullGpu.unknowns.some((item) => item.includes("dual channel")), "RAM channel honesty missing");
ok(fullGpu.unknowns.some((item) => item.includes("température")), "Thermal honesty missing");

const hybrid = engine.explainBottleneck({
  benchmark: benchmark({
    runtime_processor: "hybrid",
    runtime_gpu_offload_percent: 58
  }),
  scan: { vram_gb: 11 }
});
equal(hybrid.primary.key, "vram_capacity", "Hybrid low offload diagnosis");
equal(hybrid.primary.confidence, "medium", "Hybrid confidence");
equal(hybrid.purchase.key, "conditional_vram", "Hybrid purchase decision");

const unknownPlacement = engine.explainBottleneck({
  benchmark: benchmark({
    runtime_processor: "unknown",
    runtime_gpu_offload_percent: 0,
    runtime_evidence_source: ""
  }),
  scan: { vram_gb: 16 }
});
equal(unknownPlacement.primary.key, "allocation_unknown", "Missing allocation stays unknown");
equal(unknownPlacement.purchase.key, "measure_first", "Unknown allocation blocks buying advice");

const cpuFallback = engine.explainBottleneck({
  benchmark: benchmark({
    runtime_processor: "cpu",
    runtime_gpu_offload_percent: 0
  }),
  scan: { gpu_name: "NVIDIA GeForce GTX 1080 Ti", vram_gb: 11 }
});
equal(cpuFallback.primary.key, "runtime_backend", "GPU present but CPU execution");
equal(cpuFallback.purchase.key, "measure_first", "CPU fallback does not trigger GPU purchase");

const storage = engine.explainBottleneck({
  benchmark: null,
  preflight: {
    verdict: "blocked",
    blockers: ["18 Go libres mesurés, 29 Go requis avec réserve."]
  }
});
equal(storage.primary.key, "storage_capacity", "Measured storage blocker");
equal(storage.purchase.key, "conditional_storage", "Storage recommendation is conditional");

const thermal = engine.explainBottleneck({
  benchmark: benchmark(),
  scan: { raw_scan: { gpu_probe: { thermal_throttling: true, temperature_c: 91 } } }
});
equal(thermal.primary.key, "thermal_throttling", "Explicit thermal throttle");

const failedCuda = engine.explainBottleneck({
  benchmark: benchmark({
    success: false,
    measurement_source: "unavailable",
    estimated_tokens_per_second: 0,
    error: "CUDA driver error"
  }),
  scan: { vram_gb: 11 }
});
equal(failedCuda.primary.key, "runtime_backend", "CUDA failure diagnosis");
equal(failedCuda.purchase.key, "measure_first", "CUDA failure is not a GPU purchase verdict");

const proof = engine.buildProofCard({
  protocol: exact,
  benchmark: benchmark(),
  scan: {
    machine_key: "secret-machine",
    name: "Chris-PC",
    cpu_name: "AMD Ryzen 7 7800X3D",
    ram_gb: 64,
    gpu_name: "NVIDIA RTX 4080 SUPER",
    vram_gb: 16,
    os_name: "Windows 11"
  },
  bottleneck: fullGpu,
  share_url: "https://outilsia.fr/r/public_demo"
});
equal(proof.schema, "outilsia.proof_card.v1", "Proof card schema");
equal(proof.badge.verified, false, "Local card is not identity verified");
equal(proof.links.shared_report, "https://outilsia.fr/r/public_demo", "Exact share URL");
equal(proof.diagnosis.purchase.key, "no_buy", "No-buy proof propagation");
const privacy = engine.proofCardPrivacyAudit(proof, [
  "secret-machine",
  "Chris-PC",
  engine.STANDARD_QUESTION,
  "La VRAM stocke les poids"
]);
equal(privacy.ok, true, `Proof privacy: ${privacy.violations.join(", ")}`);
ok(!JSON.stringify(proof).includes("secret-machine"), "Machine key leaked");
ok(!JSON.stringify(proof).includes(engine.STANDARD_QUESTION), "Raw prompt leaked");

const customProtocol = protocol(benchmark({
  prompt: "Question privée",
  prompt_sha256: "b".repeat(64)
}));
equal(customProtocol.eligibility.local_measured_proof, true, "Custom exact local proof");
equal(customProtocol.eligibility.standard_comparison, false, "Custom prompt excluded from public comparison");
const customCard = engine.buildProofCard({
  protocol: customProtocol,
  benchmark: benchmark({ prompt: "Question privée", prompt_sha256: "b".repeat(64) }),
  scan: { cpu_name: "CPU", gpu_name: "GPU", ram_gb: 32, vram_gb: 12 }
});
equal(customCard.badge.key, "local_measured", "Custom card badge");
equal(customCard.protocol.public_aggregate_eligible, false, "Custom card public exclusion");
equal(engine.buildProofCard({
  protocol: exact,
  benchmark: benchmark({ model: "fake:72b" }),
  scan: { cpu_name: "CPU", gpu_name: "GPU", ram_gb: 32, vram_gb: 12 }
}), null, "Mismatched model must not produce a proof card");

console.log(
  "benchmark_proof_engine_ok "
  + "protocol=v2 bottleneck=7_profiles proof_privacy=true standard_comparable=true"
);
