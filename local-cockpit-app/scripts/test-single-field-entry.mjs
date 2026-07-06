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
if (result.profile !== "rtx_3060_12gb") throw new Error("valid single entry was not accepted");
if (result.first_30s_complete !== true || result.first_30s_source !== "derived_legacy") {
  throw new Error("valid legacy entry should expose derived UX 30s proof");
}

let failed = false;
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
