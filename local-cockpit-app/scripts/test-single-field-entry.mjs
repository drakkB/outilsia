#!/usr/bin/env node
import { validateSingleFieldEntry } from "./validate-single-field-entry.mjs";

const valid = {
  profile: "rtx_3060_12gb",
  app_version: "0.1.1",
  build_id: "fixture-build",
  tested_at: "2026-07-05T10:00:00.000Z",
  machine_label: "fixture RTX 3060 12 Go",
  os: "Windows 11",
  cpu: "AMD Ryzen fixture",
  gpu: "NVIDIA GeForce RTX 3060",
  ram_gb: 32,
  vram_gb: 12,
  scan_ok: true,
  score: 72,
  score_label: "Bon PC IA locale",
  recommended_model: "hermes3:8b",
  first_action: "Lancer un benchmark court",
  upgrade_recommendation: "Tester avant achat",
  benchmark_model: "qwen3:0.6b",
  benchmark_tokens_per_second: 24.5,
  benchmark_elapsed_ms: 2200,
  promptforge_ok: true,
  dialogue_ok: true,
  arena_ok: true,
  report_ok: true,
  share_url: "https://outilsia.fr/r/fixture",
};

const result = validateSingleFieldEntry(valid, "rtx_3060_12gb");
let failed = false;
if (result.profile !== "rtx_3060_12gb") throw new Error("valid single entry was not accepted");
if (result.first_30s_complete !== true || result.first_30s_source !== "derived_legacy") {
  throw new Error("valid legacy entry should expose derived UX 30s proof");
}
if (result.hardware_doctor.available || result.capability_passport.available || result.runtime_evidence.proven) {
  throw new Error("legacy field entry should remain valid without enriched evidence");
}

const enriched = validateSingleFieldEntry({
  ...valid,
  hardware_doctor: {
    schema: "outilsia.hardware_doctor.v2",
    score: 81,
  },
  capability_passport_ok: true,
  capability_passport_schema: "outilsia.ai_capability_passport.v1",
  capability_passport_digest: "a".repeat(64),
  runtime_readiness: "ready",
  runtime_readiness_label: "Accélération GPU observée",
  benchmark_execution_mode: "auto",
  benchmark_runtime_processor: "gpu",
  benchmark_gpu_offload_percent: 100,
  benchmark_runtime_evidence_source: "ollama_api_ps",
}, "rtx_3060_12gb");
if (!enriched.hardware_doctor.available || enriched.hardware_doctor.score !== 81) {
  throw new Error("Hardware Doctor v2 evidence was not preserved");
}
if (!enriched.capability_passport.available || enriched.capability_passport.digest !== "a".repeat(64)) {
  throw new Error("optional Passport evidence was not preserved");
}
if (!enriched.runtime_evidence.proven || enriched.runtime_evidence.processor !== "gpu") {
  throw new Error("Ollama runtime evidence was not preserved");
}

failed = false;
try {
  validateSingleFieldEntry({
    ...valid,
    capability_passport_ok: true,
    capability_passport_schema: "outilsia.ai_capability_passport.v1",
    capability_passport_digest: "not-a-digest",
  }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("capability_passport_digest");
}
if (!failed) throw new Error("malformed optional Passport evidence should fail");

failed = false;
try {
  validateSingleFieldEntry({
    ...valid,
    benchmark_runtime_processor: "gpu",
    benchmark_gpu_offload_percent: 100,
    benchmark_runtime_evidence_source: "legacy_history",
  }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("ollama_api_ps");
}
if (!failed) throw new Error("unproven GPU allocation should fail when claimed");

const explicit = validateSingleFieldEntry({
  ...valid,
  first_30s: {
    hardware_visible: true,
    score_visible: true,
    recommended_model_visible: true,
    benchmark_cta_or_proof_visible: true,
    upgrade_visible: true,
    summary: "matériel, score, modèle, benchmark et upgrade visibles",
  },
}, "rtx_3060_12gb");
if (explicit.first_30s_source !== "explicit") throw new Error("explicit UX 30s proof should be preserved");

failed = false;
try {
  validateSingleFieldEntry({
    ...valid,
    first_30s: {
      hardware_visible: true,
      score_visible: true,
      recommended_model_visible: true,
      benchmark_cta_or_proof_visible: false,
      upgrade_visible: true,
      summary: "benchmark absent",
    },
  }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("first_30s");
}
if (!failed) throw new Error("invalid explicit UX 30s proof should fail");

try {
  validateSingleFieldEntry({ ...valid, arena_ok: false }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("arena_ok");
}
if (!failed) throw new Error("invalid single entry should fail on arena_ok");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, share_url: "" }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("share_url");
}
if (!failed) throw new Error("invalid single entry should fail without share_url");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, build_id: "" }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("build_id");
}
if (!failed) throw new Error("invalid single entry should fail without build_id");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, app_version: "" }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("app_version");
}
if (!failed) throw new Error("invalid single entry should fail without app_version");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, share_url: "https://example.com/report" }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("OutilsIA shared report URL");
}
if (!failed) throw new Error("invalid single entry should fail with non-OutilsIA share_url");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, gpu: "NVIDIA GeForce RTX 4070" }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("rtx_3060_12gb.gpu");
}
if (!failed) throw new Error("invalid single entry should fail with profile/hardware mismatch");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, tested_at: "" }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("tested_at");
}
if (!failed) throw new Error("invalid single entry should fail without tested_at");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, benchmark_elapsed_ms: 1 }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("benchmark_elapsed_ms");
}
if (!failed) throw new Error("invalid single entry should fail on implausible benchmark elapsed time");

failed = false;
try {
  validateSingleFieldEntry({ ...valid, benchmark_tokens_per_second: 250 }, "rtx_3060_12gb");
} catch (error) {
  failed = String(error.message || error).includes("implausible");
}
if (!failed) throw new Error("invalid single entry should fail on implausible benchmark speed");

console.log(`single_field_entry_validator_ok profile=${result.profile}`);
