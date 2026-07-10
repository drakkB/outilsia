#!/usr/bin/env node
import { validateFieldTests, REQUIRED_PROFILES } from "./import-field-tests.mjs";

const profileHardware = {
  old_laptop: { os: "Windows 10 laptop", cpu: "Intel Core i5 mobile", gpu: "NVIDIA GTX 1050 laptop", ram_gb: 16, vram_gb: 4 },
  core_i7_gtx_1080_ti: { os: "Windows 10", cpu: "Intel Core i7-7700K", gpu: "NVIDIA GeForce GTX 1080 Ti", ram_gb: 32, vram_gb: 11 },
  rtx_3060_12gb: { os: "Windows 11", cpu: "AMD Ryzen fixture", gpu: "NVIDIA GeForce RTX 3060", ram_gb: 32, vram_gb: 12 },
  rtx_4080_4090: { os: "Windows 11", cpu: "AMD Ryzen fixture", gpu: "NVIDIA GeForce RTX 4080 SUPER", ram_gb: 64, vram_gb: 16 },
  cpu_only: { os: "Windows 11", cpu: "Intel CPU only", gpu: "CPU only / aucun GPU dédié", ram_gb: 16, vram_gb: 0 },
};

const machines = REQUIRED_PROFILES.map((profile, index) => ({
  profile,
  tested_at: "2026-07-05T10:00:00.000Z",
  machine_label: `fixture ${profile}`,
  os: profileHardware[profile].os,
  cpu: profileHardware[profile].cpu,
  gpu: profileHardware[profile].gpu,
  ram_gb: profileHardware[profile].ram_gb,
  vram_gb: profileHardware[profile].vram_gb,
  scan_ok: true,
  score: index === 4 ? 34 : 72,
  score_label: index === 4 ? "CPU-only utilisable en léger" : "Bon PC IA locale",
  recommended_model: index === 4 ? "llama3.2:3b" : "hermes3:8b",
  first_action: "Lancer un benchmark court",
  upgrade_recommendation: index === 4 ? "Ajouter un GPU 12 Go" : "Tester avant achat",
  benchmark_model: index === 4 ? "llama3.2:3b" : "qwen3:0.6b",
  benchmark_tokens_per_second: [14.2, 28.4, 42.6, 84.8, 4.2][index],
  benchmark_elapsed_ms: index === 4 ? 12500 : 2200,
  promptforge_ok: true,
  dialogue_ok: true,
  arena_ok: true,
  report_ok: true,
  share_url: `https://outilsia.fr/r/fixture-${profile}`,
  notes: "Fixture validator only.",
  ...(profile === "rtx_4080_4090" ? {
    hardware_doctor: { schema: "outilsia.hardware_doctor.v2", score: 92 },
    capability_passport_ok: true,
    capability_passport_schema: "outilsia.ai_capability_passport.v1",
    capability_passport_digest: "c".repeat(64),
    runtime_readiness: "ready",
    runtime_readiness_label: "Accélération GPU observée",
    benchmark_execution_mode: "auto",
    benchmark_runtime_processor: "gpu",
    benchmark_gpu_offload_percent: 100,
    benchmark_runtime_evidence_source: "ollama_api_ps",
  } : {}),
}));

const payload = {
  schema: "outilsia.local_cockpit_field_tests.v1",
  tested_at: "2026-07-04T00:00:00Z",
  tester: "validator-fixture",
  app_version: "0.1.1",
  build_id: "20260704165748",
  machines,
  notes: "Synthetic fixture used only to validate the importer."
};

const result = validateFieldTests(payload, { verifyShareUrls: false });
if (result.ok !== true || result.profile_count !== REQUIRED_PROFILES.length) {
  throw new Error(`Unexpected validation result: ${JSON.stringify(result)}`);
}
if (result.enriched_evidence.hardware_doctor_v2_profiles.join(",") !== "rtx_4080_4090"
  || result.enriched_evidence.ollama_runtime_proof_profiles.join(",") !== "rtx_4080_4090"
  || result.enriched_evidence.capability_passport_profiles.join(",") !== "rtx_4080_4090") {
  throw new Error(`Unexpected enriched evidence: ${JSON.stringify(result.enriched_evidence)}`);
}

let failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine) => machine.profile === "rtx_4080_4090"
      ? { ...machine, capability_passport_digest: "invalid" }
      : machine),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("capability_passport_digest");
}
if (!failed) throw new Error("field tests payload should reject malformed optional Passport evidence");

failed = false;
try {
  validateFieldTests({ ...payload, build_id: "" }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("payload.build_id");
}
if (!failed) throw new Error("field tests payload should fail without build_id");

failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine, index) => index === 0 ? { ...machine, share_url: "https://example.com/report" } : machine),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("OutilsIA shared report URL");
}
if (!failed) throw new Error("field tests payload should reject non-OutilsIA report URLs");

failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine) => machine.profile === "rtx_3060_12gb" ? { ...machine, gpu: "NVIDIA GeForce RTX 4070", vram_gb: 12 } : machine),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("rtx_3060_12gb.gpu");
}
if (!failed) throw new Error("field tests payload should reject profile/hardware mismatch");

failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine) => ({ ...machine, share_url: "https://outilsia.fr/r/fixture-same" })),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("Duplicate share_url");
}
if (!failed) throw new Error("field tests payload should reject duplicate share_url values");

failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine) => machine.profile === "old_laptop" ? { ...machine, benchmark_tokens_per_second: 128.7 } : machine),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("implausible");
}
if (!failed) throw new Error("field tests payload should reject implausible old_laptop benchmark speed");

failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine) => machine.profile === "rtx_3060_12gb" ? { ...machine, benchmark_elapsed_ms: 1 } : machine),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("benchmark_elapsed_ms");
}
if (!failed) throw new Error("field tests payload should reject implausible benchmark elapsed time");

failed = false;
try {
  validateFieldTests({
    ...payload,
    machines: payload.machines.map((machine) => ({ ...machine, benchmark_tokens_per_second: 24.5 })),
  }, { verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("Duplicate benchmark_tokens_per_second");
}
if (!failed) throw new Error("field tests payload should reject duplicate benchmark speeds");

console.log(`field_tests_validator_ok profiles=${result.profile_count}`);
