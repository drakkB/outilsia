#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REQUIRED_PROFILES } from "./import-field-tests.mjs";
import { validateFieldEntries } from "./validate-field-entries.mjs";

function baseEntry(profile) {
  const benchmarkSpeeds = {
    old_laptop: 12.5,
    core_i7_gtx_1080_ti: 28.5,
    rtx_3060_12gb: 42.5,
    rtx_4080_4090: 84.5,
    cpu_only: 4.5,
  };
  const hardware = {
    old_laptop: { cpu: "Intel Core i5 mobile", gpu: "NVIDIA GTX 1050 laptop", ram_gb: 16, vram_gb: 4 },
    core_i7_gtx_1080_ti: { cpu: "Intel Core i7-7700K", gpu: "NVIDIA GeForce GTX 1080 Ti", ram_gb: 32, vram_gb: 11 },
    rtx_3060_12gb: { cpu: "AMD Ryzen test", gpu: "NVIDIA GeForce RTX 3060", ram_gb: 32, vram_gb: 12 },
    rtx_4080_4090: { cpu: "AMD Ryzen test", gpu: "NVIDIA GeForce RTX 4080 SUPER", ram_gb: 64, vram_gb: 16 },
    cpu_only: { cpu: "Intel Core i5", gpu: "GPU non déterminé", ram_gb: 16, vram_gb: null },
  }[profile];
  return {
    profile,
    tested_at: "2026-07-05T10:00:00.000Z",
    machine_label: profile,
    os: "Windows 11",
    cpu: hardware.cpu,
    gpu: hardware.gpu,
    ram_gb: hardware.ram_gb,
    vram_gb: hardware.vram_gb,
    scan_ok: true,
    score: profile === "cpu_only" ? 42 : 70,
    score_label: "test",
    recommended_model: "qwen3:0.6b",
    first_action: "benchmark",
    upgrade_recommendation: "upgrade test",
    benchmark_model: "qwen3:0.6b",
    benchmark_tokens_per_second: benchmarkSpeeds[profile],
    benchmark_elapsed_ms: 2200,
    promptforge_ok: true,
    dialogue_ok: true,
    arena_ok: true,
    report_ok: true,
    ...(profile === "cpu_only" ? {
      profile_source: "manual",
      benchmark_execution_mode: "auto",
      benchmark_runtime_processor: "cpu",
      benchmark_gpu_offload_percent: 0,
      benchmark_runtime_evidence_source: "ollama_api_ps",
    } : {}),
    first_30s: {
      hardware_visible: profile !== "cpu_only",
      score_visible: true,
      recommended_model_visible: true,
      benchmark_cta_or_proof_visible: true,
      upgrade_visible: true,
      summary: `${profile} : matériel, score, modèle, benchmark et upgrade visibles`,
    },
    share_url: `https://outilsia.fr/r/test-${profile}`,
  };
}

