#!/usr/bin/env node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assembleFieldTests } from "./assemble-field-tests.mjs";
import { buildStatus, missionHtml } from "./report-field-test-status.mjs";
import { REQUIRED_PROFILES, validateFieldTests } from "./import-field-tests.mjs";

const dir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-"));

function entry(profile, index) {
  const cpuOnly = profile === "cpu_only";
  const hardware = {
    old_laptop: { cpu: "Intel Core i5 mobile", gpu: "NVIDIA GTX 1050 laptop", ram_gb: 16, vram_gb: 4 },
    core_i7_gtx_1080_ti: { cpu: "Intel Core i7-7700K", gpu: "NVIDIA GeForce GTX 1080 Ti", ram_gb: 32, vram_gb: 11 },
    rtx_3060_12gb: { cpu: "AMD Ryzen fixture", gpu: "NVIDIA GeForce RTX 3060", ram_gb: 32, vram_gb: 12 },
    rtx_4080_4090: { cpu: "AMD Ryzen fixture", gpu: "NVIDIA GeForce RTX 4080 SUPER", ram_gb: 64, vram_gb: 16 },
    cpu_only: { cpu: "Intel CPU only", gpu: "CPU only / aucun GPU dédié", ram_gb: 16, vram_gb: 0 },
  }[profile];
  return {
    schema: "outilsia.local_cockpit_field_tests.v1",
    generated_at: "2026-07-04T00:00:00Z",
    app_version: "0.1.1",
    build_id: "fixture-build",
    machines: [{
      profile,
      tested_at: "2026-07-05T10:00:00.000Z",
      machine_label: `fixture ${profile}`,
      os: "Windows 11",
      cpu: hardware.cpu,
      gpu: hardware.gpu,
      ram_gb: hardware.ram_gb,
      vram_gb: hardware.vram_gb,
      scan_ok: true,
      score: cpuOnly ? 34 : 72 + index,
      score_label: cpuOnly ? "CPU-only utilisable en léger" : "Bon PC IA locale",
      recommended_model: cpuOnly ? "llama3.2:3b" : "hermes3:8b",
      first_action: "Lancer un benchmark court",
      upgrade_recommendation: cpuOnly ? "Ajouter un GPU 12 Go" : "Tester avant achat",
      benchmark_model: cpuOnly ? "llama3.2:3b" : "qwen3:0.6b",
      benchmark_tokens_per_second: cpuOnly ? 4.2 : 24.5 + index,
      benchmark_elapsed_ms: cpuOnly ? 12500 : 2200 + index,
      promptforge_ok: true,
      dialogue_ok: true,
      arena_ok: true,
      report_ok: true,
      share_url: `https://outilsia.fr/r/fixture-${profile}`,
      notes: "Fixture assembler only.",
      ...(profile === "rtx_3060_12gb" ? {
        hardware_doctor: { schema: "outilsia.hardware_doctor.v2", score: 78 },
        capability_passport_ok: true,
        capability_passport_schema: "outilsia.ai_capability_passport.v1",
        capability_passport_digest: "b".repeat(64),
        runtime_readiness: "ready",
        runtime_readiness_label: "Exécution hybride observée",
        benchmark_execution_mode: "auto",
        benchmark_runtime_processor: "hybrid",
        benchmark_gpu_offload_percent: 72.5,
        benchmark_runtime_evidence_source: "ollama_api_ps",
      } : {}),
    }],
    notes: "single-machine fixture"
  };
}

for (const [index, profile] of REQUIRED_PROFILES.entries()) {
  writeFileSync(join(dir, `${profile}.json`), `${JSON.stringify(entry(profile, index), null, 2)}\n`, "utf8");
}

const out = join(dir, "FIELD-TESTS.json");
const result = assembleFieldTests({ inputs: [], dirs: [dir], out, tester: "assembler-fixture", notes: "fixture", verifyShareUrls: false });
const payload = JSON.parse(readFileSync(out, "utf8"));
const validation = validateFieldTests(payload, { verifyShareUrls: false });