function fieldPayload(profile, overrides = {}) {
  return {
    schema: "outilsia.local_cockpit_field_tests.v1",
    app_version: overrides.app_version ?? "0.1.1",
    build_id: overrides.build_id ?? "fixture-build",
    machines: [{ ...baseEntry(profile), ...(overrides.machine || {}) }],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-"));
try {
  for (const profile of REQUIRED_PROFILES) {
    writeFileSync(join(dir, `outilsia-field-test-${profile}.json`), `${JSON.stringify(fieldPayload(profile), null, 2)}\n`, "utf8");
  }
  const valid = validateFieldEntries({ dir, out: join(dir, "validation.json"), failOnIncomplete: true });
  assert(valid.status === "FIELD_ENTRIES_VALID", "all entries should be valid");
  assert(valid.profiles_ready.length === REQUIRED_PROFILES.length, "all profiles should be ready");
  assert(valid.build_ids.length === 1 && valid.build_ids[0] === "fixture-build", "valid entries should expose one build_id");
  assert(valid.profiles.every((row) => row.first_30s_complete === true), "valid entries should expose UX 30s proof");
  assert(existsSync(join(dir, "validation.html")), "validator should write an HTML proof report");
  assert(readFileSync(join(dir, "validation.html"), "utf8").includes("Validation fiches terrain OutilsIA"), "HTML proof report should be readable");
  assert(readFileSync(join(dir, "validation.html"), "utf8").includes("UX 30s"), "HTML proof report should expose UX 30s column");

  const brokenDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-broken-"));
  writeFileSync(join(brokenDir, "outilsia-field-test-old_laptop.json"), `${JSON.stringify(fieldPayload("old_laptop", { machine: { promptforge_ok: false } }), null, 2)}\n`, "utf8");
  const broken = validateFieldEntries({ dir: brokenDir, out: join(brokenDir, "validation.json"), failOnIncomplete: false });
  assert(broken.status === "FIELD_ENTRIES_INCOMPLETE", "broken entries should be incomplete");
  assert(broken.next_profile_to_fix === "core_i7_gtx_1080_ti" || broken.next_profile_to_fix === "old_laptop", "next profile should be missing or incomplete");
  assert(readFileSync(join(brokenDir, "validation.html"), "utf8").includes("FIELD_ENTRIES_INCOMPLETE"), "broken HTML report should expose incomplete status");

  const missingBuildDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-no-build-"));
  writeFileSync(join(missingBuildDir, "outilsia-field-test-rtx_3060_12gb.json"), `${JSON.stringify(fieldPayload("rtx_3060_12gb", { build_id: "" }), null, 2)}\n`, "utf8");
  const missingBuild = validateFieldEntries({ dir: missingBuildDir, out: join(missingBuildDir, "validation.json"), failOnIncomplete: false });
  assert(missingBuild.status === "FIELD_ENTRIES_INCOMPLETE", "entry without build_id should be incomplete");
  assert(missingBuild.profiles.find((row) => row.profile === "rtx_3060_12gb").error.includes("build_id"), "missing build_id should be visible");

  const mixedBuildDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-mixed-build-"));
  for (const profile of REQUIRED_PROFILES) {
    writeFileSync(
      join(mixedBuildDir, `outilsia-field-test-${profile}.json`),
      `${JSON.stringify(fieldPayload(profile, { build_id: profile === "cpu_only" ? "other-build" : "fixture-build" }), null, 2)}\n`,
      "utf8"
    );
  }
  const mixedBuild = validateFieldEntries({ dir: mixedBuildDir, out: join(mixedBuildDir, "validation.json"), failOnIncomplete: false });
  assert(mixedBuild.status === "FIELD_ENTRIES_INCOMPLETE", "mixed build_id entries should be incomplete before assembly");
  assert(mixedBuild.metadata_mixed === true, "mixed build_id should set metadata_mixed");

  const duplicateShareDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-duplicate-share-"));
  for (const profile of REQUIRED_PROFILES) {
    writeFileSync(
      join(duplicateShareDir, `outilsia-field-test-${profile}.json`),
      `${JSON.stringify(fieldPayload(profile, { machine: { share_url: "https://outilsia.fr/r/same-report" } }), null, 2)}\n`,
      "utf8"
    );
  }
  const duplicateShare = validateFieldEntries({ dir: duplicateShareDir, out: join(duplicateShareDir, "validation.json"), failOnIncomplete: false });
  assert(duplicateShare.status === "FIELD_ENTRIES_INCOMPLETE", "duplicate share_url entries should be incomplete before assembly");
  assert(duplicateShare.duplicate_share_urls.length === 1, "duplicate share_url should be reported");

  const duplicateTpsDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-duplicate-tps-"));
  for (const profile of REQUIRED_PROFILES) {
    writeFileSync(
      join(duplicateTpsDir, `outilsia-field-test-${profile}.json`),
      `${JSON.stringify(fieldPayload(profile, { machine: { benchmark_tokens_per_second: 12.3 } }), null, 2)}\n`,
      "utf8"
    );
  }
  const duplicateTps = validateFieldEntries({ dir: duplicateTpsDir, out: join(duplicateTpsDir, "validation.json"), failOnIncomplete: false });
  assert(duplicateTps.status === "FIELD_ENTRIES_INCOMPLETE", "duplicate benchmark speeds should be incomplete before assembly");
  assert(duplicateTps.duplicate_benchmark_tokens_per_second.length === 1, "duplicate benchmark speed should be reported");

  console.log("field_entries_validator_ok");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