if (validation.ok !== true || result.validation.profile_count !== REQUIRED_PROFILES.length) {
  throw new Error(`Unexpected assemble result: ${JSON.stringify(result.validation)}`);
}
if (payload.machines.map((item) => item.profile).join(",") !== REQUIRED_PROFILES.join(",")) {
  throw new Error("Assembled profiles are not in required order");
}
if (payload.build_id !== "fixture-build" || payload.app_version !== "0.1.1") {
  throw new Error(`Assembled payload did not keep uniform build metadata: ${payload.build_id}/${payload.app_version}`);
}
const enrichedMachine = payload.machines.find((item) => item.profile === "rtx_3060_12gb");
if (enrichedMachine?.hardware_doctor?.schema !== "outilsia.hardware_doctor.v2" || enrichedMachine.capability_passport_digest !== "b".repeat(64)) {
  throw new Error("Assembler did not preserve enriched Doctor/Passport evidence");
}
if (validation.enriched_evidence.hardware_doctor_v2_profiles.length !== 1
  || validation.enriched_evidence.ollama_runtime_proof_profiles.length !== 1
  || validation.enriched_evidence.capability_passport_profiles.length !== 1) {
  throw new Error(`Unexpected enriched evidence summary: ${JSON.stringify(validation.enriched_evidence)}`);
}

const missingBuildDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-missing-build-"));
for (const [index, profile] of REQUIRED_PROFILES.entries()) {
  const payloadWithoutBuild = entry(profile, index);
  delete payloadWithoutBuild.build_id;
  writeFileSync(join(missingBuildDir, `${profile}.json`), `${JSON.stringify(payloadWithoutBuild, null, 2)}\n`, "utf8");
}
let failed = false;
try {
  assembleFieldTests({ inputs: [], dirs: [missingBuildDir], out: join(missingBuildDir, "FIELD-TESTS.json"), tester: "assembler-fixture", notes: "fixture", verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("Missing build_id");
}
if (!failed) throw new Error("Assembler should reject field entries without build_id");
const missingBuildStatus = buildStatus({ dir: missingBuildDir, out: join(missingBuildDir, "FIELD-TESTS-STATUS.json"), failOnIncomplete: false });
if (missingBuildStatus.status !== "FIELD_TESTS_INCOMPLETE" || missingBuildStatus.profiles_ready.length) {
  throw new Error("Field status should reject entries without build_id");
}

const mixedBuildDir = mkdtempSync(join(tmpdir(), "outilsia-field-entries-mixed-build-"));
for (const [index, profile] of REQUIRED_PROFILES.entries()) {
  const mixed = entry(profile, index);
  if (profile === "cpu_only") mixed.build_id = "other-build";
  writeFileSync(join(mixedBuildDir, `${profile}.json`), `${JSON.stringify(mixed, null, 2)}\n`, "utf8");
}
failed = false;
try {
  assembleFieldTests({ inputs: [], dirs: [mixedBuildDir], out: join(mixedBuildDir, "FIELD-TESTS.json"), tester: "assembler-fixture", notes: "fixture", verifyShareUrls: false });
} catch (error) {
  failed = String(error.message || error).includes("Mixed build_id");
}
if (!failed) throw new Error("Assembler should reject mixed build_id values");
const mixedBuildStatus = buildStatus({ dir: mixedBuildDir, out: join(mixedBuildDir, "FIELD-TESTS-STATUS.json"), failOnIncomplete: false });
if (mixedBuildStatus.status !== "FIELD_TESTS_INCOMPLETE" || mixedBuildStatus.metadata_mixed !== true) {
  throw new Error("Field status should reject mixed build_id values");
}

const status = buildStatus({ dir, out: join(dir, "FIELD-TESTS-STATUS.json"), failOnIncomplete: false });
if (status.status !== "FIELD_TESTS_READY" || status.profiles_ready.length !== REQUIRED_PROFILES.length) {
  throw new Error(`Unexpected field status: ${JSON.stringify(status)}`);
}
const html = missionHtml(status);
if (!html.includes("Mission terrain OutilsIA") || !html.includes("5</strong>")) {
  throw new Error("Mission terrain HTML does not expose ready status");
}
if (!html.includes("Doctor") || !html.includes("Passport") || !html.includes("hybrid · 72.5%")) {
  throw new Error("Mission terrain HTML does not expose optional enriched evidence");
}

console.log(`field_tests_assembler_ok profiles=${validation.profile_count} status=${status.status} out=${out}`);
